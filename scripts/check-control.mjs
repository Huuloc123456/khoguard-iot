import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import mqtt from 'mqtt';
import { brokerOptions } from '../server/mqtt.mjs';
import { local, readJson } from './local-config.mjs';
import { readConfig } from '../server/config.mjs';
import { signIn, authFetch } from './check-session.mjs';
import { createDbPool } from '../server/database.mjs';
import { validateMqttMessage, validateSnapshot } from '../contracts/validate.js';

// Plays ESP-C01 (same frames as the firmware) against the running backend: commands, acks and alerts end to end.
const config=readConfig(process.env), pool=createDbPool(config.db), base=`http://${config.host}:${config.port}`;
const accounts=readJson(join(local,'mosquitto/accounts.json'));
const checks=[], received=[];
let device,stage='connect',seq=0,ackSeq=0,revision=100;
const boot=`control-${randomUUID()}`, session=`session-${randomUUID()}`;
const topic=kind=>`khoguard/v1/WH01/devices/ESP-C01/${kind}`;
const envelope=(kind,n,payload,ids={})=>({schema_version:1,warehouse_id:'WH01',device_id:'ESP-C01',boot_id:ids.boot ?? boot,session_id:ids.session ?? session,seq:n,kind,
  clock_synced:false,sent_at:null,uptime_ms:n*1000+500,payload:{zone_id:'C',...payload}});
const door=(door_id,extra={})=>({door_id,state:'closed',beam_clear:true,panic_latched:false,local_inputs_healthy:true,locked:true,...extra});
function telemetry({alarms=[],temperature=-18.2,doors=[door('D07'),door('D08')],presence=false}={}) {
  seq++; revision++;
  return envelope('telemetry',seq,{controller_revision:revision,environment:{temperature_c:temperature,humidity_pct:55},
    occupancy:{current_occupants:0,count_verified:true,presence},doors,alarms,outputs:{light:alarms.length>0,buzzer:false,heater:false,fan:true}});
}
async function publish(message,options={}) {
  const raw=JSON.stringify(message);
  assert.equal(validateMqttMessage(topic(message.kind),raw).ok,true,`fixture ${message.kind} must match the contract`);
  await device.publishAsync(topic(message.kind),raw,{qos:1,retain:options.retain ?? false});
}
const ack=(command,status,reason=null,ids)=>envelope('acks',++ackSeq,{door_id:command.payload.door_id,command_id:command.payload.command_id,status,reason},ids);
const json=async path=>{const r=await authFetch(`${base}${path}`,{signal:AbortSignal.timeout(5000)});assert.equal(r.status,200,path);return r.json();};
const post=(path,body,origin='http://127.0.0.1:5173')=>authFetch(`${base}${path}`,{method:'POST',body,signal:AbortSignal.timeout(5000),
  headers:{'content-type':'application/json',...(origin ? {origin}:{})}});
async function until(read,accept,ms=10000) {
  const end=Date.now()+ms;
  while (Date.now()<end) {const value=await read(); if (accept(value)) return value; await delay(100);}
  throw new Error('CHECK_TIMEOUT');
}
const snapshot=async()=>{const s=await json('/api/snapshot');assert.equal(validateSnapshot(s).ok,true);return s;};
const mine=(s,code,door_id=null)=>s.alerts.find(a=>a.code===code && a.door_id===door_id && a.zone==='C');
const nextCommand=()=>until(async()=>received.shift(),c=>c!==undefined,5000);
async function command(doorId,action) {
  const r=await post(`/api/doors/${doorId}/commands`,JSON.stringify({action}));
  assert.equal(r.status,202,`${doorId} ${action}`);
  return {created:await r.json(),message:await nextCommand()};
}
async function live() {
  const before=revision+1;
  await publish(telemetry());
  await until(snapshot,s=>s.devices.find(d=>d.id==='ESP-C01').controller_revision===before && s.devices.find(d=>d.id==='ESP-C01').freshness==='fresh');
}
try {
  await signIn(base);
  device=mqtt.connect({...brokerOptions(config.mqtt),username:'ESP-C01',password:accounts['ESP-C01'],clientId:`kg-control-${randomUUID()}`,reconnectPeriod:0,clean:true});
  device.on('error',()=>{});await once(device,'connect',{signal:AbortSignal.timeout(5000)});
  await device.subscribeAsync(topic('commands'),{qos:1});
  device.on('message',(t,payload,packet)=>{
    assert.equal(packet.retain,false,'commands are never retained');
    const v=validateMqttMessage(t,payload.toString());assert.equal(v.ok,true);received.push(v.value);
  });

  stage='command requires a live session';
  const offline=await post('/api/doors/D07/commands','{"action":"close"}');
  assert.equal(offline.status,409);assert.deepEqual(await offline.json(),{error:{code:'DEVICE_NOT_LIVE'}});
  await publish(envelope('status',0,{state:'online'}),{retain:true});
  await live();
  assert.equal((await post('/api/doors/D07/commands','{"action":"close"}','http://evil.example')).status,403);
  assert.equal((await post('/api/doors/D07/commands','{"action":"close"}',null)).status,403);
  assert.equal((await post('/api/doors/D01/commands','{"action":"open"}')).status,409);
  assert.equal((await post('/api/doors/D07/commands','{"action":"unlock"}')).status,400);
  await delay(300);assert.equal(received.length,0,'refused requests publish nothing');
  checks.push('no live session -> 409 DEVICE_NOT_LIVE; foreign/missing Origin 403; simulator door 409; unknown action 400; none of them publish');

  stage='applied ack';
  const before=await snapshot();
  let {created,message}=await command('D07','open');
  assert.equal(created.status,'pending');
  assert.deepEqual([message.boot_id,message.session_id,message.payload.expected_revision,message.payload.action],[boot,session,revision,'open']);
  const pending=await json(`/api/commands/${created.command_id}`);
  assert.equal(pending.status,'pending');
  const unchanged=await snapshot();
  assert.equal(unchanged.doors.find(d=>d.id==='D07').state,before.doors.find(d=>d.id==='D07').state,'a command alone never moves the door in the UI');
  await publish(ack(message,'applied',null,{boot:'other-boot',session:'other-session'}));
  await delay(300);assert.equal((await json(`/api/commands/${created.command_id}`)).status,'pending','ack from another session is ignored');
  await publish(ack(message,'applied'));
  await until(()=>json(`/api/commands/${created.command_id}`),c=>c.status==='applied');
  await publish(ack(message,'rejected','PRESENCE_DETECTED'));
  await delay(300);
  const applied=await json(`/api/commands/${created.command_id}`);
  assert.deepEqual([applied.status,applied.reason,applied.late_ack],['applied',null,null],'a duplicate/conflicting ack never rewrites the final state');
  await publish(telemetry({doors:[door('D07',{state:'open',locked:false,open_ms:0}),door('D08')]}));
  const moved=await until(snapshot,s=>s.doors.find(d=>d.id==='D07').state==='open');
  assert.equal(moved.doors.find(d=>d.id==='D07').locked,false);
  checks.push('command carries live boot/session/revision; UI door changes only from telemetry; foreign-session and duplicate acks change nothing');

  stage='rejected ack';
  await live();
  ({created,message}=await command('D07','close'));
  await publish(ack(message,'rejected','PRESENCE_DETECTED'));
  const rejected=await until(()=>json(`/api/commands/${created.command_id}`),c=>c.status!=='pending');
  assert.deepEqual([rejected.status,rejected.reason],['rejected','PRESENCE_DETECTED']);
  ({created,message}=await command('D08','open'));
  await publish(ack(message,'expired','COMMAND_EXPIRED'));
  const edgeExpired=await until(()=>json(`/api/commands/${created.command_id}`),c=>c.status!=='pending');
  assert.deepEqual([edgeExpired.status,edgeExpired.reason],['expired','COMMAND_EXPIRED']);
  checks.push('edge rejection reason (PRESENCE_DETECTED) and edge-side expiry (COMMAND_EXPIRED) are stored as reported');

  stage='door-open alert lifecycle';
  await publish(telemetry({alarms:[{code:'DOOR_OPEN_WARNING',door_id:'D07'}],doors:[door('D07',{state:'open',locked:false,open_ms:30000}),door('D08')]}));
  let s=await until(snapshot,x=>mine(x,'DOOR_OPEN','D07')?.state==='active');
  const alertId=mine(s,'DOOR_OPEN','D07').id;
  assert.deepEqual([mine(s,'DOOR_OPEN','D07').level,mine(s,'DOOR_OPEN','D07').acknowledged,s.doors.find(d=>d.id==='D07').open_seconds],['warning',false,30]);
  assert.equal((await post(`/api/alerts/${alertId}/ack`,'{}','http://evil.example')).status,403);
  const acked=await post(`/api/alerts/${alertId}/ack`,'{}');
  assert.equal(acked.status,200);
  s=await snapshot();
  assert.deepEqual([mine(s,'DOOR_OPEN','D07').state,mine(s,'DOOR_OPEN','D07').acknowledged],['active',true],'ack does not clear the danger');
  const [audit]=await pool.execute('SELECT actor,alert_state,alert_level FROM alert_acks WHERE alert_id=? ORDER BY id DESC LIMIT 1',[Number(alertId.slice(3))]);
  assert.deepEqual(audit[0],{actor:'operator',alert_state:'active',alert_level:'warning'});
  await publish(telemetry({alarms:[{code:'DOOR_OPEN_CRITICAL',door_id:'D07'}],doors:[door('D07',{state:'open',locked:false,open_ms:60001}),door('D08')]}));
  s=await until(snapshot,x=>mine(x,'DOOR_OPEN','D07')?.level==='danger');
  assert.deepEqual([mine(s,'DOOR_OPEN','D07').id,mine(s,'DOOR_OPEN','D07').acknowledged],[alertId,false],'escalation stays one alert and needs a new ack');
  await publish(telemetry());
  s=await until(snapshot,x=>mine(x,'DOOR_OPEN','D07')?.state==='resolved');
  assert.ok(mine(s,'DOOR_OPEN','D07').resolved_at);
  const occurrences=async()=>(await pool.execute('SELECT occurrences FROM alerts WHERE id=?',[Number(alertId.slice(3))]))[0][0].occurrences;
  const seen=await occurrences();
  await publish(telemetry({alarms:[{code:'DOOR_OPEN_WARNING',door_id:'D07'}],doors:[door('D07',{state:'open',locked:false,open_ms:30000}),door('D08')]}));
  s=await until(snapshot,x=>mine(x,'DOOR_OPEN','D07')?.state==='active');
  assert.equal(mine(s,'DOOR_OPEN','D07').id,alertId,'flapping within the window reopens the same alert');
  assert.equal(await occurrences(),seen+1);
  await publish(telemetry());
  await until(snapshot,x=>mine(x,'DOOR_OPEN','D07')?.state==='resolved');
  checks.push('door open: warning raised, ack audited without clearing, escalation to danger in the same alert resets ack, resolves on close, reopens the same row (occurrences+1) instead of spamming');

  stage='panic, trapped and temperature hysteresis';
  await publish(telemetry({alarms:[{code:'TRAPPED_PERSON'}],presence:true,doors:[door('D07',{panic_latched:true,state:'open',locked:false,open_ms:0}),door('D08',{locked:false})]}));
  s=await until(snapshot,x=>mine(x,'TRAPPED_PERSON')?.state==='active' && mine(x,'PANIC_ACTIVE','D07')?.state==='active');
  assert.equal(mine(s,'TRAPPED_PERSON').level,'danger');
  await publish(telemetry({temperature:-15.9}));
  s=await until(snapshot,x=>mine(x,'TEMPERATURE_OUT_OF_RANGE')?.state==='active');
  assert.equal(mine(s,'PANIC_ACTIVE','D07').state,'resolved');
  await publish(telemetry({temperature:-16.2}));
  await until(snapshot,x=>x.zones[2].environment.temperature_c===-16.2);
  assert.equal(mine(await snapshot(),'TEMPERATURE_OUT_OF_RANGE').state,'active','back inside by less than the hysteresis keeps it active');
  await publish(telemetry({temperature:-16.6}));
  await until(snapshot,x=>mine(x,'TEMPERATURE_OUT_OF_RANGE')?.state==='resolved');
  checks.push('panic and trapped person raise danger alerts and resolve when the edge clears them; temperature -15.9 raises, -16.2 holds (hysteresis 0.5 °C), -16.6 resolves');

  stage='command expiry and late ack';
  await live();
  ({created,message}=await command('D08','close'));
  const expired=await until(()=>json(`/api/commands/${created.command_id}`),c=>c.status==='expired',15000);
  assert.equal(expired.reason,'COMMAND_EXPIRED');
  await publish(ack(message,'applied'));
  const late=await until(()=>json(`/api/commands/${created.command_id}`),c=>c.late_ack!==null);
  assert.deepEqual([late.status,late.late_ack],['expired','applied']);
  await publish(ack(message,'rejected','BEAM_BLOCKED'));
  await delay(300);assert.equal((await json(`/api/commands/${created.command_id}`)).late_ack,'applied');
  checks.push('no ack within TTL 10 s + 2 s grace -> expired/COMMAND_EXPIRED; the later edge ack is kept once as late_ack');

  stage='offline alert';
  await publish(envelope('status',0,{state:'offline'}),{retain:true});
  s=await until(snapshot,x=>mine(x,'DEVICE_OFFLINE_ESP_C01')?.state==='active');
  assert.equal((await post('/api/doors/D07/commands','{"action":"open"}')).status,409,'no commands to an offline device');
  checks.push('Last Will offline raises DEVICE_OFFLINE_ESP_C01 and blocks new commands');

  writeFileSync(join(local,'control-check.json'),JSON.stringify({checked_at:new Date().toISOString(),checks},null,2));
  console.log(`M10/M11 control checks passed: ${checks.length} groups.`);
  for (const c of checks) console.log(`- ${c}`);
} catch(error) {console.error(`M10/M11 check failed at ${stage} (${error.code ?? error.name}: ${error.message}); secrets not printed.`);process.exitCode=1;}
finally {await device?.endAsync(true);await pool.end();}
