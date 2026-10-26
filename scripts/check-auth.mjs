import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import mqtt from 'mqtt';
import WebSocket from 'ws';
import { local, readJson } from './local-config.mjs';
import { readConfig } from '../server/config.mjs';
import { createDbPool } from '../server/database.mjs';
import { brokerOptions } from '../server/mqtt.mjs';
import { shiftAt, accessDecision } from '../server/auth.mjs';
import { validateMqttMessage } from '../contracts/validate.js';

// M13 against the running backend: login, roles, WebSocket session and shift access audit. Passwords come from .local, never printed.
const config=readConfig(process.env), pool=createDbPool(config.db), base=`http://${config.host}:${config.port}`;
const passwords=readJson(join(local,'dashboard-users.json')), accounts=readJson(join(local,'mosquitto/accounts.json'));
const checks=[];
let device,stage='anonymous';
const origin='http://127.0.0.1:5173';
const post=(path,body,cookie,extra={})=>fetch(`${base}${path}`,{method:'POST',body:typeof body==='string' ? body:JSON.stringify(body),signal:AbortSignal.timeout(5000),
  headers:{origin,'content-type':'application/json',...(cookie ? {cookie}:{}),...extra}});
const get=(path,cookie)=>fetch(`${base}${path}`,{signal:AbortSignal.timeout(5000),headers:cookie ? {cookie}:{}});
async function login(role) {
  const r=await post('/api/auth/login',{username:role,password:passwords[role]});
  assert.equal(r.status,200,`login ${role}`);
  return r.headers.get('set-cookie').split(';')[0];
}
const wsOpen=cookie=>new Promise((resolve,reject)=>{
  const ws=new WebSocket(`ws://${config.host}:${config.port}/ws`,{origin,headers:cookie ? {cookie}:{}});
  ws.once('message',()=>resolve(ws));ws.once('unexpected-response',(_,res)=>{reject(Object.assign(new Error('WS_REFUSED'),{status:res.statusCode}));ws.terminate();});ws.once('error',()=>{});
});
const boot=`auth-${randomUUID()}`,session=`s-${randomUUID()}`;
const topic=kind=>`khoguard/v1/WH01/devices/ESP-C01/${kind}`;
const envelope=(kind,n,payload,extra={})=>({schema_version:1,warehouse_id:'WH01',device_id:'ESP-C01',boot_id:boot,session_id:session,seq:n,kind,
  clock_synced:false,sent_at:null,uptime_ms:n*1000+500,...extra,payload:{zone_id:'C',...payload}});
const door=id=>({door_id:id,state:'closed',beam_clear:true,panic_latched:false,local_inputs_healthy:true,locked:true});
const telemetry=(n,count,presence)=>envelope('telemetry',n,{controller_revision:n,environment:{temperature_c:-18.1,humidity_pct:55},
  occupancy:{current_occupants:count,count_verified:true,presence},doors:[door('D07'),door('D08')]});
const rfid=(n,card,direction,result)=>envelope('events',n,{event_type:'rfid',door_id:'D07',card_id:card,direction,result},{event_id:`${boot}:${n}`});
async function publish(m,retain=false) {const raw=JSON.stringify(m);assert.equal(validateMqttMessage(topic(m.kind),raw).ok,true);await device.publishAsync(topic(m.kind),raw,{qos:1,retain});}
async function until(read,accept,ms=10000) {const end=Date.now()+ms;while (Date.now()<end) {const v=await read();if (accept(v)) return v;await delay(150);}throw new Error('CHECK_TIMEOUT');}
try {
  for (const path of ['/api/snapshot','/api/events','/api/access','/api/auth/me']) assert.equal((await get(path)).status,401,path);
  assert.equal((await post('/api/doors/D07/commands',{action:'open'})).status,401);
  await assert.rejects(wsOpen(),e=>e.status===401);
  assert.equal((await get('/api/snapshot',`kg_session=${'A'.repeat(43)}`)).status,401);
  checks.push('without a valid session: REST data/mutations 401 and WebSocket upgrade 401');

  stage='login';
  assert.equal((await post('/api/auth/login',{username:'operator',password:'wrong-password'})).status,401);
  assert.equal((await post('/api/auth/login',{username:'operator',password:passwords.operator},null,{origin:'http://evil.example'})).status,403);
  const probe=`probe-${randomUUID().slice(0,8)}`;
  for (let i=0;i<5;i++) assert.equal((await post('/api/auth/login',{username:probe,password:'x'.repeat(12)})).status,401);
  assert.equal((await post('/api/auth/login',{username:probe,password:'x'.repeat(12)})).status,429);
  const operator=await login('operator');
  assert.match(operator,/^kg_session=[A-Za-z0-9_-]{43}$/);
  const [stored]=await pool.execute('SELECT token_hash FROM user_sessions WHERE token_hash = ?',[createHash('sha256').update(operator.split('=')[1]).digest('hex')]);
  const [plain]=await pool.execute('SELECT COUNT(*) AS n FROM user_sessions WHERE token_hash = ?',[operator.split('=')[1]]);
  assert.equal(stored.length,1);assert.equal(plain[0].n,0);
  checks.push('wrong password 401, foreign Origin 403, 5 failures lock the username (429); session stored only as SHA-256');

  stage='roles';
  const viewer=await login('viewer'), admin=await login('admin');
  assert.equal((await get('/api/snapshot',viewer)).status,200);
  for (const [path,body] of [['/api/doors/D07/commands',{action:'open'}],['/api/alerts/AL-1/ack',{}]]) {
    const r=await post(path,body,viewer);assert.equal(r.status,403,path);assert.deepEqual(await r.json(),{error:{code:'FORBIDDEN_ROLE'}});
  }
  assert.equal((await get('/api/access',viewer)).status,403);
  assert.equal((await post('/api/doors/D07/commands',{action:'open'},operator)).status,409,'operator passes auth; refused only because no live device');
  assert.equal((await get('/api/access',operator)).status,200);
  assert.equal((await get('/api/auth/audit',operator)).status,403);
  const auditPage=await (await get('/api/auth/audit',admin)).json();
  for (const action of ['login','login_failed','login_locked','denied']) assert.ok(auditPage.items.some(i=>i.action===action),action);
  checks.push('viewer reads but backend refuses commands/ack/access log (403, audited); operator controls; only admin reads the login audit');

  stage='WebSocket session';
  const ws=await wsOpen(operator);
  const closed=once(ws,'close');
  assert.equal((await post('/api/auth/logout','{}',operator)).status,200);
  const [code]=await Promise.race([closed,delay(8000).then(()=>[0])]);
  assert.equal(code,4401,'open stream closed after logout');
  assert.equal((await get('/api/snapshot',operator)).status,401);
  checks.push('logout revokes the session: REST 401 and the open WebSocket closes with 4401 within 5 s');

  stage='shift access audit';
  device=mqtt.connect({...brokerOptions(config.mqtt),username:'ESP-C01',password:accounts['ESP-C01'],clientId:`kg-auth-${randomUUID()}`,reconnectPeriod:0,clean:true});
  device.on('error',()=>{});await once(device,'connect',{signal:AbortSignal.timeout(5000)});
  await publish(envelope('status',0,{state:'online'}),true);
  await publish(telemetry(1,0,false));
  const op2=await login('operator');
  await until(async()=>(await (await get('/api/snapshot',op2)).json()).devices.find(d=>d.id==='ESP-C01').boot_id,id=>id===boot);
  const shift=shiftAt(new Date()), since=new Date(Date.now()-1000).toISOString();
  await publish(rfid(1,'DEMO-017','in','accepted'));
  await publish(rfid(2,'DEMO-018','in','accepted'));
  await publish(rfid(3,'DEMO-018','out','accepted'));
  await publish(rfid(4,'DEMO-999','in','unauthorized'));
  await publish(telemetry(2,1,true));
  const items=(await until(async()=>(await (await get('/api/access',op2)).json()).items,list=>list.filter(i=>i.at>=since).length>=4)).filter(i=>i.at>=since).slice(0,4).reverse();
  const expected=[['DEMO-017','in',{card_id:'DEMO-017',shift_code:'DAY',active:true}],['DEMO-018','in',{card_id:'DEMO-018',shift_code:'NIGHT',active:true}],['DEMO-018','out',{card_id:'DEMO-018',shift_code:'NIGHT',active:true}]]
    .map(([card,direction,row])=>[card,direction,accessDecision(row,'accepted',direction,shift)]).concat([['DEMO-999','in','edge_rejected']]);
  assert.deepEqual(items.map(i=>[i.card_id,i.direction,i.decision]),expected);
  assert.ok(items.every(i=>i.shift_code===shift.code && i.shift_date===shift.date));
  assert.ok(expected.some(e=>e[2]==='out_of_shift'),'one demo card is always outside the current shift');
  const snapshot=await until(async()=>(await (await get('/api/snapshot',op2)).json()),s=>s.zones[0].occupancy.current_occupants===1);
  assert.deepEqual(snapshot.zones[0].occupancy,{current_occupants:1,count_verified:true,presence:true},'out-of-shift entry still counts; protection unchanged');
  checks.push(`shift ${shift.code} ${shift.date}: ${expected.map(e=>`${e[0]} ${e[1]}=${e[2]}`).join(', ')}; out-of-shift entry still counted (count 1, presence) — audit never disables protection`);

  await publish(envelope('status',0,{state:'offline'}),true);
  writeFileSync(join(local,'auth-check.json'),JSON.stringify({checked_at:new Date().toISOString(),checks},null,2));
  console.log(`M13 auth checks passed: ${checks.length} groups.`);
  for (const c of checks) console.log(`- ${c}`);
} catch(error) {console.error(`M13 check failed at ${stage} (${error.code ?? error.name}: ${error.message}); passwords not printed.`);process.exitCode=1;}
finally {await device?.endAsync(true);await pool.end();}
