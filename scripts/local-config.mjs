import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const local = fileURLToPath(new URL('../.local/', import.meta.url));
export const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
export const registry = readJson(new URL('../contracts/devices.json', import.meta.url));

export function buildAcl() {
  const prefix = 'khoguard/v1/WH01/devices/';
  const outgoing = ['telemetry', 'events', 'status', 'acks'];
  const block = (user, topics) => `user ${user}\n${topics.join('\n')}\n`;
  return '# Generated from contracts/devices.json; default deny.\n'
    + block('khoguard-backend', [...outgoing.map(kind => `topic read ${prefix}+/${kind}`), `topic write ${prefix}+/commands`])
    + '\n' + block('khoguard-observer', [...outgoing, 'commands'].map(kind => `topic read ${prefix}+/${kind}`))
    + '\n' + registry.devices.map(device => block(device.id, [
      ...outgoing.map(kind => `topic write ${prefix}${device.id}/${kind}`), `topic read ${prefix}${device.id}/commands`,
    ])).join('\n');
}

export function buildBrokerConfig(directory) {
  if (!/^(?:[A-Za-z]:[\\/]|\/)/.test(directory) || /[\r\n\0]/.test(directory)) throw new Error('Invalid broker directory');
  return readFileSync(new URL('../infra/mosquitto/mosquitto.conf.example', import.meta.url), 'utf8')
    .replaceAll('@LOCAL_DIR@', directory.replaceAll('\\', '/').replace(/\/$/, ''));
}

export function readAdminConfig(text) {
  const env = parseEnv(text);
  for (const name of ['MYSQL_ADMIN_USER', 'MYSQL_ADMIN_PASSWORD']) {
    if (!env[name]?.trim()) throw new Error(`Missing ${name} in .local/mysql-admin.env`);
  }
  return { user: env.MYSQL_ADMIN_USER, password: env.MYSQL_ADMIN_PASSWORD };
}

export function provisionSql(runtimePassword, migrationPassword) {
  if (![runtimePassword, migrationPassword].every(value => /^[a-f0-9]{48}$/.test(value))) throw new Error('Invalid generated password');
  return readFileSync(new URL('../db/bootstrap.sql', import.meta.url), 'utf8')
    .replaceAll('@RUNTIME_PASSWORD@', runtimePassword).replaceAll('@MIGRATION_PASSWORD@', migrationPassword);
}
