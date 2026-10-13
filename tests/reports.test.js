import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReportQuery, REPORT_KINDS } from '../server/reports.mjs';
import { toCsv } from '../src/csv.js';
import { REPORT_COLUMNS, reportRows } from '../src/reports.js';

const now = new Date('2026-10-13T05:00:00.000Z');
const q = (kind, s) => parseReportQuery(kind, new URLSearchParams(s), now);

test('report query: default last 24 h, explicit range, zone/type/limit/cursor, strict rejection', () => {
  assert.deepEqual(q('events', ''), { kind: 'events', from: '2026-10-12T05:00:00.000Z', to: '2026-10-13T05:00:00.000Z', zone: null, type: null, limit: 100, cursor: null });
  const r = q('alerts', 'from=2026-10-13T06:00:00%2B07:00&to=2026-10-13T12:00:00Z&zone=C&type=danger&limit=200&cursor=55');
  assert.deepEqual([r.from, r.to, r.zone, r.type, r.limit, r.cursor], ['2026-10-12T23:00:00.000Z', '2026-10-13T12:00:00.000Z', 'C', 'danger', 200, 55]);
  for (const bad of ['from=yesterday', 'from=2026-10-13', 'zone=E', 'type=rfid&x=1', 'limit=0', 'limit=501', 'cursor=-1',
    'from=2026-10-13T05:00:00Z&to=2026-10-13T04:00:00Z', 'from=2026-08-01T00:00:00Z&to=2026-10-01T00:00:00Z', 'zone=A&zone=B'])
    assert.throws(() => q('alerts', bad), { message: 'INVALID_QUERY' }, bad);
  assert.throws(() => q('events', 'type=danger'), { message: 'INVALID_QUERY' }, 'type list belongs to the kind');
  assert.equal(q('events', 'type=rfid').type, 'rfid');
  assert.deepEqual(REPORT_KINDS, ['events', 'alerts', 'commands', 'reservations', 'access']);
});

test('CSV: UTF-8 BOM, CRLF, quotes/newlines escaped, formula prefixes neutralised, numbers kept', () => {
  const csv = toCsv([{ key: 'a', label: 'Tên "cột"' }, { key: 'b', label: 'Giá trị' }], [
    { a: 'Kho lạnh – cửa D07', b: -18.4 }, { a: '=HYPERLINK("http://x")', b: '+1' }, { a: '-2+3', b: '@SUM(A1)' },
    { a: 'dòng 1\ndòng 2', b: null }, { a: '\tTAB', b: 0 }]);
  assert.ok(csv.startsWith('﻿'));
  const lines = csv.slice(1).split('\r\n');
  assert.equal(lines[0], '"Tên ""cột""","Giá trị"');
  assert.equal(lines[1], '"Kho lạnh – cửa D07",-18.4');
  assert.equal(lines[2], `"'=HYPERLINK(""http://x"")","'+1"`);
  assert.equal(lines[3], `"'-2+3","'@SUM(A1)"`);
  assert.equal(lines[4], '"dòng 1\ndòng 2",', 'newline stays inside the quoted cell');
  assert.equal(lines[5], `"'\tTAB",0`);
  assert.equal(Buffer.from(csv, 'utf8').toString('utf8'), csv);
});

test('exported columns are a whitelist and carry no credential fields', () => {
  for (const kind of REPORT_KINDS) {
    assert.ok(REPORT_COLUMNS[kind].length >= 4, kind);
    assert.ok(REPORT_COLUMNS[kind].every(c => !/password|token|hash|session|secret|boot/i.test(c.key)), kind);
  }
  const rows = reportRows('events', [{ id: 1, device_id: 'ESP-C01', zone: 'C', door_id: 'D07', event_type: 'rfid', received_at: '2026-10-13T01:00:00.000Z', card_id: 'DEMO-017', direction: 'in', result: 'accepted' }]);
  assert.equal(rows[0].time, '13/10/2026 08:00:00');
  assert.match(rows[0].summary, /DEMO-017 vào D07/);
});
