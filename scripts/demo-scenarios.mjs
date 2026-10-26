import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { local } from './local-config.mjs';
import { readConfig } from '../server/config.mjs';
import { createDbPool } from '../server/database.mjs';
import { shiftAt } from '../server/auth.mjs';
import { signIn } from './check-session.mjs';
import { FakeEdge } from './sim-lib.mjs';

// M16: the four final demos (Agent.md §11) end to end through MQTT → backend → MySQL → API, with a FAKE ESP-C01.
// The fake edge copies the M09 close rules in reduced form; on Wokwi the same steps are done by hand with the real firmware.
// Usage: npm run demo:scenarios -- --scenario=all|1|2|3|4   (backend running; Wokwi ESP-C01 must be stopped)
const pick = (/^--scenario=(all|[1-4])$/.exec(process.argv.slice(2).join(' ')) ?? [, 'all'])[1];
const config=readConfig(process.env), pool=createDbPool(config.db), base=`http://${config.host}:${config.port}`;
const report=[]; let cookie, edge, scenario='setup';
let virtual=0; const clock=()=>(virtual+=500);
const step=text=>{report.push({scenario,step:text});console.log(`  ✓ ${text}`);};
const headers=()=>({origin:'http://127.0.0.1:5173','content-type':'application/json',cookie});
const get=async path=>{const r=await fetch(`${base}${path}`,{headers:{cookie},signal:AbortSignal.timeout(5000)});assert.equal(r.status,200,path);return r.json();};
const post=async(path,body)=>{const r=await fetch(`${base}${path}`,{method:'POST',headers:headers(),body:JSON.stringify(body),signal:AbortSignal.timeout(8000)});return {status:r.status,body:await r.json()};};
async function until(read,accept,ms=10000) {const end=Date.now()+ms;let last;while (Date.now()<end) {try {last=await read();if (accept(last)) return last;} catch {} await delay(150);}throw new Error(`timeout waiting (${scenario})`);}
const snap=()=>get('/api/snapshot');
const esp=s=>s.devices.find(d=>d.id==='ESP-C01');
const zoneC=s=>s.zones.find(z=>z.id==='C');
const alertOf=(s,code,door)=>s.alerts.find(a=>a.zone==='C' && a.code===code && (door===undefined || a.door_id===door) && a.state==='active');
async function sync() {await edge.telemetry(); return until(snap,s=>esp(s).boot_id===edge.boot && esp(s).freshness==='fresh' && esp(s).controller_revision===edge.revision);}
async function command(door,action) {
  await sync();
  const r=await post(`/api/doors/${door}/commands`,{action}); assert.equal(r.status,202,`${action} ${door}: ${JSON.stringify(r.body)}`);
  return until(()=>get(`/api/commands/${r.body.command_id}`),c=>c.status!=='pending');
}
const rfid=(card,direction,result='accepted')=>edge.event({event_type:'rfid',door_id:'D07',card_id:card,direction,result});
async function scenario1() {
  scenario='1 ra/vào hợp lệ';
  const card=shiftAt(new Date()).code==='DAY' ? 'DEMO-017':'DEMO-018', since=new Date(Date.now()-1000).toISOString();
  assert.equal((await command('D07','open')).status,'applied'); step('D07 mở theo lệnh (applied)');
  await rfid(card,'in'); edge.state.count=1; edge.state.presence=true; edge.revision++;
  let s=await sync(); assert.equal(zoneC(s).occupancy.current_occupants,1); step(`${card} vào đúng ca → khu C 1 người`);
  const audit=await until(()=>get(`/api/reports/access?from=${encodeURIComponent(since)}`),p=>p.items.some(i=>i.card_id===card));
  assert.equal(audit.items.find(i=>i.card_id===card).decision,'in_shift'); step('access audit: in_shift');
  const blocked=await command('D07','close'); assert.deepEqual([blocked.status,blocked.reason],['rejected','OCCUPIED']); step('đóng D07 khi còn người → rejected OCCUPIED');
  await rfid(card,'out'); edge.state.count=0; edge.state.presence=false; edge.revision++;
  s=await sync(); assert.equal(zoneC(s).occupancy.current_occupants,0); step(`${card} ra → 0 người`);
  assert.equal((await command('D07','close')).status,'applied');
  s=await until(snap,x=>x.doors.find(d=>d.id==='D07').state==='closed'); step('beam/presence clear → đóng D07 applied, snapshot D07 đóng');
}
async function scenario2() {
  scenario='2 RFID 0 nhưng còn người';
  assert.equal((await command('D07','open')).status,'applied');
  edge.state.count=0; edge.state.presence=true; edge.revision++;
  let s=await until(async()=>{await edge.telemetry();return snap();},x=>alertOf(x,'PRESENCE_MISMATCH'));
  step(`count 0 + PIR → cảnh báo "${alertOf(s,'PRESENCE_MISMATCH').title}"`);
  const blocked=await command('D07','close'); assert.deepEqual([blocked.status,blocked.reason],['rejected','PRESENCE_DETECTED']); step('đóng D07 → rejected PRESENCE_DETECTED');
  edge.state.presence=false; edge.revision++;
  s=await until(async()=>{await edge.telemetry();return snap();},x=>!alertOf(x,'PRESENCE_MISMATCH')); step('PIR hết → cảnh báo tự hết');
  assert.equal((await command('D07','close')).status,'applied'); step('đóng lại → applied');
}
async function scenario3() {
  scenario='3 khẩn cấp';
  const d07=edge.state.doors.D07; assert.equal(d07.state,'closed');
  await edge.event({event_type:'panic',door_id:'D07',input:'panic_low'});
  Object.assign(d07,{panic_latched:true,state:'open',locked:false}); edge.revision++;
  let s=await sync(); const panic=alertOf(s,'PANIC_ACTIVE','D07'); assert.equal(panic.level,'danger');
  assert.deepEqual([s.doors.find(d=>d.id==='D07').state,s.doors.find(d=>d.id==='D07').locked],['open',false]); step('cửa đóng → nhấn panic → D07 mở, nhả khóa, cảnh báo danger');
  assert.equal((await post(`/api/alerts/${panic.id}/ack`,{})).status,200);
  s=await snap(); assert.equal(alertOf(s,'PANIC_ACTIVE','D07').acknowledged,true); step('tiếp nhận: vẫn active, latch giữ nguyên');
  const close=await command('D07','close'); assert.deepEqual([close.status,close.reason],['rejected','PANIC_ACTIVE']); step('đóng khi panic chốt → rejected PANIC_ACTIVE');
  // Network loss: the edge keeps its local state, queues events, one is dropped (bounded queue), then reconnects on a new session.
  await edge.offline(); s=await until(snap,x=>esp(x).state==='offline'); step('ESP-C01 ngắt kết nối (status offline); panic vẫn chốt tại edge');
  const queued=edge.envelope('events',{event_type:'panic',door_id:'D08',input:'panic_high'}); queued.event_id=`${queued.boot_id}:${queued.seq}`;
  edge.seq.events++; // dropped by the full queue
  const last=edge.envelope('events',{event_type:'door',door_id:'D08',state:'open'}); last.event_id=`${last.boot_id}:${last.seq}`;
  Object.assign(edge.state.doors.D08,{panic_latched:true,state:'open',locked:false}); edge.revision++;
  await edge.connect();
  // Like the firmware, queued events keep their seq/event_id and go out under the current session.
  queued.session_id=last.session_id=edge.session;
  await edge.publish(queued); await edge.publish(last); await edge.publish(last);
  s=await sync(); assert.ok(alertOf(s,'PANIC_ACTIVE','D08'));
  const page=await get('/api/events?device_id=ESP-C01');
  assert.ok(page.gaps.some(g=>g.boot_id===edge.boot && g.from_seq===queued.seq+1 && g.to_seq===queued.seq+1));
  const [dupes]=await pool.execute('SELECT COUNT(*) AS n FROM device_events WHERE device_id=? AND event_id=?',['ESP-C01',last.event_id]);
  assert.equal(Number(dupes[0].n),1); step(`kết nối lại phiên mới: event xếp hàng được giao, event gửi lặp lưu 1 lần, event bị mất hiện gap seq ${queued.seq+1}`);
  for (const id of ['D07','D08']) {edge.state.doors[id].panic_latched=true;assert.equal((await command(id,'reset_panic')).status,'applied');}
  for (const id of ['D07','D08']) assert.equal((await command(id,'close')).status,'applied');
  s=await until(async()=>{await edge.telemetry();return snap();},x=>!alertOf(x,'PANIC_ACTIVE')); step('đặt lại khẩn cấp (lệnh riêng) rồi đóng → cảnh báo hết');
}
async function scenario4() {
  scenario='4 kho đầy';
  const [others]=await pool.execute("SELECT COUNT(*) AS n FROM reservations WHERE status='pending'");
  if (Number(others[0].n)) throw new Error('pending reservations exist; finish them before demo 4');
  const tag=`demo4-${randomUUID().slice(0,8)}`; let n=0;
  const admit=(temperature_class='frozen')=>post('/api/admissions',{request_id:`${tag}-${++n}`,temperature_class,size_class:1,load_kg:100});
  try {
    let st=await get('/api/reservations'); const cap=st.storage.capacity, max=Math.floor(95*cap/100);
    while (st.storage.occupied+st.storage.reserved<max-1) {
      let ok=false; for (const c of ['frozen']) {const r=await admit(c); if (r.status===201) {ok=true;break;}}
      assert.ok(ok,'no demo slots left'); st=await get('/api/reservations');
    }
    step(`giữ chỗ demo tới ${max-1}/${cap} (95% = ${(95*cap/100).toFixed(1)})`);
    const race=await Promise.all([admit(),admit()]);
    assert.deepEqual(race.map(r=>r.status).sort(),[201,409]); step('hai yêu cầu đồng thời → một 201, một 409 CAPACITY_LIMIT');
    const full=await admit(); assert.equal(full.body.error.code,'CAPACITY_LIMIT');
    st=await get('/api/reservations'); assert.equal(st.storage.occupied+st.storage.reserved,max); step(`ở ${max}/${cap}: yêu cầu mới bị từ chối CAPACITY_LIMIT, không vượt trần`);
  } finally {
    await pool.execute("UPDATE reservations SET status='cancelled',finished_at=UTC_TIMESTAMP(3),finished_by='demo-reset' WHERE status='pending' AND request_id LIKE ?",[`${tag}-%`]);
    await pool.execute("UPDATE warehouse_stream SET revision = revision + 1 WHERE warehouse_id = 'WH01'");
    step('reset: hủy các giữ chỗ demo');
  }
}
try {
  cookie=await signIn(base,'operator');
  edge=new FakeEdge({config,clock,label:'demo'}); await edge.connect(); await sync();
  for (const [id,run] of [['1',scenario1],['2',scenario2],['3',scenario3],['4',scenario4]]) if (pick==='all' || pick===id) {console.log(`Demo ${id}:`); await run();}
  writeFileSync(join(local,'demo-scenarios.json'),JSON.stringify({checked_at:new Date().toISOString(),edge:'fake ESP-C01 (Node)',steps:report},null,2));
  console.log(`M16 demo scenarios passed: ${new Set(report.map(r=>r.scenario)).size} scenario(s), ${report.length} steps.`);
} catch(error) {console.error(`Demo failed in ${scenario} (${error.code ?? error.name}: ${error.message}); secrets not printed.`);process.exitCode=1;}
finally {await edge?.offline(); await pool.end();}
