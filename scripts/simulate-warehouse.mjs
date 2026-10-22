import { readConfig } from '../server/config.mjs';
import { SimDevice, FakeEdge, prng, ZONE_TEMPERATURE } from './sim-lib.mjs';
import { newDoor, stepDoor, doorAlarm, newClimate, stepTemperature, stepOccupancy } from './sim-behaviour.mjs';
import { setTimeout as delay } from 'node:timers/promises';

// Node side of the warehouse on real MQTT accounts, deterministic by --seed. Since DEC-043 zones A/B/D and ESP-C01 run
// on Wokwi, so by default this only drives door D09 (SIM-C02). When Wokwi cannot run, --with-fake-zones adds A/B/D and
// --with-fake-esp adds ESP-C01 (never together with the Wokwi node on the same account; the UI still labels them Wokwi).
// Fake zones are lively (doors, alarms, temperature incidents; DEC-042); --steady keeps the old static values.
const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a); if (!m) throw new Error(`bad argument ${a}`); return [m[1], m[2] ?? true]; }));
const seed = Number(args.seed ?? 17), seconds = Number(args.seconds ?? 0), period = 2000;
if (!Number.isInteger(seed) || !Number.isFinite(seconds) || seconds < 0) throw new Error('Use --seed=17 --seconds=60 [--with-fake-zones] [--with-fake-esp] [--steady]');
const random = prng(seed), config = readConfig(process.env);
let virtual = 0;
const clock = () => virtual;
const ZONE_NODES = ['SIM-A01', 'SIM-B01', 'SIM-D01'];
const ids = args['with-fake-zones'] ? [...ZONE_NODES, 'SIM-C02'] : ['SIM-C02'];
const steady = Boolean(args.steady), LIVELY = new Set(ZONE_NODES);
const devices = ids.map(id => new SimDevice(id, { config, clock, label: `wh-${seed}` }));
if (args['with-fake-esp']) devices.push(new FakeEdge({ config, clock, label: `wh-${seed}` }));
for (const d of devices) {
  const [lo, hi] = ZONE_TEMPERATURE[d.spec.zone_id];
  if (d.spec.environment && d.id !== 'ESP-C01') d.state.temperature = Math.round((lo + (hi - lo) * (0.3 + 0.4 * random())) * 10) / 10;
  if (!steady && LIVELY.has(d.id)) d.lively = { doors: Object.fromEntries(d.spec.doors.map(id => [id, newDoor()])), climate: newClimate(d.spec.zone_id) };
}
let stopping = false;
for (const s of ['SIGINT', 'SIGTERM']) process.once(s, () => { stopping = true; });
// A broker restart must not end the simulation: SimDevice clients do not auto-reconnect (reconnectPeriod 0), so a
// publish on a dead connection would never settle. Bound each send and reconnect like a device: same boot, new session.
const bounded = (promise, ms) => {
  let timer;
  const expired = new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('MQTT timeout'), { code: 'MQTT_TIMEOUT' })), ms); });
  return Promise.race([promise, expired]).finally(() => clearTimeout(timer));
};
const offline = new Set();
async function send(d, events = []) {
  try {
    if (!d.client?.connected) { d.client?.end(true); d.client = null; await d.connect(); }
    await bounded(d.telemetry(), 5000);
    // Door changes go out as events after the telemetry that shows them; lost while offline, like a full edge queue.
    for (const event of events) await bounded(d.event(event), 5000);
    if (offline.delete(d.id)) console.log(`${d.id} reconnected with a new MQTT session.`);
  } catch (error) {
    d.client?.end(true); d.client = null;
    if (!offline.has(d.id)) console.error(`${d.id} cannot reach the broker (${error.code ?? error.name}); retrying every ${period / 1000} s.`);
    offline.add(d.id);
  }
}
// One 2 s step of a lively device; returns the door events to publish.
function livelyTick(d) {
  const zone = d.spec.zone_id, s = d.state, events = [], alarms = [];
  if (d.spec.environment) {
    s.temperature = stepTemperature(d.lively.climate, zone, s.temperature, ZONE_TEMPERATURE[zone], virtual, random);
    s.humidity = Math.round(50 + random() * 15);
  }
  if (d.spec.occupancy) { s.count = stepOccupancy(s.count, random); s.presence = s.count > 0; }
  for (const [id, door] of Object.entries(d.lively.doors)) {
    const change = stepDoor(door, virtual, random), shown = s.doors[id];
    if (change) {
      shown.state = door.open ? 'open' : 'closed';
      d.revision++;
      events.push({ door_id: id, event_type: 'door', state: shown.state });
    }
    if (door.open) shown.open_ms = virtual - door.since; else delete shown.open_ms;
    const alarm = doorAlarm(id, door, virtual);
    if (alarm) alarms.push(alarm);
  }
  s.alarms = alarms;
  return events;
}
try {
  for (const d of devices) await d.connect();
  console.log(`Warehouse simulation seed=${seed}: ${devices.map(d => d.id).join(', ')} · ${devices.reduce((n, d) => n + d.spec.doors.length, 0)} doors · every 2 s${seconds ? ` for ${seconds} s` : '; Ctrl+C stops'}. Values are synthetic${args['with-fake-zones'] ? (steady ? '; fake zones steady' : '; fake zones A/B/D lively') : '; zones A/B/D come from Wokwi'}.`);
  const fakes = [args['with-fake-zones'] && 'A/B/D', args['with-fake-esp'] && 'ESP-C01'].filter(Boolean);
  if (fakes.length) console.log(`WARNING: ${fakes.join(' and ')} are Node stand-ins but the dashboard labels them Wokwi; say so during the demo and do not start their Wokwi simulators.`);
  const end = seconds ? Date.now() + seconds * 1000 : Infinity;
  while (!stopping && Date.now() < end) {
    virtual += period;
    for (const d of devices) {
      if (d.lively) { await send(d, livelyTick(d)); continue; }
      if (d.spec.environment && d.id !== 'ESP-C01') {
        const [lo, hi] = ZONE_TEMPERATURE[d.spec.zone_id];
        d.state.temperature = Math.round(Math.min(hi - 0.6, Math.max(lo + 0.6, d.state.temperature + (random() - 0.5) * 0.4)) * 10) / 10;
        d.state.humidity = Math.round(50 + random() * 15);
      }
      if (d.spec.occupancy && d.id !== 'ESP-C01') { d.state.count = Math.floor(random() * 4); d.state.presence = d.state.count > 0; }
      await send(d);
    }
    await delay(period);
  }
} catch (error) { console.error(`Simulation stopped (${error.code ?? error.message}); secrets not printed.`); process.exitCode = 1; }
finally { for (const d of devices) await d.offline(); }
