import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { root } from './local-config.mjs';

const files = ['mysql-admin.env', 'runtime.env', 'mosquitto/accounts.json', 'mysql-users.json',
  'firmware/kg_secrets.h', 'firmware-build/esp32dev/firmware.bin', 'firmware-build/esp32dev/firmware.elf',
  'tls/ca.key', 'tls/server.key', 'dashboard-users.json'];
for (const file of files) {
  const ignored = spawnSync('git', ['check-ignore', '--quiet', `.local/${file}`], { cwd: root, windowsHide: true });
  assert.equal(ignored.status, 0, 'Local credential file must be ignored by Git');
}
const urls = files.map(file => '/.local/' + file);
urls.push('/@fs/' + join(root, '.local', 'mysql-users.json').replaceAll('\\', '/'));
for (const path of urls) {
  const response = await fetch('http://127.0.0.1:5173' + path, { signal: AbortSignal.timeout(3000) });
  assert.equal(response.status, 403, 'Vite must reject local credential paths');
  await response.body?.cancel();
}
console.log(`Secrets PASS: ${files.length} files ignored by Git, ${urls.length} HTTP routes denied with 403; no secret contents read.`);
