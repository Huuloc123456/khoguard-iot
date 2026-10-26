import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemo, canCloseDoor, getSummary } from '../src/demo.js';

test('initial warehouse totals agree with the displayed zones and doors', () => {
  const summary = getSummary(createDemo());
  assert.deepEqual(summary, { zones: 1, doors: 2, openDoors: 1, people: 2, occupied: 60, capacity: 78, utilization: 77 });
});

test('cold-storage door stays blocked for occupancy, presence, beam or panic', () => {
  const clear = { people: 0, presence: false, beam: false, panic: false };
  assert.equal(canCloseDoor(clear), true);
  for (const signal of [{ people: 1 }, { presence: true }, { beam: true }, { panic: true }]) {
    assert.equal(canCloseDoor({ ...clear, ...signal }), false);
  }
});

test('presence scenario blocks closure even when the RFID count is zero', () => {
  const demo = createDemo('presence');
  const cold = demo.zones.find(zone => zone.id === 'C');
  assert.equal(cold.people, 0);
  assert.equal(canCloseDoor(cold), false);
  assert.ok(demo.alerts.some(alert => alert.id === 'presence'));
});

test('an accepted arrival adds one person to the initial occupancy', () => {
  const demo = createDemo('arrival');
  assert.equal(demo.zones.find(zone => zone.id === 'C').people, 3);
  assert.equal(getSummary(demo).people, 3);
});

test('panic opens the simulated cold-storage door and records an emergency', () => {
  const demo = createDemo('panic');
  assert.equal(demo.doors.find(door => door.id === 'D07').open, true);
  assert.equal(demo.zones.find(zone => zone.id === 'C').panic, true);
  assert.ok(demo.alerts.some(alert => alert.level === 'danger'));
});

test('full scenario reaches the warehouse limit without exceeding any zone capacity', () => {
  const demo = createDemo('full');
  const { occupied, capacity } = getSummary(demo);
  assert.ok(occupied / capacity >= 0.95);
  assert.ok(demo.zones.every(zone => zone.occupied <= zone.capacity));
  assert.ok(demo.alerts.some(alert => alert.id === 'capacity'));
});

test('scenarios do not mutate the initial demo data', () => {
  createDemo('full');
  createDemo('panic');
  assert.equal(getSummary(createDemo()).occupied, 60);
  assert.equal(createDemo().zones.find(zone => zone.id === 'C').panic, false);
});
