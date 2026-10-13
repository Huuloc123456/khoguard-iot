import assert from 'node:assert/strict';
import { validateMqttMessage } from '../contracts/validate.js';

export function acceptFirmwareSample(samples, topic, raw, packet, expectedBoot) {
  if (packet.retain) return false;
  const result = validateMqttMessage(topic, raw);
  assert.equal(result.ok, true, 'Live firmware message must satisfy the MQTT contract');
  const value = result.value;
  assert.equal(value.device_id, 'ESP-C01');
  assert.equal(value.kind, 'telemetry');
  assert.equal(packet.qos, 1, 'Live telemetry must arrive at QoS1');
  assert.match(value.boot_id, /^[a-f0-9]{32}$/);
  assert.match(value.session_id, /^[a-f0-9]{32}$/);
  if (expectedBoot) assert.equal(value.boot_id, expectedBoot, 'Boot ID must match the Wokwi serial monitor');
  assert.equal(value.clock_synced, false);
  assert.equal(value.sent_at, null);
  assert.equal(value.payload.controller_revision, 0);
  assert.deepEqual(value.payload.occupancy, { current_occupants: null, count_verified: false, presence: null });
  for (const door of value.payload.doors) {
    assert.equal(door.state, 'unknown');
    assert.equal(door.beam_clear, null);
    assert.equal(door.panic_latched, null);
    assert.equal(door.local_inputs_healthy, false);
  }
  const last = samples.at(-1);
  if (last && last.boot_id === value.boot_id && last.session_id === value.session_id) {
    if (last.seq === value.seq) return false;
    assert.ok(value.seq > last.seq && value.uptime_ms > last.uptime_ms, 'Sequence and uptime must advance');
  } else samples.length = 0;
  samples.push(value);
  return true;
}
