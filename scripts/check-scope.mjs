import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {readConfig} from '../server/config.mjs';
import {validateSnapshot} from '../contracts/validate.js';
import {signIn,authFetch} from './check-session.mjs';
import {local} from './local-config.mjs';

try {
  const config=readConfig(process.env),base=`http://${config.host}:${config.port}`;
  await signIn(base,'viewer');
  const get=path=>authFetch(base+path,{signal:AbortSignal.timeout(5000)});
  assert.equal((await get('/api/ready')).status,200);
  const response=await get('/api/snapshot');assert.equal(response.status,200);
  const snapshot=await response.json();assert.equal(validateSnapshot(snapshot).ok,true);
  assert.deepEqual(snapshot.zones.map(z=>z.id),['C']);
  assert.deepEqual(snapshot.devices.map(d=>d.id),['ESP-C01']);
  assert.deepEqual(snapshot.doors.map(d=>d.id),['D07','D08']);
  assert.ok(snapshot.alerts.every(a=>a.door_id===null || ['D07','D08'].includes(a.door_id)));
  const reservations=await get('/api/reservations');assert.equal(reservations.status,200);
  const page=await reservations.json();assert.equal(page.storage.capacity,78);
  assert.ok(page.items.every(r=>r.zone_id==='C'));assert.equal(Object.hasOwn(page,'staging'),false);
  for(const zone of ['A','B','D'])assert.equal((await get(`/api/reports/events?zone=${zone}`)).status,400);
  assert.equal((await get('/api/telemetry?device_id=SIM-A01&from=2026-10-24T00:00:00Z&to=2026-10-24T01:00:00Z')).status,400);
  const result={checked_at:new Date().toISOString(),zones:['C'],devices:['ESP-C01'],doors:['D07','D08'],usable_slots:page.storage.capacity,
    freshness:snapshot.devices[0].freshness,checks:['live snapshot is single-zone','only C reservations, no staging','retired zone/device queries rejected']};
  writeFileSync(join(local,'scope-check.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
}catch(error){console.error(`Single-zone check failed (${error.code??error.name}); credentials not printed.`);process.exitCode=1;}
