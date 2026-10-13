import { existsSync, mkdirSync, writeFileSync, readFileSync, lstatSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { registry, local, readJson, buildAcl, buildBrokerConfig } from './local-config.mjs';
import { SECRET_PATTERN } from '../server/config.mjs';

if (!existsSync(local) || lstatSync(local).isSymbolicLink()) throw new Error('Run setup-local.ps1 to create protected .local first');
const directory = join(local, 'mosquitto');
mkdirSync(join(directory, 'data'), { recursive: true });
const accountsFile = join(directory, 'accounts.json');
const users = ['khoguard-backend', 'khoguard-observer', ...registry.devices.map(device => device.id)];
let accounts;
if (existsSync(accountsFile)) {
  accounts = readJson(accountsFile);
  if (users.some(user => !SECRET_PATTERN.test(accounts[user] ?? '')) || Object.keys(accounts).length !== users.length) {
    throw new Error('Existing account file does not match registry; do not overwrite credentials');
  }
} else {
  accounts = Object.fromEntries(users.map(user => [user, randomBytes(24).toString('hex')]));
  writeFileSync(accountsFile, JSON.stringify(accounts, null, 2) + '\n', { flag: 'wx' });
}
const passwordFile = join(directory, 'passwords');
if (!existsSync(passwordFile)) {
  // mosquitto_passwd owns the hash format; generated passwords never enter logs.
  const pending = join(directory, `passwords-${randomUUID()}.pending`);
  try {
    for (const [index, user] of users.entries()) {
      const args = ['-b', ...(index === 0 ? ['-c'] : []), pending, user, accounts[user]];
      const result = spawnSync('C:/Program Files/Mosquitto/mosquitto_passwd.exe', args, { windowsHide: true, stdio: 'ignore' });
      if (result.status !== 0) throw new Error(`Password utility failed for ${user}`);
    }
    renameSync(pending, passwordFile);
  } finally {
    if (existsSync(pending)) unlinkSync(pending);
  }
}
const hashedUsers = readFileSync(passwordFile, 'utf8').trim().split(/\r?\n/).map(line => line.split(':')[0]);
if (hashedUsers.length !== users.length || users.some(user => !hashedUsers.includes(user))) throw new Error('Password file is incomplete; do not use it');
writeFileSync(join(directory, 'acl'), buildAcl());
const tls = join(local, 'tls');
writeFileSync(join(directory, 'mosquitto.conf'), buildBrokerConfig(directory, existsSync(join(tls, 'server.crt')) ? { tls } : {}));
const runtimeFile = join(local, 'runtime.env');
if (!existsSync(runtimeFile)) {
  const template = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
  writeFileSync(runtimeFile, template.replace('MQTT_PASSWORD=\n', `MQTT_PASSWORD=${accounts['khoguard-backend']}\n`), { flag: 'wx' });
}
const adminFile = join(local, 'mysql-admin.env');
if (!existsSync(adminFile)) writeFileSync(adminFile, readFileSync(new URL('../infra/mysql-admin.env.example', import.meta.url)), { flag: 'wx' });
console.log('MQTT config ready: localhost:18884, 7 accounts, default-deny ACL. Secrets are only in protected .local/.');
