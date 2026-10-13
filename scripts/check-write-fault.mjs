import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { local } from './local-config.mjs';
import { readConfig } from '../server/config.mjs';
import { createDbPool } from '../server/database.mjs';
import { signIn, authFetch } from './check-session.mjs';
import { SimDevice } from './sim-lib.mjs';

// T24 write failure against the running backend and real MySQL. A second connection holds the SIM-A01 row lock, so the
// backend's ingest transaction hits its 1 s lock wait and fails like a write error would. The backend must neither store
// nor report those frames as fresh; once the lock is released the broker redelivers them on the backend's persistent
// session and each one is stored exactly once. Needs no other SIM-A01 source (stop demo:warehouse first).
const config=readConfig(process.env), pool=createDbPool(config.db), base=`http://${config.host}:${config.port}`;
const checks=[];
let stage='setup', device, lock;
const stored=async boot=>(await pool.execute('SELECT seq FROM telemetry WHERE device_id = ? AND boot_id = ? ORDER BY seq',['SIM-A01',boot]))[0].map(r=>Number(r.seq));
const simA=async()=>(await (await authFetch(`${base}/api/snapshot`,{signal:AbortSignal.timeout(5000)})).json()).devices.find(d=>d.id==='SIM-A01');
const readyStatus=()=>fetch(`${base}/api/ready`,{signal:AbortSignal.timeout(3000)}).then(r=>r.status,()=>0);
async function until(read,accept,ms=15000) {
  const end=Date.now()+ms; let last;
  while (Date.now()<end) {try {last=await read(); if (accept(last)) return last;} catch {} await delay(200);}
  throw new Error(`timeout (${JSON.stringify(last)?.slice(0,120)})`);
}
try {
  assert.equal(await readyStatus(),200,'backend must be running and ready');
  await signIn(base,'viewer');
  assert.notEqual((await simA()).freshness,'fresh','SIM-A01 already has a live source; stop demo:warehouse first');
  let virtual=0;
  device=new SimDevice('SIM-A01',{config,clock:()=>(virtual+=2000),label:'t24'});
  device.state.temperature=24.5;
  await device.connect();
  for (let i=0;i<3;i++) {await device.telemetry(); await delay(300);}
  await until(()=>stored(device.boot),seqs=>seqs.length===3);
  await until(simA,d=>d.freshness==='fresh');
  checks.push('baseline: SIM-A01 frames 1–3 stored, device fresh');

  stage='write failure';
  lock=await pool.getConnection();
  await lock.beginTransaction();
  await lock.execute('SELECT device_id FROM device_current WHERE device_id = ? FOR UPDATE',['SIM-A01']);
  for (let i=0;i<3;i++) {await device.telemetry(); await delay(500);}
  let stale=0, notReady=0, samples=0;
  const end=Date.now()+8000;
  while (Date.now()<end) {
    samples++;
    const d=await simA().catch(()=>null);
    if (d && d.freshness!=='fresh') stale++;
    if (await readyStatus()!==200) notReady++;
    await delay(250);
  }
  assert.deepEqual(await stored(device.boot),[1,2,3],'no frame may be stored while writes fail');
  assert.ok(stale>0,'SIM-A01 must not stay fresh while its frames cannot be stored');
  checks.push(`row lock held 9.5 s: frames 4–6 published (broker PUBACK) but none stored; SIM-A01 not fresh in ${stale}/${samples} snapshots; /api/ready not 200 in ${notReady}/${samples} probes`);

  stage='recovery';
  await lock.rollback(); lock.release(); lock=null;
  const released=Date.now();
  const seqs=await until(()=>stored(device.boot),s=>s.length===6,30000);
  assert.deepEqual(seqs,[1,2,3,4,5,6]);
  const [[count]]=await pool.execute('SELECT COUNT(*) AS n, COUNT(DISTINCT seq) AS d FROM telemetry WHERE device_id = ? AND boot_id = ?',['SIM-A01',device.boot]);
  assert.equal(Number(count.n),Number(count.d),'each frame stored once');
  const storedIn=Date.now()-released;
  // Redelivered frames are history only; the next live frame after the session is re-confirmed refreshes state.
  const [[current]]=await pool.execute('SELECT seq FROM device_current WHERE device_id = ?',['SIM-A01']);
  assert.equal(Number(current.seq),3,'backlog does not move the current state');
  await device.telemetry();
  await until(simA,d=>d.freshness==='fresh');
  assert.equal(Number((await pool.execute('SELECT seq FROM device_current WHERE device_id = ?',['SIM-A01']))[0][0].seq),7);
  assert.equal(await readyStatus(),200);
  checks.push(`lock released: broker redelivered frames 4–6 on the backend's persistent session, stored once as history within ${storedIn} ms without moving current state; next live frame 7 → current, SIM-A01 fresh, ready 200`);

  writeFileSync(join(local,'write-fault-check.json'),JSON.stringify({checked_at:new Date().toISOString(),boot:device.boot,checks},null,2));
  console.log(`T24 write-fault checks passed: ${checks.length} groups.`);
  for (const c of checks) console.log(`- ${c}`);
} catch(error) {console.error(`T24 check failed at ${stage} (${error.code ?? error.name}: ${error.message}).`);process.exitCode=1;}
finally {
  if (lock) {await lock.rollback().catch(()=>{}); lock.release();}
  await device?.offline().catch(()=>{});
  await pool.end();
}
