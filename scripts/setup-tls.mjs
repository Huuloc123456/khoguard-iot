import { existsSync, mkdirSync, writeFileSync, readFileSync, lstatSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { local, buildBrokerConfig, serverCertificateExtensions } from './local-config.mjs';

// M12: demo CA + broker certificate in protected .local/tls. Keys never leave .local and are never printed.
const candidates = [process.env.OPENSSL, 'openssl', 'C:/Program Files/Git/usr/bin/openssl.exe', 'C:/Program Files/OpenSSL-Win64/bin/openssl.exe'].filter(Boolean);
// Git for Windows' MSYS runtime rewrites "/CN=..." into a path unless conversion is disabled.
const env = { ...process.env, MSYS_NO_PATHCONV: '1', MSYS2_ARG_CONV_EXCL: '*' };
const openssl = candidates.find(bin => spawnSync(bin, ['version'], { windowsHide: true, stdio: 'ignore', env }).status === 0);
try {
  if (!existsSync(local) || lstatSync(local).isSymbolicLink()) throw new Error('Run infra:setup first to create protected .local');
  if (!openssl) throw new Error('OpenSSL not found; install Git for Windows or set OPENSSL to openssl.exe');
  const dir = join(local, 'tls');
  mkdirSync(dir, { recursive: true });
  if (lstatSync(dir).isSymbolicLink()) throw new Error('TLS directory must not be a link');
  const files = ['ca.key', 'ca.crt', 'server.key', 'server.crt'].map(name => join(dir, name));
  const present = files.filter(existsSync).length;
  if (present > 0 && present < files.length) throw new Error('Partial TLS files in .local/tls; inspect them, do not overwrite');
  const run = args => { if (spawnSync(openssl, args, { cwd: dir, windowsHide: true, stdio: 'ignore', env }).status !== 0) throw new Error(`openssl ${args[0]} failed`); };
  if (!present) {
    const ext = join(dir, 'server.ext'), csr = join(dir, 'server.csr');
    writeFileSync(ext, serverCertificateExtensions());
    try {
      run(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '825', '-subj', '/CN=KhoGuard Demo CA',
        '-addext', 'basicConstraints=critical,CA:TRUE,pathlen:0', '-addext', 'keyUsage=critical,keyCertSign,cRLSign', '-keyout', 'ca.key', '-out', 'ca.crt']);
      run(['req', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-subj', '/CN=localhost', '-keyout', 'server.key', '-out', 'server.csr']);
      run(['x509', '-req', '-in', 'server.csr', '-CA', 'ca.crt', '-CAkey', 'ca.key', '-CAcreateserial', '-days', '397', '-sha256', '-extfile', 'server.ext', '-out', 'server.crt']);
    } finally { for (const file of [ext, csr]) if (existsSync(file)) unlinkSync(file); }
  }
  const broker = join(local, 'mosquitto', 'mosquitto.conf');
  if (existsSync(broker)) {
    // Keep lines the user added after the generated template (for example `user`), replace only the generated part.
    const extra = readFileSync(broker, 'utf8').split(/\r?\n/).filter(line => /^user\s/.test(line));
    writeFileSync(broker, buildBrokerConfig(join(local, 'mosquitto'), { tls: dir }) + (extra.length ? `${extra.join('\n')}\n` : ''));
  }
  const runtime = join(local, 'runtime.env');
  if (existsSync(runtime)) writeFileSync(runtime, readFileSync(runtime, 'utf8').replace(/^MQTT_PORT=18884$/m, 'MQTT_PORT=18885'));
  console.log(`TLS ready in .local/tls (${present ? 'existing files kept' : 'new demo CA'}); broker adds 127.0.0.1:18885; backend uses MQTT_PORT=18885. Restart broker/backend and run firmware:prepare. No key printed.`);
} catch (error) {
  console.error(`TLS setup failed: ${error.message}. No key material displayed.`);
  process.exitCode = 1;
}
