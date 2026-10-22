import test from 'node:test';
import assert from 'node:assert/strict';
import { prng, SimDevice, ZONE_TEMPERATURE } from '../scripts/sim-lib.mjs';
import { validateMqttMessage } from '../contracts/validate.js';
import { newDoor, stepDoor, doorAlarm, newClimate, stepTemperature, stepOccupancy, INCIDENTS } from '../scripts/sim-behaviour.mjs';

const sequence = values => { let i = 0; return () => values[i++ % values.length]; };

test('door alarms use the firmware thresholds: warning from 30 s, critical after 60 s', () => {
  const door = { open: true, since: 0, until: 999999 };
  assert.equal(doorAlarm('D04', door, 29999), null);
  assert.deepEqual(doorAlarm('D04', door, 30000), { code: 'DOOR_OPEN_WARNING', door_id: 'D04' });
  assert.equal(doorAlarm('D04', door, 60000).code, 'DOOR_OPEN_WARNING');
  assert.equal(doorAlarm('D04', door, 60001).code, 'DOOR_OPEN_CRITICAL');
  assert.equal(doorAlarm('D04', { ...door, open: false }, 90000), null);
});

test('a door opens on a low roll, long openings outlast the warning, and it closes on time', () => {
  const door = newDoor();
  assert.equal(stepDoor(door, 0, sequence([0.5])), null);
  // open roll, long roll, duration roll at the top of the 35-75 s range
  assert.equal(stepDoor(door, 2000, sequence([0.001, 0.01, 1])), 'opened');
  assert.equal(door.until - door.since, 75000);
  assert.equal(stepDoor(door, 76000, sequence([0])), null);
  assert.equal(stepDoor(door, 77000, sequence([0])), 'closed');
});

test('zone B leaves its 2-8 °C range during an incident and settles back so the alert can resolve', () => {
  const random = prng(17), [lo, hi] = ZONE_TEMPERATURE.B, climate = newClimate('B');
  let t = 5, max = -Infinity, before = [], after = [];
  for (let now = 2000; now <= 600000; now += 2000) {
    t = stepTemperature(climate, 'B', t, [lo, hi], now, random);
    if (now < INCIDENTS.B.firstMs) before.push(t);
    if (now > 200000 && now < INCIDENTS.B.firstMs + INCIDENTS.B.everyMs) after.push(t);
    max = Math.max(max, t);
  }
  assert.ok(before.every(v => v >= lo + 0.6 && v <= hi - 0.6), 'normal ticks stay inside the range');
  assert.ok(max > hi && max <= INCIDENTS.B.peak + 0.1, `peak ${max} must exceed ${hi} °C`);
  assert.ok(after.every(v => v <= hi - 0.5), 'after cooling the value is inside the 0.5 °C hysteresis');
});

test('occupancy drifts by at most one person per tick within 0..4', () => {
  const random = prng(3);
  let count = 0;
  for (let i = 0; i < 2000; i++) {
    const next = stepOccupancy(count, random);
    assert.ok(Math.abs(next - count) <= 1 && next >= 0 && next <= 4);
    count = next;
  }
});

test('a lively telemetry frame with open_ms and alarms still passes the MQTT contract', () => {
  const device = new SimDevice('SIM-B01', { config: {}, accounts: {} });
  Object.assign(device.state, { temperature: 9.2, humidity: 60, count: 1, presence: true });
  Object.assign(device.state.doors.D04, { state: 'open', open_ms: 65000 });
  device.state.alarms = [{ code: 'DOOR_OPEN_CRITICAL', door_id: 'D04' }];
  const frame = device.envelope('telemetry', device.telemetryPayload());
  assert.equal(validateMqttMessage(device.topic('telemetry'), JSON.stringify(frame)).ok, true);
  const event = device.envelope('events', { door_id: 'D04', event_type: 'door', state: 'open' });
  event.event_id = `${event.boot_id}:${event.seq}`;
  assert.equal(validateMqttMessage(device.topic('events'), JSON.stringify(event)).ok, true);
});
