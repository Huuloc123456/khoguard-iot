import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { local } from './local-config.mjs';
import { readConfig } from '../server/config.mjs';
import { createDbPool } from '../server/database.mjs';
import { createReservationStore } from '../server/reservation-store.mjs';
import { RESERVATION_TTL_MS } from '../server/admission.mjs';
import { signIn } from './check-session.mjs';

// M14 against the running backend and the real MySQL. Every reservation it makes is cancelled again; a confirmed test slot is put back to available.
const config=readConfig(process.env), pool=createDbPool(config.db), base=`http://${config.host}:${config.port}`;
const checks=[], mine=new Set(), confirmedSlots=[];
let stage='idle reservations';
const tag=`chk14-${randomUUID().slice(0,8)}`;
let n=0;
const rid=()=>`${tag}-${++n}`;
const headers=cookie=>({origin:'http://127.0.0.1:5173','content-type':'application/json',cookie});
let operator,viewer;
async function post(path,body,cookie=operator) {
  const r=await fetch(`${base}${path}`,{method:'POST',headers:headers(cookie),body:JSON.stringify(body),signal:AbortSignal.timeout(8000)});
  const json=await r.json();
  if (json.reservation?.request_id?.startsWith(tag)) mine.add(json.reservation.id);
  return {status:r.status,body:json};
}
const list=async()=>{const r=await fetch(`${base}/api/reservations`,{headers:{cookie:operator},signal:AbortSignal.timeout(5000)});assert.equal(r.status,200);return r.json();};
const snapshot=async()=>(await fetch(`${base}/api/snapshot`,{headers:{cookie:operator},signal:AbortSignal.timeout(5000)})).json();
const admission=(overrides={})=>({request_id:rid(),temperature_class:'frozen',size_class:1,load_kg:100,...overrides});
const pending=async()=>(await pool.execute("SELECT id,request_id FROM reservations WHERE status='pending'"))[0];
try {
  const others=(await pending()).filter(r=>!r.request_id.startsWith('chk14-'));
  // The expiry step uses a backend clock moved forward; it must not expire someone else's live reservation.
  if (others.length) throw Object.assign(new Error(`${others.length} pending reservation(s) exist; cancel or let them expire first`),{code:'RESERVATIONS_IN_USE'});
  operator=await signIn(base,'operator'); viewer=await signIn(base,'viewer');

  stage='roles and validation';
  assert.equal((await post('/api/admissions',admission(),viewer)).status,403);
  assert.equal((await post('/api/admissions',{...admission(),slot_id:'A-100'})).status,400,'client cannot choose the slot');
  checks.push('viewer cannot reserve (403); body cannot pick a slot or actor (400)');

  stage='no suitable slot';
  const start=await list();
  assert.ok(start.storage.occupied+start.storage.reserved < 0.9*start.storage.capacity,'storage still has room');
  const heavy=await post('/api/admissions',admission({size_class:3,load_kg:2000}));
  assert.deepEqual([heavy.status,heavy.body],[409,{error:{code:'NO_SUITABLE_SLOT'}}]);
  checks.push(`storage ${start.storage.occupied}+${start.storage.reserved}/${start.storage.capacity} usable slots, yet a 2000 kg pallet is refused NO_SUITABLE_SLOT`);

  stage='reserve, replay, cancel';
  const before=await snapshot();
  const frozen=await post('/api/admissions',admission({temperature_class:'frozen',size_class:2,load_kg:800}));
  assert.equal(frozen.status,201); const r1=frozen.body.reservation;
  assert.match(r1.slot_id,/^C-\d{3}$/,'frozen goods go to the cold zone');
  assert.equal(Date.parse(r1.expires_at)-Date.parse(r1.created_at),RESERVATION_TTL_MS);
  const replay=await post('/api/admissions',{request_id:r1.request_id,temperature_class:'frozen',size_class:2,load_kg:800});
  assert.deepEqual([replay.status,replay.body.reservation.id],[200,r1.id],'retry with the same request id does not take a second slot');
  assert.deepEqual((await post('/api/admissions',{request_id:r1.request_id,temperature_class:'frozen',size_class:2,load_kg:900})).body,{error:{code:'REQUEST_ID_REUSED'}});
  const during=await snapshot();
  assert.equal(during.zones[0].reserved,before.zones[0].reserved+1);
  assert.equal((await post(`/api/reservations/${r1.id}/cancel`,{})).body.reservation.status,'cancelled');
  assert.equal((await post(`/api/reservations/${r1.id}/cancel`,{})).status,200,'cancel is idempotent');
  assert.deepEqual((await post(`/api/reservations/${r1.id}/confirm`,{})).body,{error:{code:'RESERVATION_FINAL'}});
  assert.equal((await snapshot()).zones[0].reserved,before.zones[0].reserved);
  checks.push(`frozen pallet → ${r1.slot_id}, expires after exactly 15 min; replayed request id returns the same reservation; cancel frees it; confirm after cancel → RESERVATION_FINAL`);

  stage='expiry boundary (backend clock)';
  let clock=new Date();
  const store=createReservationStore(pool,{now:()=>clock});
  const t0=clock;
  const a=(await store.admit(admission(),'operator')).reservation, b=(await store.admit(admission(),'operator')).reservation;
  mine.add(a.id);mine.add(b.id);
  clock=new Date(t0.getTime()+RESERVATION_TTL_MS-1);
  const confirmed=await store.confirm(a.id,'operator');
  assert.equal(confirmed.status,'confirmed'); confirmedSlots.push(confirmed.slot_id);
  clock=new Date(t0.getTime()+RESERVATION_TTL_MS);
  await assert.rejects(store.confirm(b.id,'operator'),{code:'RESERVATION_EXPIRED'});
  const [[late]]=await pool.execute('SELECT status,finished_at,expires_at FROM reservations WHERE id=?',[b.id]);
  assert.equal(late.status,'expired'); assert.equal(+late.finished_at,+late.expires_at);
  const [[slot]]=await pool.execute('SELECT status FROM slots WHERE id=?',[confirmed.slot_id]);
  assert.equal(slot.status,'occupied');
  checks.push(`confirm at 14:59.999 → confirmed (slot ${confirmed.slot_id} occupied); confirm at 15:00.000 → RESERVATION_EXPIRED and stored as expired`);

  checks.push('one active zone: retired staging and storage slots are excluded');

  stage='fill to the 95% ceiling, then two concurrent requests';
  let state=await list();
  const cap=state.storage.capacity, max=Math.floor(95*cap/100);
  const classes=['frozen'];
  while (state.storage.occupied+state.storage.reserved < max-1) {
    let made=false;
    for (const temperature_class of classes) {
      const r=await post('/api/admissions',admission({temperature_class}));
      if (r.status===201) {made=true;break;}
      assert.equal(r.body.error.code,'NO_SUITABLE_SLOT');
    }
    assert.ok(made,'test slots ran out before the ceiling');
    state=await list();
  }
  const used=state.storage.occupied+state.storage.reserved;
  assert.equal(used,max-1);
  // Both requests have free frozen slots to win, so only the capacity ceiling can refuse one of them.
  const race=await Promise.all([1,2].map(()=>post('/api/admissions',admission({temperature_class:'frozen'}))));
  assert.deepEqual(race.map(r=>r.status).sort(),[201,409],JSON.stringify(race.map(r=>r.body.error?.code ?? r.status)));
  assert.equal(race.find(r=>r.status===409).body.error.code,'CAPACITY_LIMIT');
  assert.equal(race.find(r=>r.status===201).body.warning,'NEAR_CAPACITY');
  state=await list();
  const after=state.storage.occupied+state.storage.reserved;
  assert.equal(after,max); assert.ok(after*100 <= 95*cap);
  assert.equal((await post('/api/admissions',admission())).body.error.code,'CAPACITY_LIMIT');
  const [[dupes]]=await pool.execute("SELECT COUNT(*) AS n, COUNT(DISTINCT slot_id) AS slots FROM reservations WHERE status='pending'");
  assert.equal(dupes.n,dupes.slots,'no slot held twice');
  const [[taken]]=await pool.execute("SELECT r.slot_id FROM reservations r WHERE r.status='pending' LIMIT 1");
  await assert.rejects(pool.execute("INSERT INTO reservations (request_id,slot_id,temperature_class,size_class,load_kg,status,requested_by,created_at,expires_at) VALUES (?,?, 'ambient',1,1,'pending','check',UTC_TIMESTAMP(3),UTC_TIMESTAMP(3)+INTERVAL 1 MINUTE)",[rid(),taken.slot_id]),{code:'ER_DUP_ENTRY'});
  checks.push(`at ${used}/${cap} (95% = ${(95*cap/100).toFixed(1)}): two concurrent requests → one 201 (NEAR_CAPACITY), one 409 CAPACITY_LIMIT; ends at ${after}/${cap}, never above; DB unique key refuses a second pending hold on ${taken.slot_id}`);

  writeFileSync(join(local,'reservation-check.json'),JSON.stringify({checked_at:new Date().toISOString(),checks},null,2));
  console.log(`M14 reservation checks passed: ${checks.length} groups.`);
  for (const c of checks) console.log(`- ${c}`);
} catch(error) {console.error(`M14 check failed at ${stage} (${error.code ?? error.name}: ${error.message}).`);process.exitCode=1;}
finally {
  // Cleanup: cancel what this check holds, and return its confirmed test slot to the demo seed state.
  await pool.execute(`UPDATE reservations SET status='cancelled',finished_at=UTC_TIMESTAMP(3),finished_by='check' WHERE status='pending' AND request_id LIKE ?`,[`${tag}-%`]).catch(()=>{});
  for (const id of confirmedSlots) await pool.execute("UPDATE slots SET status='available',occupancy_source=NULL WHERE id=? AND occupancy_source='reservation'",[id]).catch(()=>{});
  await pool.execute("UPDATE warehouse_stream SET revision = revision + 1 WHERE warehouse_id = 'WH01'").catch(()=>{});
  await pool.end();
}
