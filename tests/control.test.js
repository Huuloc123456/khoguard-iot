import test from 'node:test';
import assert from 'node:assert/strict';
import { desiredAlerts, planAlerts, TEMPERATURE_HYSTERESIS_C, REOPEN_WINDOW_MS } from '../server/alerts.mjs';
import { parseCommandRequest, buildCommand, commandView, ackTransition, COMMAND_TTL_MS } from '../server/commands.mjs';
import { validateMqttMessage } from '../contracts/validate.js';

const zone = { id: 'C', temperature_min: -22, temperature_max: -16 };
const door = (door_id, extra = {}) => ({ door_id, state: 'closed', beam_clear: true, panic_latched: false, local_inputs_healthy: true, ...extra });
const esp = (payload = {}) => ({ device_id: 'ESP-C01', payload: { zone_id: 'C', controller_revision: 1,
  environment: { temperature_c: -18, humidity_pct: 55 }, occupancy: { current_occupants: 0, count_verified: true, presence: false },
  doors: [door('D07'), door('D08')], alarms: [], ...payload } });
const codes = list => list.map(a => `${a.door_id ?? '-'}:${a.code}:${a.level}`).sort();

test('alerts come from edge alarms and reported state, with door-open escalation in one alert', () => {
  assert.deepEqual(desiredAlerts(esp(), zone, new Set()), []);
  const warning = desiredAlerts(esp({ alarms: [{ code: 'DOOR_OPEN_WARNING', door_id: 'D07' }] }), zone, new Set());
  const critical = desiredAlerts(esp({ alarms: [{ code: 'DOOR_OPEN_CRITICAL', door_id: 'D07' }] }), zone, new Set());
  assert.deepEqual(codes(warning), ['D07:DOOR_OPEN:warning']);
  assert.deepEqual(codes(critical), ['D07:DOOR_OPEN:danger']);
  assert.equal(warning[0].key, critical[0].key);
  const all = desiredAlerts(esp({ alarms: [{ code: 'TRAPPED_PERSON' }],
    occupancy: { current_occupants: 0, count_verified: true, presence: true },
    doors: [door('D07', { panic_latched: true }), door('D08', { local_inputs_healthy: false })] }), zone, new Set());
  assert.deepEqual(codes(all), ['-:PRESENCE_MISMATCH:warning', '-:TRAPPED_PERSON:danger', 'D07:PANIC_ACTIVE:danger', 'D08:LOCAL_INPUT_FAILURE:warning']);
  assert.ok(all.every(a => a.title && a.detail && a.zone === 'C'));
});

test('temperature uses hysteresis; missing reading is a sensor alert, never 0 °C', () => {
  const at = (t, active = new Set()) => codes(desiredAlerts(esp({ environment: { temperature_c: t, humidity_pct: 50 } }), zone, active));
  assert.deepEqual(at(-16), []);
  assert.deepEqual(at(-22), []);
  assert.deepEqual(at(-15.9), ['-:TEMPERATURE_OUT_OF_RANGE:warning']);
  const key = 'C|-|TEMPERATURE_OUT_OF_RANGE';
  assert.deepEqual(at(-16 - TEMPERATURE_HYSTERESIS_C / 2, new Set([key])), ['-:TEMPERATURE_OUT_OF_RANGE:warning']);
  assert.deepEqual(at(-16 - TEMPERATURE_HYSTERESIS_C, new Set([key])), []);
  assert.deepEqual(at(null), ['-:SENSOR_MISSING:warning']);
  const sim = { device_id: 'SIM-C02', payload: { zone_id: 'C', controller_revision: 0, doors: [door('D09', { local_inputs_healthy: false, state: 'unknown' })] } };
  assert.deepEqual(desiredAlerts(sim, zone, new Set()), [], 'simulators without real inputs do not raise input faults');
});

test('alert plan raises, updates level, resolves and reopens a recently resolved alert instead of spamming rows', () => {
  const now = Date.parse('2026-10-13T05:00:00Z');
  const want = [{ key: 'C|D07|DOOR_OPEN', code: 'DOOR_OPEN', level: 'danger', zone: 'C', door_id: 'D07', title: 't', detail: 'd' }];
  assert.deepEqual(planAlerts([], want, now).map(a => a.op), ['raise']);
  const active = [{ id: 1, key: 'C|D07|DOOR_OPEN', state: 'active', level: 'warning', resolved_at: null }];
  assert.deepEqual(planAlerts(active, want, now).map(a => [a.op, a.id]), [['update', 1]]);
  assert.deepEqual(planAlerts(active, [], now).map(a => [a.op, a.id]), [['resolve', 1]]);
  const recent = [{ id: 2, key: 'C|D07|DOOR_OPEN', state: 'resolved', level: 'danger', resolved_at: new Date(now - REOPEN_WINDOW_MS + 1) }];
  assert.deepEqual(planAlerts(recent, want, now).map(a => [a.op, a.id]), [['reopen', 2]]);
  const old = [{ ...recent[0], resolved_at: new Date(now - REOPEN_WINDOW_MS - 1) }];
  assert.deepEqual(planAlerts(old, want, now).map(a => a.op), ['raise']);
  assert.deepEqual(planAlerts([{ ...active[0], level: 'danger' }], want, now), [], 'unchanged active alert needs no write');
});

test('command requests only accept known actions on registered doors', () => {
  assert.deepEqual(parseCommandRequest('D07', '{"action":"close"}'), { door: 'D07', action: 'close', device: 'ESP-C01' });
  for (const [doorId, body] of [['D99', '{"action":"close"}'], ['D07', '{"action":"unlock"}'], ['D07', '{"action":"close","force":true}'], ['D07', 'x'], ['D07', '[]']])
    assert.throws(() => parseCommandRequest(doorId, body), /INVALID_COMMAND/);
  assert.throws(() => parseCommandRequest('D01', '{"action":"open"}'), /NOT_COMMANDABLE/);
});

test('commands are bound to the live device session/revision, expire and accept one final ack', () => {
  const now = Date.parse('2026-10-13T05:00:00.000Z');
  const message = buildCommand({ commandId: 'cmd-abc', seq: 7, door: 'D07', action: 'close', device: { id: 'ESP-C01', boot_id: 'boot1', session_id: 's1', controller_revision: 42 }, now });
  assert.equal(validateMqttMessage('khoguard/v1/WH01/devices/ESP-C01/commands', JSON.stringify(message)).ok, true);
  assert.deepEqual([message.boot_id, message.session_id, message.payload.expected_revision], ['boot1', 's1', 42]);
  assert.equal(Date.parse(message.payload.expires_at) - now, COMMAND_TTL_MS);
  const row = { command_id: 'cmd-abc', door_id: 'D07', action: 'close', status: 'pending', reason: null, late_ack: null,
    created_at: new Date(now), expires_at: new Date(now + COMMAND_TTL_MS), acked_at: null };
  assert.equal(commandView(row, now + COMMAND_TTL_MS).status, 'pending');
  assert.equal(commandView(row, now + COMMAND_TTL_MS + 2001).status, 'expired');
  assert.deepEqual(ackTransition(row, { status: 'rejected', reason: 'PRESENCE_DETECTED' }), { status: 'rejected', reason: 'PRESENCE_DETECTED' });
  assert.equal(ackTransition({ ...row, status: 'applied' }, { status: 'applied', reason: null }), null, 'duplicate ack is ignored');
  assert.deepEqual(ackTransition({ ...row, status: 'expired', reason: 'COMMAND_EXPIRED' }, { status: 'applied', reason: null }), { late_ack: 'applied' });
});
