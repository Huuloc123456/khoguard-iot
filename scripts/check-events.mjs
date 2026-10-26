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

// Publishes the same frames ESP-C01 firmware emits, through the real broker into the running backend.
const config=readConfig(process.env), pool=createDbPool(config.db), base=`http://${config.host}:${config.port}`;
const accounts=readJson(join(local,'mosquitto/accounts.json'));
const checks=[];
let device,intruder,stage='connect';
const boot=`events-${randomUUID()}`, session=`session-${randomUUID()}`;
const topic=(id,kind)=>`khoguard/v1/WH01/devices/${id}/${kind}`;
const envelope=(kind,seq,payload,extra={})=>({schema_version:1,warehouse_id:'WH01',device_id:'ESP-C01',boot_id:boot,session_id:session,seq,kind,
  clock_synced:false,sent_at:null,uptime_ms:seq*1000+500,...extra,payload:{zone_id:'C',...payload}});
const door=(door_id,state)=>({door_id,state,beam_clear:true,panic_latched:false,local_inputs_healthy:true});
const telemetry=(seq,count,verified,presence)=>envelope('telemetry',seq,{controller_revision:seq,
  environment:{temperature_c:-18.2,humidity_pct:55},occupancy:{current_occupants:verified ? count:null,count_verified:verified,presence},doors:[door('D07','closed'),door('D08','closed')]});
const rfid=(seq,card,direction,result,door_id='D07')=>envelope('events',seq,{event_type:'rfid',door_id,card_id:card,direction,result},{event_id:`${boot}:${seq}`});
async function publish(client,id,message,options={}) {
  const raw=JSON.stringify(message);
  if (options.valid!==false) assert.equal(validateMqttMessage(topic(id,message.kind),raw).ok,true,`fixture ${message.kind} ${message.seq} must match the contract`);
  await client.publishAsync(topic(id,message.kind),raw,{qos:options.qos ?? 1,retain:options.retain ?? false});
}
const json=async path=>{const r=await authFetch(`${base}${path}`,{signal:AbortSignal.timeout(5000)});assert.equal(r.status,200,path);return r.json();};
async function until(read,accept) {
  const end=Date.now()+10000;
  while (Date.now()<end) {const value=await read(); if (accept(value)) return value; await delay(100);}
  throw new Error('CHECK_TIMEOUT');
}
const mine=async()=>(await json('/api/events?device_id=ESP-C01&limit=200')).items.filter(e=>e.id>baseline);
let baseline=0;
try {
  await signIn(base);
  baseline=(await json('/api/events?device_id=ESP-C01&limit=1')).items[0]?.id ?? 0;
  device=mqtt.connect({...brokerOptions(config.mqtt),username:'ESP-C01',password:accounts['ESP-C01'],clientId:`kg-events-${randomUUID()}`,reconnectPeriod:0,clean:true});
  device.on('error',()=>{});await once(device,'connect',{signal:AbortSignal.timeout(5000)});

  stage='unconfirmed session';
  await publish(device,'ESP-C01',rfid(1,'DEMO-017','in','accepted'));
  stage='session and verified count';
  await publish(device,'ESP-C01',envelope('status',0,{state:'online'}),{retain:true});
  await publish(device,'ESP-C01',telemetry(1,0,false,false));
  await publish(device,'ESP-C01',telemetry(2,0,true,false));
  let snapshot=await until(()=>json('/api/snapshot'),s=>s.devices.find(d=>d.id==='ESP-C01').boot_id===boot && s.zones[0].occupancy.count_verified);
  assert.equal(validateSnapshot(snapshot).ok,true);
  assert.deepEqual(snapshot.zones[0].occupancy,{current_occupants:0,count_verified:true,presence:false});
  checks.push('ESP-C01 frames: unverified count published as null, verified empty room as 0');

  stage='RFID ingest';
  await publish(device,'ESP-C01',rfid(1,'DEMO-017','in','accepted'));
  await publish(device,'ESP-C01',rfid(1,'DEMO-017','in','accepted'));
  await publish(device,'ESP-C01',rfid(2,'DEMO-017','in','duplicate'));
  await publish(device,'ESP-C01',rfid(3,'STRANGER-1','in','unauthorized','D08'));
  await publish(device,'ESP-C01',telemetry(3,1,true,true));
  await publish(device,'ESP-C01',rfid(4,'DEMO-017','out','accepted'));
  await publish(device,'ESP-C01',telemetry(4,0,true,true));
  let events=await until(mine,items=>items.length>=4);
  assert.deepEqual(events.map(e=>[e.card_id,e.direction,e.result,e.door_id]).reverse(),
    [['DEMO-017','in','accepted','D07'],['DEMO-017','in','duplicate','D07'],['STRANGER-1','in','unauthorized','D08'],['DEMO-017','out','accepted','D07']]);
  const [stored]=await pool.execute('SELECT COUNT(*) AS total FROM device_events WHERE device_id=? AND boot_id=?',['ESP-C01',boot]);
  assert.equal(stored[0].total,4);
  checks.push('RFID accepted/duplicate/unauthorized stored once each; QoS1 redelivery of the same event_id is deduplicated; unconfirmed session ignored');

  stage='count 0 with presence';
  snapshot=await until(()=>json('/api/snapshot'),s=>s.zones[0].occupancy.presence===true && s.zones[0].occupancy.current_occupants===0);
  assert.deepEqual(snapshot.zones[0].occupancy,{current_occupants:0,count_verified:true,presence:true});
  checks.push('count 0 + presence=true is kept as reported, not reconciled away by the backend');

  stage='QoS0, foreign and malformed events';
  await publish(device,'ESP-C01',rfid(5,'DEMO-018','in','accepted'),{qos:0});
  await publish(device,'ESP-C01',{...rfid(5,'DEMO-018','in','accepted'),payload:{zone_id:'C',event_type:'rfid',door_id:'D09',card_id:'DEMO-018',direction:'in',result:'accepted'}},{valid:false});
  await publish(device,'ESP-C01',{...rfid(5,'DEMO-018','in','accepted'),payload:{zone_id:'C',event_type:'rfid',door_id:'D07',card_id:'DEMO-018',direction:'in'}},{valid:false});
  intruder=mqtt.connect({...brokerOptions(config.mqtt),username:'khoguard-observer',password:accounts['khoguard-observer'],clientId:`kg-events-${randomUUID()}`,reconnectPeriod:0,clean:true});
  intruder.on('error',()=>{});await once(intruder,'connect',{signal:AbortSignal.timeout(5000)});
  await intruder.publishAsync(topic('ESP-C01','events'),JSON.stringify(rfid(6,'DEMO-018','in','accepted')),{qos:1}).catch(()=>{});
  stage='gap detection';
  await publish(device,'ESP-C01',envelope('events',9,{event_type:'door',door_id:'D08',state:'open'},{event_id:`${boot}:9`}));
  events=await until(mine,items=>items.length>=5);
  assert.equal(events.length,5);
  assert.deepEqual([events[0].event_type,events[0].door_id,events[0].state],['door','D08','open']);
  const page=await json('/api/events?device_id=ESP-C01');
  assert.ok(page.gaps.some(g=>g.boot_id===boot && g.from_seq===5 && g.to_seq===8));
  checks.push('QoS0/unassigned door/missing result/ACL-foreign events change nothing; seq 4 to 9 records gap 5-8');

  stage='pagination';
  const first=await json('/api/events?device_id=ESP-C01&limit=2');
  const second=await json(`/api/events?device_id=ESP-C01&limit=2&cursor=${first.next_cursor}`);
  assert.equal(first.items.length,2);assert.ok(second.items.every(e=>e.id<first.items[1].id));
  assert.equal((await authFetch(`${base}/api/events?limit=201`)).status,400);
  checks.push('events API newest first with bounded keyset pagination and query validation');

  await publish(device,'ESP-C01',envelope('status',0,{state:'offline'}),{retain:true});
  writeFileSync(join(local,'events-check.json'),JSON.stringify({checked_at:new Date().toISOString(),checks},null,2));
  console.log(`M08 event checks passed: ${checks.length} groups.`);
} catch(error) {console.error(`M08 check failed at ${stage} (${error.code ?? error.name}: ${error.message}); secrets not printed.`);process.exitCode=1;}
finally {await device?.endAsync(true);await intruder?.endAsync(true);await pool.end();}
