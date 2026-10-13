import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { snapshotToView, acceptSnapshot } from '../src/live-data.js';
import { getSummary, canCloseDoor } from '../src/demo.js';
const fixture=JSON.parse(readFileSync(new URL('../contracts/snapshot.example.json',import.meta.url)));
test('live adapter preserves unknowns/provenance and stale data never permits closing',()=>{
  const value=structuredClone(fixture);value.zones[0].occupied=null;value.zones[0].reserved=null;
  value.zones[0].environment.temperature_c=null;value.zones[0].occupancy.current_occupants=null;
  value.doors[0].state='unknown';value.doors[0].beam_clear=null;
  const view=snapshotToView(value);
  assert.equal(view.zones[0].temperature,null);assert.equal(view.doors[0].open,null);
  assert.equal(getSummary(view).occupied,null);assert.equal(getSummary(view).people,null);
  assert.equal(view.zones[2].source,'Wokwi');
  view.zones[2].freshness='stale';view.zones[2].people=0;view.zones[2].presence=false;view.zones[2].beam=false;view.zones[2].panic=false;
  assert.equal(canCloseDoor(view.zones[2]),false);
});
test('full snapshots resync skipped revisions; old revisions/time and malformed snapshots are refused',()=>{
  assert.equal(acceptSnapshot(fixture,null),true);
  assert.equal(acceptSnapshot({...fixture,revision:fixture.revision+3},fixture),true);
  assert.equal(acceptSnapshot({...fixture,revision:fixture.revision-1},fixture),false);
  assert.equal(acceptSnapshot({...fixture,generated_at:'2026-01-01T00:00:00Z'},fixture),false);
  assert.equal(acceptSnapshot({revision:1},null),false);
});
