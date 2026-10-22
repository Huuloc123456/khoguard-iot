// Lively warehouse for demo:warehouse (DEC-042): doors of zones A/B/D open and close on their own, a few stay open long
// enough for the 30 s / 60 s alarms, and zones A/B run periodic temperature incidents. Pure functions of the state,
// a seeded PRNG and the virtual clock, so a given --seed always replays the same day.

// Same thresholds as firmware/include/controller.h: the device owns door timers, the backend only mirrors its alarms.
export const DOOR_WARNING_MS = 30000, DOOR_CRITICAL_MS = 60000;
// Per 2 s tick a closed door opens with this chance (about every 100 s); one opening in ten is a long one.
export const DOOR_OPEN_CHANCE = 0.02, DOOR_LONG_CHANCE = 0.1;
const SHORT_OPEN_MS = [5000, 20000], LONG_OPEN_MS = [35000, 75000];
// Incidents: warm by `ramp` °C per tick up to `peak` (above the zone maximum), hold, then cool back inside the range.
export const INCIDENTS = {
  B: { firstMs: 60000, everyMs: 300000, peak: 9.5, ramp: 0.3, holdMs: 20000 },
  A: { firstMs: 180000, everyMs: 420000, peak: 31.5, ramp: 0.3, holdMs: 20000 },
};

const between = (random, [lo, hi]) => Math.round(lo + (hi - lo) * random());
const round1 = value => Math.round(value * 10) / 10;

export const newDoor = () => ({ open: false, since: 0, until: 0 });

// Returns 'opened', 'closed' or null.
export function stepDoor(door, now, random) {
  if (door.open) {
    if (now < door.until) return null;
    door.open = false;
    return 'closed';
  }
  if (random() >= DOOR_OPEN_CHANCE) return null;
  const duration = between(random, random() < DOOR_LONG_CHANCE ? LONG_OPEN_MS : SHORT_OPEN_MS);
  Object.assign(door, { open: true, since: now, until: now + duration });
  return 'opened';
}

export function doorAlarm(doorId, door, now) {
  if (!door.open) return null;
  const elapsed = now - door.since;
  if (elapsed > DOOR_CRITICAL_MS) return { code: 'DOOR_OPEN_CRITICAL', door_id: doorId };
  if (elapsed >= DOOR_WARNING_MS) return { code: 'DOOR_OPEN_WARNING', door_id: doorId };
  return null;
}

export const newClimate = zone => ({ incident: null, nextIncidentAt: INCIDENTS[zone]?.firstMs ?? Infinity });

// Returns the next temperature. Normal ticks are a small random walk kept 0.6 °C inside the range.
export function stepTemperature(climate, zone, temperature, [lo, hi], now, random) {
  const plan = INCIDENTS[zone];
  if (plan && !climate.incident && now >= climate.nextIncidentAt) {
    climate.incident = { stage: 'warming', holdUntil: 0 };
    climate.nextIncidentAt += plan.everyMs;
  }
  const noise = (random() - 0.5) * 0.1;
  const incident = climate.incident;
  if (incident?.stage === 'warming') {
    const next = Math.min(plan.peak, temperature + plan.ramp + noise);
    if (next >= plan.peak) Object.assign(incident, { stage: 'holding', holdUntil: now + plan.holdMs });
    return round1(next);
  }
  if (incident?.stage === 'holding') {
    if (now >= incident.holdUntil) incident.stage = 'cooling';
    return round1(plan.peak + noise);
  }
  if (incident?.stage === 'cooling') {
    // Back to 1 °C under the maximum so the backend's 0.5 °C hysteresis lets the alert resolve.
    const next = temperature - plan.ramp + noise;
    if (next <= hi - 1) { climate.incident = null; return round1(hi - 1); }
    return round1(next);
  }
  return round1(Math.min(hi - 0.6, Math.max(lo + 0.6, temperature + (random() - 0.5) * 0.4)));
}

// People drift one at a time instead of jumping, 0..4 per zone.
export function stepOccupancy(count, random) {
  const roll = random();
  if (roll < 0.08 && count < 4) return count + 1;
  if (roll > 0.92 && count > 0) return count - 1;
  return count;
}
