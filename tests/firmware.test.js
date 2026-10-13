import test from 'node:test';
import assert from 'node:assert/strict';
import { firmwareSecrets } from '../scripts/local-config.mjs';
import { readFileSync } from 'node:fs';
import { acceptFirmwareSample } from '../scripts/firmware-observation.mjs';

test('firmware gets only its own device credential and the private gateway endpoint', () => {
  const text = firmwareSecrets('a'.repeat(48));
  assert.match(text, /MQTT_USER\[\] = "ESP-C01"/);
  assert.match(text, /MQTT_HOST\[\] = "host\.wokwi\.internal"/);
  assert.match(text, /MQTT_PORT = 18884/);
  assert.doesNotMatch(text, /khoguard-backend|khoguard-observer|mysql/i);
});

test('malformed secrets cannot inject C++ into the generated header', () => {
  for (const password of [undefined, '', ['a'.repeat(48)], 'a'.repeat(47), 'A'.repeat(48), '";\n#error injected']) {
    assert.throws(() => firmwareSecrets(password), /credential/);
  }
});

const topic = 'khoguard/v1/WH01/devices/ESP-C01/telemetry';
function sample(seq = 1) {
  const value = JSON.parse(readFileSync(new URL('../contracts/examples.json', import.meta.url)))[0].message;
  Object.assign(value, { boot_id: 'a'.repeat(32), session_id: 'b'.repeat(32), seq, uptime_ms: seq * 2000, clock_synced: false, sent_at: null });
  value.payload.controller_revision = 0;
  value.payload.occupancy = { current_occupants: null, count_verified: false, presence: null };
  value.payload.doors = ['D07', 'D08'].map(door_id => ({ door_id, state: 'unknown', beam_clear: null, panic_latched: null, local_inputs_healthy: false }));
  return value;
}
const live = { retain: false, qos: 1 };
const accept = (samples, value, packet = live, boot) => acceptFirmwareSample(samples, topic, JSON.stringify(value), packet, boot);

test('retained frames and QoS1 duplicates do not count as new live samples', () => {
  const samples = [];
  assert.equal(accept(samples, sample(), { retain: true, qos: 1 }), false);
  assert.equal(samples.length, 0);
  assert.equal(accept(samples, sample()), true);
  assert.equal(accept(samples, sample()), false);
  assert.equal(samples.length, 1);
  assert.equal(accept(samples, sample(2)), true);
});

test('observer rejects wrong boot, invalid schema, false safe defaults and out-of-order frames', () => {
  assert.throws(() => accept([], sample(), live, 'c'.repeat(32)), /Boot ID/);
  assert.throws(() => accept([], sample(), { retain: false, qos: 0 }), /QoS1/);
  const bad = sample();
  bad.payload.occupancy.current_occupants = 0;
  assert.throws(() => accept([], bad));
  bad.schema_version = 2;
  assert.throws(() => accept([], bad), /contract/);
  const samples = [];
  accept(samples, sample(2));
  assert.throws(() => accept(samples, sample(1)), /advance/);
});

test('new MQTT session starts a new live sample window', () => {
  const samples = [];
  accept(samples, sample());
  const next = sample(2);
  next.session_id = 'c'.repeat(32);
  assert.equal(accept(samples, next), true);
  assert.equal(samples.length, 1);
  assert.equal(samples[0].session_id, next.session_id);
});
