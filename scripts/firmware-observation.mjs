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
  if (!value.payload.occupancy.count_verified) assert.equal(value.payload.occupancy.current_occupants, null, 'Unverified count must remain unknown');
  for (const door of value.payload.doors) {
    if (door.local_inputs_healthy) {
      assert.notEqual(door.state, 'unknown', 'A healthy door must have a known state');
      assert.notEqual(door.beam_clear, null, 'A healthy door must have a known beam signal');
      assert.notEqual(door.panic_latched, null, 'A healthy door must have a known panic signal');
    }
  }
  const last = samples.at(-1);
  if (last && last.boot_id === value.boot_id && last.session_id === value.session_id) {
    if (last.seq === value.seq) return false;
    assert.ok(value.seq > last.seq && value.uptime_ms > last.uptime_ms, 'Sequence and uptime must advance');
    assert.ok(value.payload.controller_revision >= last.payload.controller_revision, 'Controller revision must not decrease');
  } else samples.length = 0;
  samples.push(value);
  return true;
}
