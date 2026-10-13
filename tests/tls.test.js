import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBrokerConfig, firmwareSecrets, serverCertificateExtensions } from '../scripts/local-config.mjs';
import { readConfig } from '../server/config.mjs';
import { brokerOptions } from '../server/mqtt.mjs';

const ca = '-----BEGIN CERTIFICATE-----\nMIIBszCCAVmgAwIBAgIUQ0FfZGVtbw==\n-----END CERTIFICATE-----\n';
const env = { DB_HOST:'127.0.0.1', DB_PORT:'3306', DB_NAME:'khoguard_demo', DB_USER:'khoguard_runtime', DB_PASSWORD:'a'.repeat(48), MQTT_HOST:'127.0.0.1', MQTT_PORT:'18885', MQTT_USERNAME:'khoguard-backend', MQTT_PASSWORD:'c'.repeat(48) };

test('server certificate names exactly the hosts clients use, and is not a CA', () => {
  const ext = serverCertificateExtensions();
  assert.match(ext, /subjectAltName\s*=\s*DNS:localhost,DNS:host\.wokwi\.internal,IP:127\.0\.0\.1/);
  assert.match(ext, /basicConstraints\s*=\s*critical,CA:FALSE/);
  assert.match(ext, /extendedKeyUsage\s*=\s*serverAuth/);
});

test('TLS listener 18885 is added on loopback only when the demo CA exists; plain 18884 stays localhost', () => {
  const plain = buildBrokerConfig('D:/demo/.local/mosquitto');
  assert.doesNotMatch(plain, /18885/);
  const tls = buildBrokerConfig('D:/demo/.local/mosquitto', { tls: 'D:/demo/.local/tls' });
  assert.match(tls, /listener 18884 127\.0\.0\.1/);
  assert.match(tls, /listener 18885 127\.0\.0\.1\ncafile D:\/demo\/\.local\/tls\/ca\.crt\ncertfile D:\/demo\/\.local\/tls\/server\.crt\nkeyfile D:\/demo\/\.local\/tls\/server\.key\ntls_version tlsv1\.2/);
  assert.throws(() => buildBrokerConfig('D:/demo/.local/mosquitto', { tls: 'D:/x\nallow_anonymous true' }));
});

test('firmware uses TLS port and pins the demo CA when given; malformed PEM cannot inject C++', () => {
  const text = firmwareSecrets('a'.repeat(48), ca);
  assert.match(text, /MQTT_PORT = 18885/);
  assert.match(text, /#define MQTT_CA_CERT KG_CA_PEM/);
  assert.match(text, /constexpr char KG_CA_PEM\[\] = R"PEM\(-----BEGIN CERTIFICATE-----/);
  assert.match(firmwareSecrets('a'.repeat(48)), /MQTT_PORT = 18884/);
  for (const bad of ['not a cert', `${ca})PEM";\n#error x`, ca.replace('MIIB', 'MI"IB')]) assert.throws(() => firmwareSecrets('a'.repeat(48), bad), /certificate/);
});

test('backend accepts TLS port 18885 and verifies the CA; any other broker port is refused', () => {
  const config = readConfig(env);
  assert.equal(config.mqtt.tls, true);
  assert.equal(readConfig({ ...env, MQTT_PORT:'18884' }).mqtt.tls, false);
  assert.throws(() => readConfig({ ...env, MQTT_PORT:'8883' }), /MQTT_PORT/);
  const options = brokerOptions(config.mqtt, ca);
  assert.deepEqual([options.protocol, options.rejectUnauthorized, options.ca], ['mqtts', true, ca]);
  assert.throws(() => brokerOptions(config.mqtt, null), /CA/);
  assert.equal(brokerOptions(readConfig({ ...env, MQTT_PORT:'18884' }).mqtt).protocol, 'mqtt');
});
