import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import mqtt from 'mqtt';
import { root, local, readJson } from './local-config.mjs';
import { readConfig } from '../server/config.mjs';
import { signIn, authFetch } from './check-session.mjs';
import { createDbPool } from '../server/database.mjs';
import { brokerOptions } from '../server/mqtt.mjs';
import { validateMqttMessage } from '../contracts/validate.js';

// M12 recovery: this check starts and stops its own backend, so the normal backend on this port must be stopped first.
const config=readConfig(process.env), pool=createDbPool(config.db), base=`http://${config.host}:${config.port}`;
const accounts=readJson(join(local,'mosquitto/accounts.json'));
const checks=[];
let device,backend,stage='port free';
const boot=`recovery-${randomUUID()}`;
let session=`s-${randomUUID()}`,seq=0,revision=1;
const topic=kind=>`khoguard/v1/WH01/devices/ESP-C01/${kind}`;
const envelope=(kind,n,payload,ids={})=>({schema_version:1,warehouse_id:'WH01',device_id:'ESP-C01',boot_id:ids.boot ?? boot,session_id:ids.session ?? session,seq:n,kind,
  clock_synced:false,sent_at:null,uptime_ms:n*1000+500,payload:{zone_id:'C',...payload}});
const door=id=>({door_id:id,state:'closed',beam_clear:true,panic_latched:false,local_inputs_healthy:true,locked:true});
const telemetry=(count=0,verified=true,ids)=>envelope('telemetry',++seq,{controller_revision:++revision,environment:{temperature_c:-18.3,humidity_pct:55},
  occupancy:{current_occupants:verified ? count:null,count_verified:verified,presence:false},doors:[door('D07'),door('D08')]},ids);
const rfid=(n,card,direction)=>envelope('events',n,{event_type:'rfid',door_id:'D07',card_id:card,direction,result:'accepted'},{});
const withEventId=m=>({...m,event_id:`${m.boot_id}:${m.seq}`});
async function publish(message,options={}) {
  const raw=JSON.stringify(message);
  assert.equal(validateMqttMessage(topic(message.kind),raw).ok,true,`fixture ${message.kind} must match the contract`);
  await device.publishAsync(topic(message.kind),raw,{qos:1,retain:options.retain ?? false});
}
const json=async path=>{const r=await authFetch(`${base}${path}`,{signal:AbortSignal.timeout(3000)});assert.equal(r.status,200,path);return r.json();};
async function until(read,accept,ms=10000) {
  const end=Date.now()+ms; let last;
  while (Date.now()<end) {try {last=await read(); if (accept(last)) return last;} catch {} await delay(150);}
  throw new Error('CHECK_TIMEOUT');
}
async function startBackend() {
  backend=spawn(process.execPath,['--env-file=.local/runtime.env','server/start.mjs'],{cwd:root,stdio:'ignore',windowsHide:true});
  await until(()=>fetch(`${base}/api/ready`).then(r=>r.status),status=>status===200,15000);
}
async function stopBackend() {
  const exited=once(backend,'exit'); backend.kill('SIGINT'); await exited; backend=null;
}
const esp=s=>s.devices.find(d=>d.id==='ESP-C01');
const stored=async()=>(await pool.execute('SELECT seq FROM device_events WHERE device_id=? AND boot_id=? ORDER BY seq',[ 'ESP-C01',boot]))[0].map(r=>Number(r.seq));
try {
  const running=await fetch(`${base}/api/health`,{signal:AbortSignal.timeout(1000)}).then(()=>true,()=>false);
  if (running) throw Object.assign(new Error('stop the running backend first; this check restarts its own'),{code:'PORT_IN_USE'});
  device=mqtt.connect({...brokerOptions(config.mqtt),username:'ESP-C01',password:accounts['ESP-C01'],clientId:`kg-recovery-${randomUUID()}`,reconnectPeriod:0,clean:true});
  device.on('error',()=>{});await once(device,'connect',{signal:AbortSignal.timeout(5000)});

  stage='retained old online is not live';
  await publish(envelope('status',0,{state:'online'},{boot:`old-${randomUUID()}`,session:`old-${randomUUID()}`}),{retain:true});
  await startBackend();
  await signIn(base);
  let snapshot=await json('/api/snapshot');
  assert.notEqual(esp(snapshot).state,'online');assert.notEqual(esp(snapshot).freshness,'fresh');
  assert.equal((await authFetch(`${base}/api/doors/D07/commands`,{method:'POST',body:'{"action":"open"}',headers:{origin:'http://127.0.0.1:5173','content-type':'application/json'}})).status,409);
  checks.push('backend restarted with only an old retained "online": ESP-C01 not online/fresh and commands refused (409)');

  stage='reboot keeps count unverified';
  await publish(envelope('status',0,{state:'online'}),{retain:true});
  await publish(telemetry(0,false));
  snapshot=await until(()=>json('/api/snapshot'),s=>esp(s).boot_id===boot && esp(s).freshness==='fresh');
  assert.deepEqual([snapshot.zones[2].occupancy.current_occupants,snapshot.zones[2].occupancy.count_verified],[null,false]);
  checks.push('fresh boot reports count unverified (null), never assumed 0');

  stage='events while backend down are replayed once';
  await publish(telemetry(0,true));
  await publish(withEventId(rfid(1,'DEMO-017','in')));
  await until(stored,s=>s.length===1);
  await stopBackend();
  await publish(withEventId(rfid(2,'DEMO-017','out')));
  await publish(withEventId(rfid(3,'DEMO-018','in')));
  await publish(telemetry(1,true));
  await startBackend();
  assert.deepEqual(await until(stored,s=>s.length===3),[1,2,3]);
  const [gaps]=await pool.execute('SELECT COUNT(*) AS n FROM event_gaps WHERE device_id=? AND boot_id=?',['ESP-C01',boot]);
  assert.equal(gaps[0].n,0);
  checks.push('QoS1 events published while the backend was stopped are delivered from its persistent session after restart; no gap');

  stage='firmware retry after reconnect is deduplicated';
  session=`s-${randomUUID()}`;
  await publish(envelope('status',0,{state:'online'}),{retain:true});
  await publish(withEventId(rfid(3,'DEMO-018','in')));
  await publish(telemetry(1,true));
  await until(()=>json('/api/snapshot'),s=>esp(s).session_id===session);
  assert.deepEqual(await stored(),[1,2,3]);
  checks.push('same event re-sent under a new session after reconnect is stored once (RFID not doubled)');

  stage='lost events beyond the edge queue are reported';
  await publish(withEventId(rfid(7,'DEMO-018','out')));
  await until(stored,s=>s.at(-1)===7);
  const page=await json('/api/events?device_id=ESP-C01');
  assert.ok(page.gaps.some(g=>g.boot_id===boot && g.from_seq===4 && g.to_seq===6));
  checks.push('events lost beyond the bounded queue show as gap 4–6, not as a complete log');

  await publish(envelope('status',0,{state:'offline'}),{retain:true});
  writeFileSync(join(local,'recovery-check.json'),JSON.stringify({checked_at:new Date().toISOString(),checks},null,2));
  console.log(`M12 recovery checks passed: ${checks.length} groups.`);
  for (const c of checks) console.log(`- ${c}`);
} catch(error) {console.error(`M12 recovery check failed at ${stage} (${error.code ?? error.name}: ${error.message}); secrets not printed.`);process.exitCode=1;}
finally {if (backend) await stopBackend().catch(()=>{}); await device?.endAsync(true); await pool.end();}
