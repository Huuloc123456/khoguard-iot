import assert from 'node:assert/strict';
import { randomUUID, X509Certificate } from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import mqtt from 'mqtt';
import { local, readJson } from './local-config.mjs';
import { readConfig } from '../server/config.mjs';
import { brokerOptions } from '../server/mqtt.mjs';

// M12: the TLS listener accepts only clients that verify the demo CA and hostname, and keeps password + ACL rules.
const config = readConfig(process.env);
const accounts = readJson(join(local, 'mosquitto', 'accounts.json'));
const ca = readFileSync(join(local, 'tls', 'ca.crt'), 'utf8');
const checks = [], clients = [];
let stage = 'certificate', rogue;
const base = { host: '127.0.0.1', port: 18885, protocolVersion: 4, reconnectPeriod: 0, connectTimeout: 3000, clean: true };
const connect = async (options) => {
  const client = await mqtt.connectAsync({ ...base, clientId: `kg-tls-${randomUUID()}`, ...options });
  clients.push(client);
  return client;
};
const device = { username: 'ESP-C01', password: accounts['ESP-C01'] };
const tls = (extra = {}) => ({ protocol: 'mqtts', ca, rejectUnauthorized: true, ...extra });
const deadline = setTimeout(() => { console.error('TLS check timed out'); process.exit(1); }, 30000);
deadline.unref();
try {
  assert.equal(config.mqtt.port, 18885, 'run infra:tls:setup so the backend uses MQTT/TLS');
  const cert = new X509Certificate(readFileSync(join(local, 'tls', 'server.crt')));
  assert.equal(cert.checkIssued(new X509Certificate(ca)), true);
  assert.equal(cert.subjectAltName, 'DNS:localhost, DNS:host.wokwi.internal, IP Address:127.0.0.1');
  assert.equal(cert.ca, false);
  assert.ok(Date.parse(cert.validTo) > Date.now() + 30 * 86400000, 'certificate valid for at least 30 more days');
  checks.push('server certificate issued by the demo CA, SAN localhost/host.wokwi.internal/127.0.0.1, not a CA');

  stage = 'valid TLS';
  const ok = await connect({ ...tls(), ...device });
  const backend = await connect({ ...brokerOptions(config.mqtt), clientId: `kg-tls-${randomUUID()}`, ...base, protocol: 'mqtts' });
  assert.equal(ok.stream.getProtocol().startsWith('TLSv1.'), true);
  assert.ok(['TLSv1.2', 'TLSv1.3'].includes(ok.stream.getProtocol()));
  const topic = 'khoguard/v1/WH01/devices/ESP-C01/telemetry';
  const marker = `tls-probe-${randomUUID()}`;
  const got = new Promise(resolve => {
    const receive = (name, payload, packet) => {
      if (name !== topic || packet.retain || payload.toString() !== marker) return;
      backend.off('message', receive);
      resolve({payload:payload.toString(),qos:packet.qos});
    };
    backend.on('message', receive);
  });
  await backend.subscribeAsync(topic, { qos: 1 });
  await ok.publishAsync(topic, marker, { qos: 1, retain: false });
  assert.deepEqual(await got, {payload:marker,qos:1});
  checks.push(`device and backend connect over ${ok.stream.getProtocol()} verifying CA + hostname 127.0.0.1; delivery works`);

  stage = 'wrong CA';
  await assert.rejects(connect({ protocol: 'mqtts', rejectUnauthorized: true, ...device }), e => /self.signed|unable to verify|UNABLE_TO_GET_ISSUER/i.test(`${e.code} ${e.message}`));
  rogue = mkdtempSync(join(tmpdir(), 'kg-rogue-'));
  const made = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=Rogue CA', '-keyout', join(rogue, 'k'), '-out', join(rogue, 'c')], { stdio: 'ignore', env: { ...process.env, MSYS_NO_PATHCONV: '1' } });
  if (made.status === 0) {
    await assert.rejects(connect({ ...tls({ ca: readFileSync(join(rogue, 'c'), 'utf8') }), ...device }), e => /self.signed|unable to verify|UNABLE_TO_GET_ISSUER/i.test(`${e.code} ${e.message}`));
    checks.push('system CA store and a rogue CA are both rejected');
  } else checks.push('system CA store rejected (rogue CA step skipped: openssl not on PATH)');

  stage = 'wrong hostname';
  await assert.rejects(connect({ ...tls({ servername: 'broker.example.com' }), ...device }), e => e.code === 'ERR_TLS_CERT_ALTNAME_INVALID');
  checks.push('hostname not in the certificate (broker.example.com) rejected');

  stage = 'plain on TLS port';
  await assert.rejects(connect({ protocol: 'mqtt', connectTimeout: 1500, ...device }));
  checks.push('plain MQTT to 18885 does not connect');

  stage = 'auth and ACL over TLS';
  await assert.rejects(connect({ ...tls(), username: 'ESP-C01', password: 'wrong' }), e => e.code === 5 || e.code === 135);
  await assert.rejects(connect({ ...tls() }), e => e.code === 5 || e.code === 135);
  // MQTT 3.1.1 acknowledges a denied publish silently; MQTT 5 reports reason 135, so the ACL is checked with v5.
  const v5 = await connect({ ...tls(), ...device, protocolVersion: 5 });
  await assert.rejects(v5.publishAsync(topic.replace('ESP-C01', 'SIM-B01'), 'x', { qos: 1 }), e => e.code === 135);
  checks.push('wrong password/anonymous refused and cross-device publish denied on the TLS listener');

  writeFileSync(join(local, 'tls-check.json'), JSON.stringify({ checked_at: new Date().toISOString(), checks }, null, 2));
  console.log(`M12 TLS PASS: ${checks.length} groups.`);
  for (const check of checks) console.log(`- ${check}`);
} catch (error) {
  console.error(`M12 TLS check failed at ${stage} (${error.code ?? error.name}: ${error.message}); no key or password printed.`);
  process.exitCode = 1;
} finally {
  clearTimeout(deadline);
  if (rogue) rmSync(rogue, { recursive: true, force: true });
  await Promise.allSettled(clients.map(c => c.endAsync(true)));
}
