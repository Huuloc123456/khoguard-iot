import { readConfig } from '../server/config.mjs';
import { SimDevice, FakeEdge, prng, ZONE_TEMPERATURE } from './sim-lib.mjs';
import { setTimeout as delay } from 'node:timers/promises';

// M16: the whole warehouse (4 zones, 12 doors) from Node simulators on their own MQTT accounts, deterministic by --seed.
// ESP-C01 is Wokwi; add --with-fake-esp only when Wokwi is not running (never both on the same account).
const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a); if (!m) throw new Error(`bad argument ${a}`); return [m[1], m[2] ?? true]; }));
const seed = Number(args.seed ?? 17), seconds = Number(args.seconds ?? 0), period = 2000;
if (!Number.isInteger(seed) || !Number.isFinite(seconds) || seconds < 0) throw new Error('Use --seed=17 --seconds=60 [--with-fake-esp]');
const random = prng(seed), config = readConfig(process.env);
let virtual = 0;
const clock = () => virtual;
const ids = ['SIM-A01', 'SIM-B01', 'SIM-C02', 'SIM-D01'];
const devices = ids.map(id => new SimDevice(id, { config, clock, label: `wh-${seed}` }));
if (args['with-fake-esp']) devices.push(new FakeEdge({ config, clock, label: `wh-${seed}` }));
for (const d of devices) {
  const [lo, hi] = ZONE_TEMPERATURE[d.spec.zone_id];
  if (d.spec.environment && d.id !== 'ESP-C01') d.state.temperature = Math.round((lo + (hi - lo) * (0.3 + 0.4 * random())) * 10) / 10;
}
let stopping = false;
for (const s of ['SIGINT', 'SIGTERM']) process.once(s, () => { stopping = true; });
try {
  for (const d of devices) await d.connect();
  console.log(`Warehouse simulation seed=${seed}: ${devices.map(d => d.id).join(', ')} · ${devices.reduce((n, d) => n + d.spec.doors.length, 0)} doors · every 2 s${seconds ? ` for ${seconds} s` : '; Ctrl+C stops'}. Values are synthetic.`);
  const end = seconds ? Date.now() + seconds * 1000 : Infinity;
  while (!stopping && Date.now() < end) {
    virtual += period;
    for (const d of devices) {
      if (d.spec.environment && d.id !== 'ESP-C01') {
        const [lo, hi] = ZONE_TEMPERATURE[d.spec.zone_id];
        d.state.temperature = Math.round(Math.min(hi - 0.6, Math.max(lo + 0.6, d.state.temperature + (random() - 0.5) * 0.4)) * 10) / 10;
        d.state.humidity = Math.round(50 + random() * 15);
      }
      if (d.spec.occupancy && d.id !== 'ESP-C01') { d.state.count = Math.floor(random() * 4); d.state.presence = d.state.count > 0; }
      await d.telemetry();
    }
    await delay(period);
  }
} catch (error) { console.error(`Simulation stopped (${error.code ?? error.message}); secrets not printed.`); process.exitCode = 1; }
finally { for (const d of devices) await d.offline(); }
