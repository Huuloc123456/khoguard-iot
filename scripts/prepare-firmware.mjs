import { mkdirSync, writeFileSync, renameSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { local, readJson, firmwareSecrets } from './local-config.mjs';

try {
  if (lstatSync(local).isSymbolicLink()) throw new Error('Local directory must not be a link');
  const text = firmwareSecrets(readJson(join(local, 'mosquitto', 'accounts.json'))['ESP-C01']);
  const directory = join(local, 'firmware');
  mkdirSync(directory, { recursive: true });
  if (lstatSync(directory).isSymbolicLink()) throw new Error('Firmware secret directory must not be a link');
  const temporary = join(directory, `${randomUUID()}.tmp`);
  writeFileSync(temporary, text, { flag: 'wx' });
  renameSync(temporary, join(directory, 'kg_secrets.h'));
  console.log('Firmware credential prepared in protected .local/firmware; no secret printed.');
} catch {
  console.error('Cannot prepare firmware credential. Run infra:setup and check .local access; no credential contents displayed.');
  process.exitCode = 1;
}
