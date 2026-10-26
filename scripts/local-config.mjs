import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { SECRET_PATTERN } from '../server/config.mjs';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const local = fileURLToPath(new URL('../.local/', import.meta.url));
export const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
export const registry = readJson(new URL('../contracts/devices.json', import.meta.url));

const PEM = /^-----BEGIN CERTIFICATE-----\n(?:[A-Za-z0-9+/=]{1,64}\n)+-----END CERTIFICATE-----\n?$/;
// Only the active ESP-C01 MQTT credential is compiled into firmware.
export function firmwareSecrets(password, caPem, user = 'ESP-C01') {
  if (!registry.devices.some(device => device.id === user && device.source === 'wokwi')) throw new Error('Invalid firmware device credential');
  if (typeof password !== 'string' || !SECRET_PATTERN.test(password)) throw new Error(`Invalid ${user} credential`);
  if (caPem !== undefined && (typeof caPem !== 'string' || !PEM.test(caPem.replaceAll('\r\n', '\n')))) throw new Error('Invalid CA certificate');
  // With the demo CA the edge uses MQTT/TLS 18885 and verifies hostname + CA; without it, the localhost-only 18884 demo port.
  return '#pragma once\n'
    + 'constexpr char MQTT_HOST[] = "host.wokwi.internal";\n'
    + `constexpr int MQTT_PORT = ${caPem ? 18885 : 18884};\n`
    + `constexpr char MQTT_USER[] = "${user}";\n`
    + `constexpr char MQTT_PASSWORD[] = "${password}";\n`
    + (caPem ? `constexpr char KG_CA_PEM[] = R"PEM(${caPem.replaceAll('\r\n', '\n')})PEM";\n#define MQTT_CA_CERT KG_CA_PEM\n` : '');
}

// The broker certificate names only the hostnames clients really use: backend (127.0.0.1/localhost) and the Wokwi gateway.
export function serverCertificateExtensions() {
  return ['basicConstraints = critical,CA:FALSE', 'keyUsage = critical,digitalSignature,keyEncipherment',
    'extendedKeyUsage = serverAuth', 'subjectAltName = DNS:localhost,DNS:host.wokwi.internal,IP:127.0.0.1', ''].join('\n');
}

export function buildAcl() {
  const prefix = 'khoguard/v1/WH01/devices/';
  const outgoing = ['telemetry', 'events', 'status', 'acks'];
  const block = (user, topics) => `user ${user}\n${topics.join('\n')}\n`;
  return '# Generated from contracts/devices.json; default deny.\n'
    + block('khoguard-backend', registry.devices.flatMap(device=>[...outgoing.map(kind => `topic read ${prefix}${device.id}/${kind}`), `topic write ${prefix}${device.id}/commands`]))
    + '\n' + block('khoguard-observer', registry.devices.flatMap(device=>[...outgoing, 'commands'].map(kind => `topic read ${prefix}${device.id}/${kind}`)))
    + '\n' + registry.devices.map(device => block(device.id, [
      ...outgoing.map(kind => `topic write ${prefix}${device.id}/${kind}`), `topic read ${prefix}${device.id}/commands`,
    ])).join('\n');
}

const safeDirectory = directory => {
  if (!/^(?:[A-Za-z]:[\\/]|\/)/.test(directory) || /[\r\n\0]/.test(directory)) throw new Error('Invalid broker directory');
  return directory.replaceAll('\\', '/').replace(/\/$/, '');
};
export function buildBrokerConfig(directory, { tls } = {}) {
  const config = readFileSync(new URL('../infra/mosquitto/mosquitto.conf.example', import.meta.url), 'utf8')
    .replaceAll('@LOCAL_DIR@', safeDirectory(directory));
  if (!tls) return config;
  const dir = safeDirectory(tls);
  return `${config.trimEnd()}\n\n# M12: MQTT/TLS on loopback; same accounts and ACL as 18884.\nlistener 18885 127.0.0.1\n`
    + `cafile ${dir}/ca.crt\ncertfile ${dir}/server.crt\nkeyfile ${dir}/server.key\ntls_version tlsv1.2\n`;
}

export function readAdminConfig(text) {
  const env = parseEnv(text);
  for (const name of ['MYSQL_ADMIN_USER', 'MYSQL_ADMIN_PASSWORD']) {
    if (!env[name]?.trim()) throw new Error(`Missing ${name} in .local/mysql-admin.env`);
  }
  return { user: env.MYSQL_ADMIN_USER, password: env.MYSQL_ADMIN_PASSWORD };
}

export function provisionSql(runtimePassword, migrationPassword) {
  if (![runtimePassword, migrationPassword].every(value => SECRET_PATTERN.test(value))) throw new Error('Invalid generated password');
  return readFileSync(new URL('../db/bootstrap.sql', import.meta.url), 'utf8')
    .replaceAll('@RUNTIME_PASSWORD@', runtimePassword).replaceAll('@MIGRATION_PASSWORD@', migrationPassword);
}
