import test from 'node:test';
import assert from 'node:assert/strict';
import { migrationAction, inventorySeed, telemetryMigration } from '../db/migrate.mjs';
import { registry } from '../scripts/local-config.mjs';
test('applied migration is skipped only when checksum matches; incomplete or edited migration is blocked', () => {
  assert.equal(migrationAction(undefined,'abc'),'apply');
  assert.equal(migrationAction({status:'complete',checksum:'abc'},'abc'),'skip');
  assert.throws(()=>migrationAction({status:'applying',checksum:'abc'},'abc'),/incomplete/);
  assert.throws(()=>migrationAction({status:'complete',checksum:'changed'},'abc'),/checksum/);
});

test('MySQL telemetry DDL does not reference auto-increment id in a CHECK constraint', () => {
  assert.doesNotMatch(telemetryMigration.sql,/CHECK\s*\(\s*id\b/i);
  assert.match(telemetryMigration.sql,/UNIQUE KEY telemetry_dedupe/);
});
test('immutable v1 seed preserves history and contains the active registry assignments', () => {
  assert.equal(inventorySeed.warehouse.id,'WH01');
  assert.equal(inventorySeed.zones.length,4);
  assert.equal(inventorySeed.devices.length,5);
  assert.equal(inventorySeed.doors.length,12);
  for (const device of registry.devices) {
    assert.deepEqual(inventorySeed.doors.filter(d=>d.device_id===device.id).map(d=>d.id),device.doors);
    assert.ok(inventorySeed.doors.filter(d=>d.device_id===device.id).every(d=>d.zone_id===device.zone_id));
  }
  assert.doesNotMatch(JSON.stringify(inventorySeed),/temperature|panic|current_occupants|closed|count_verified/);
});
