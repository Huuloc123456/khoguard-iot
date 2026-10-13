import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { local } from './local-config.mjs';

const config = join(local, 'mosquitto', 'mosquitto.conf');
if (!existsSync(config)) throw new Error('Run npm run infra:setup first');
const ports = readFileSync(config, 'utf8').includes('listener 18885') ? [18884, 18885] : [18884];
for (const port of ports) {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', () => reject(new Error(`Port ${port} is occupied; do not stop unrelated processes`)));
    probe.listen(port, '127.0.0.1', () => probe.close(resolve));
  });
}
const broker = spawn('C:/Program Files/Mosquitto/mosquitto.exe', ['-c', config], { windowsHide: true, stdio: 'inherit' });
broker.on('error', () => { console.error('Could not start project Mosquitto'); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => broker.kill());
broker.on('exit', code => { process.exitCode = code ?? 0; });
