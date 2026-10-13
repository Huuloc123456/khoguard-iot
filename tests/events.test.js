import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { eventDecision, eventGap, parseEventsQuery, eventView } from '../server/events.mjs';
import { eventsMigration } from '../db/migrate.mjs';
import { validateMqttMessage } from '../contracts/validate.js';

const now = Date.parse('2026-10-13T01:00:00Z');
const example = JSON.parse(readFileSync(new URL('../contracts/examples.json', import.meta.url))).find(e => e.message.kind === 'events');
const message = { ...example.message, clock_synced: false, sent_at: null };
const session = { boot_id: message.boot_id, session_id: message.session_id };
const decide = (m = message, options = {}) => eventDecision(options.current ?? session, options.candidate ?? null, m, { retain: options.retain ?? false }, now, options.retired ?? false);

test('events need a confirmed live session; retained, retired and unconfirmed frames are refused', () => {
  assert.equal(decide(), 'accepted');
  assert.equal(decide(message, { current: { boot_id: 'old', session_id: 'old' }, candidate: session }), 'accepted');
  assert.equal(decide(message, { current: { boot_id: 'old', session_id: 'old' } }), 'unconfirmed');
  assert.equal(decide(message, { retain: true }), 'retained');
  assert.equal(decide(message, { retired: true }), 'retired_session');
  assert.equal(decide({ ...message, clock_synced: true, sent_at: new Date(now - 10001).toISOString() }), 'invalid_time');
});

test('event sequence gaps are reported per boot, never for duplicates or the first event after 1', () => {
  assert.equal(eventGap(null, 1), null);
  assert.deepEqual(eventGap(null, 4), { from: 1, to: 3 });
  assert.equal(eventGap(4, 5), null);
  assert.deepEqual(eventGap(5, 9), { from: 6, to: 8 });
  assert.equal(eventGap(9, 3), null);
});

test('event queries are bounded and only accept registered devices, known types and positive cursors', () => {
  assert.deepEqual(parseEventsQuery(new URLSearchParams()), { device: null, type: null, limit: 50, cursor: null });
  assert.deepEqual(parseEventsQuery(new URLSearchParams('device_id=ESP-C01&type=rfid&limit=10&cursor=7')), { device: 'ESP-C01', type: 'rfid', limit: 10, cursor: 7 });
  for (const query of ['limit=0', 'limit=201', 'cursor=0', 'cursor=-1', 'device_id=X', 'type=sql', 'limit=1&limit=2', 'zone=C'])
    assert.throws(() => parseEventsQuery(new URLSearchParams(query)), /INVALID_QUERY/, query);
});

test('event view keeps the edge decision and never invents a count', () => {
  const row = { id: 3, device_id: 'ESP-C01', boot_id: 'b', seq: 11, received_at: new Date(now), message };
  assert.deepEqual(eventView(row), { id: 3, device_id: 'ESP-C01', zone: 'C', door_id: 'D07', event_type: 'rfid', received_at: '2026-10-13T01:00:00.000Z',
    card_id: 'DEMO-017', direction: 'in', result: 'accepted' });
  const door = { ...row, message: { ...message, payload: { zone_id: 'C', event_type: 'door', door_id: 'D08', state: 'open' } } };
  assert.equal(eventView(door).state, 'open');
  assert.equal('current_occupants' in eventView(door), false);
});

test('events migration dedupes per device event ID and keeps referential ownership', () => {
  assert.match(eventsMigration.sql, /UNIQUE KEY event_dedupe \(device_id,event_id\)/);
  assert.match(eventsMigration.sql, /FOREIGN KEY \(door_id\) REFERENCES doors\(id\)/);
  assert.doesNotMatch(eventsMigration.sql, /CHECK\s*\(\s*id\b/i);
  assert.equal(validateMqttMessage(example.topic, JSON.stringify(message)).ok, true);
});
