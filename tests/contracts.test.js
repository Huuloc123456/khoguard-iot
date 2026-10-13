import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registry, validateMqttMessage, validateSnapshot } from '../contracts/validate.js';

const examples = JSON.parse(readFileSync(new URL('../contracts/examples.json', import.meta.url), 'utf8'));
const snapshot = JSON.parse(readFileSync(new URL('../contracts/snapshot.example.json', import.meta.url), 'utf8'));
const telemetry = examples.find(example => example.message.kind === 'telemetry');
const copy = value => structuredClone(value);
const validate = message => validateMqttMessage(telemetry.topic, JSON.stringify(message));
const code = result => result.error?.code;

test('unknown WMS totals stay null but any known portion still cannot exceed capacity', () => {
  const value=copy(snapshot);
  value.zones[0].occupied=null;value.zones[0].reserved=null;
  assert.equal(validateSnapshot(value).ok,true);
  value.zones[0].occupied=value.zones[0].capacity+1;
  assert.equal(validateSnapshot(value).ok,false);
  value.zones[0].occupied=null;value.zones[0].reserved=value.zones[0].capacity+1;
  assert.equal(validateSnapshot(value).ok,false);
});

test('all MQTT examples satisfy the contract without changing input', () => {
  for (const example of examples) {
    const raw = JSON.stringify(example.message);
    const result = validateMqttMessage(example.topic, raw);
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.equal(JSON.stringify(result.value), raw);
  }
});

test('malformed JSON, invalid UTF-8 and oversized messages are rejected', () => {
  assert.equal(code(validateMqttMessage(telemetry.topic, '{')), 'INVALID_JSON');
  assert.equal(code(validateMqttMessage(telemetry.topic, Buffer.from([0xff]))), 'INVALID_JSON');
  assert.equal(code(validateMqttMessage(telemetry.topic, 'x'.repeat(65537))), 'PAYLOAD_TOO_LARGE');
});

test('size limit is measured in UTF-8 bytes, not character count', () => {
  assert.equal(code(validateMqttMessage(telemetry.topic, 'ậ'.repeat(22000))), 'PAYLOAD_TOO_LARGE');
});

test('wrong version, types, missing fields and unexpected fields fail validation', () => {
  const mutations = [
    m => { m.schema_version = 2; },
    m => { m.payload.occupancy.current_occupants = '0'; },
    m => { delete m.boot_id; },
    m => { delete m.session_id; },
    m => { m.password = 'example-not-a-secret'; },
    m => { m.payload.environment.humidity_pct = 101; },
    m => { m.seq = -1; },
    m => { m.seq = 9007199254740992; },
  ];
  for (const mutate of mutations) {
    const message = copy(telemetry.message);
    mutate(message);
    assert.equal(code(validate(message)), 'INVALID_SCHEMA');
  }
});

test('null means unknown and never gets coerced to zero or false', () => {
  const message = copy(telemetry.message);
  message.payload.occupancy = { current_occupants: null, count_verified: false, presence: null };
  message.payload.environment.temperature_c = null;
  message.payload.doors[0].beam_clear = null;
  message.payload.doors[0].panic_latched = null;
  const result = validate(message);
  assert.equal(result.ok, true);
  assert.equal(result.value.payload.occupancy.current_occupants, null);
  assert.equal(result.value.payload.doors[0].beam_clear, null);
});

test('a verified count must contain a non-negative integer', () => {
  const message = copy(telemetry.message);
  message.payload.occupancy.current_occupants = null;
  assert.equal(code(validate(message)), 'INVALID_SCHEMA');
});

test('timestamps must be UTC, and clock status must agree with sent_at', () => {
  for (const sentAt of ['not-a-date', '2026-10-12T09:00:00+07:00', null]) {
    const message = copy(telemetry.message);
    message.sent_at = sentAt;
    assert.equal(code(validate(message)), 'INVALID_SCHEMA');
  }
  const unsynced = copy(telemetry.message);
  unsynced.clock_synced = false;
  unsynced.sent_at = null;
  assert.equal(validate(unsynced).ok, true);
  unsynced.sent_at = telemetry.message.sent_at;
  assert.equal(code(validate(unsynced)), 'INVALID_SCHEMA');
});

test('leap seconds and sub-millisecond timestamps are outside the application clock contract', () => {
  for (const sentAt of ['2026-12-31T23:59:60.000Z', '2026-10-12T02:00:00.0001Z']) {
    const message = copy(telemetry.message);
    message.sent_at = sentAt;
    assert.equal(code(validate(message)), 'INVALID_SCHEMA');
  }
});

test('invalid topic, warehouse and message kind are rejected', () => {
  assert.equal(code(validateMqttMessage('khoguard/+/WH01', '{}')), 'INVALID_TOPIC');
  assert.equal(code(validateMqttMessage(telemetry.topic.replace('WH01', 'WH02'), JSON.stringify(telemetry.message))), 'INVALID_TOPIC');
  assert.equal(code(validateMqttMessage(telemetry.topic.replace('telemetry', 'events'), JSON.stringify(telemetry.message))), 'DEVICE_MISMATCH');
});

test('topic and payload must identify the same registered device and zone', () => {
  const message = copy(telemetry.message);
  message.device_id = 'SIM-A01';
  assert.equal(code(validate(message)), 'DEVICE_MISMATCH');
  message.device_id = 'UNKNOWN-01';
  const topic = telemetry.topic.replace('ESP-C01', 'UNKNOWN-01');
  assert.equal(code(validateMqttMessage(topic, JSON.stringify(message))), 'DEVICE_NOT_REGISTERED');
  message.device_id = 'ESP-C01';
  message.payload.zone_id = 'A';
  assert.equal(code(validate(message)), 'ZONE_MISMATCH');
});

test('door assignments and telemetry ownership cannot be forged', () => {
  const message = copy(telemetry.message);
  message.payload.doors[0].door_id = 'D01';
  assert.equal(code(validate(message)), 'DOOR_NOT_ASSIGNED');
  const doorOnly = copy(telemetry.message);
  doorOnly.device_id = 'SIM-C02';
  doorOnly.payload.doors = [{ ...doorOnly.payload.doors[0], door_id: 'D09' }];
  const topic = telemetry.topic.replace('ESP-C01', 'SIM-C02');
  assert.equal(code(validateMqttMessage(topic, JSON.stringify(doorOnly))), 'UNSUPPORTED_TELEMETRY');
  delete doorOnly.payload.environment;
  delete doorOnly.payload.occupancy;
  assert.equal(validateMqttMessage(topic, JSON.stringify(doorOnly)).ok, true);
});

test('a telemetry snapshot cannot contain a door ID twice', () => {
  const message = copy(telemetry.message);
  message.payload.doors.push(copy(message.payload.doors[0]));
  assert.equal(code(validate(message)), 'DOOR_NOT_ASSIGNED');
});

test('telemetry contains all measurements and doors owned by the device', () => {
  for (const field of ['environment', 'occupancy', 'doors']) {
    const message = copy(telemetry.message);
    delete message.payload[field];
    assert.equal(code(validate(message)), 'INCOMPLETE_TELEMETRY');
  }
  const message = copy(telemetry.message);
  message.payload.doors.pop();
  assert.equal(code(validate(message)), 'INCOMPLETE_TELEMETRY');
});

test('RFID requires direction/card, panic requires input, and door events require state', () => {
  const event = examples.find(example => example.message.kind === 'events');
  const message = copy(event.message);
  delete message.payload.direction;
  assert.equal(code(validateMqttMessage(event.topic, JSON.stringify(message))), 'INVALID_SCHEMA');
  message.payload.event_type = 'panic';
  delete message.payload.card_id;
  assert.equal(code(validateMqttMessage(event.topic, JSON.stringify(message))), 'INVALID_SCHEMA');
  message.payload.input = 'panic_low';
  assert.equal(validateMqttMessage(event.topic, JSON.stringify(message)).ok, true);
  message.payload = { zone_id: 'C', event_type: 'door', door_id: 'D07' };
  assert.equal(code(validateMqttMessage(event.topic, JSON.stringify(message))), 'INVALID_SCHEMA');
});

test('commands require a synchronized clock and an expiry after issue within 30 seconds', () => {
  const command = examples.find(example => example.message.kind === 'commands');
  for (const expiresAt of [command.message.sent_at, '2026-10-12T02:00:31.000Z']) {
    const message = copy(command.message);
    message.payload.expires_at = expiresAt;
    assert.equal(code(validateMqttMessage(command.topic, JSON.stringify(message))), 'INVALID_COMMAND');
  }
  const message = copy(command.message);
  message.clock_synced = false;
  message.sent_at = null;
  assert.equal(code(validateMqttMessage(command.topic, JSON.stringify(message))), 'INVALID_SCHEMA');
});

test('a rejected acknowledgment includes a reason, while applied acknowledgment has none', () => {
  const ack = examples.find(example => example.message.kind === 'acks');
  const message = copy(ack.message);
  message.payload.reason = null;
  assert.equal(code(validateMqttMessage(ack.topic, JSON.stringify(message))), 'INVALID_SCHEMA');
  message.payload.status = 'applied';
  assert.equal(validateMqttMessage(ack.topic, JSON.stringify(message)).ok, true);
});

test('snapshot example supports all four zones, twelve doors and known provenance', () => {
  assert.equal(validateSnapshot(snapshot).ok, true);
  assert.equal(snapshot.zones.length, 4);
  assert.equal(snapshot.doors.length, 12);
  assert.equal(snapshot.devices.length, 5);
});

test('registry has exactly one owner per door and one environment/occupancy owner per zone', () => {
  const doors = registry.devices.flatMap(device => device.doors);
  assert.equal(new Set(doors).size, 12);
  assert.equal(doors.length, 12);
  assert.equal(new Set(registry.devices.map(device => device.id)).size, registry.devices.length);
  for (const zone of registry.zones) {
    assert.equal(registry.devices.filter(device => device.zone_id === zone && device.environment).length, 1);
    assert.equal(registry.devices.filter(device => device.zone_id === zone && device.occupancy).length, 1);
  }
});

test('snapshot rejects slot over-allocation, duplicate IDs and inverted temperature range', () => {
  const mutations = [
    s => { s.zones[0].reserved = 17; },
    s => { s.doors[1].id = s.doors[0].id; },
    s => { s.zones[0].range = [30, 18]; },
    s => { s.doors[0].zone = 'C'; },
    s => { s.devices[0].source = 'wokwi'; },
  ];
  for (const mutate of mutations) {
    const value = copy(snapshot);
    mutate(value);
    assert.equal(code(validateSnapshot(value)), 'INVALID_SNAPSHOT');
  }
});

test('offline device cannot be described as fresh', () => {
  const value = copy(snapshot);
  value.devices[0].state = 'offline';
  value.devices[0].freshness = 'fresh';
  assert.equal(code(validateSnapshot(value)), 'INVALID_SNAPSHOT');
});

test('snapshot includes disconnected devices instead of hiding them', () => {
  const value = copy(snapshot);
  value.devices.pop();
  assert.equal(code(validateSnapshot(value)), 'INVALID_SNAPSHOT');
});

test('freshness has a ten-second boundary and rejects future receive times', () => {
  const value = copy(snapshot);
  value.devices[0].last_seen_at = '2026-10-12T01:59:50.000Z';
  assert.equal(validateSnapshot(value).ok, true);
  value.devices[0].last_seen_at = '2026-10-12T01:59:49.999Z';
  assert.equal(code(validateSnapshot(value)), 'INVALID_SNAPSHOT');
  value.devices[0].freshness = 'stale';
  assert.equal(validateSnapshot(value).ok, true);
  value.devices[0].last_seen_at = '2026-10-12T02:00:00.001Z';
  assert.equal(code(validateSnapshot(value)), 'INVALID_SNAPSHOT');
});

test('validation leaves the current UI demo independent of MQTT fixtures', async () => {
  const { createDemo, getSummary } = await import('../src/demo.js');
  assert.equal(getSummary(createDemo()).occupied, 240);
  assert.equal(getSummary(createDemo()).doors, 12);
});
