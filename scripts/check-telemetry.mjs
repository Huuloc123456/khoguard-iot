import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import mqtt from 'mqtt';
import { local, readJson } from './local-config.mjs';
import { environmentMessage, statusMessage } from './environment-message.mjs';
import { connectBroker, brokerOptions } from '../server/mqtt.mjs';
import { createApp } from '../server/http.mjs';
import { applyTelemetry, telemetryMigration } from '../db/migrate.mjs';
import { gate } from './loopback-gate.mjs';
import { createDbPool, loadOwnership, databaseReady } from '../server/database.mjs';
import { readConfig } from '../server/config.mjs';
import { signIn, authFetch } from './check-session.mjs';
import { createTelemetryStore } from '../server/telemetry-store.mjs';
import { createAccessStore } from '../server/access-store.mjs';
import { validateSnapshot } from '../contracts/validate.js';
const config=readConfig(process.env), state=loadOwnership(), pool=createDbPool(config.db);
const store=createTelemetryStore(pool);
const checks=[];
let publisher,probe,probeApp,migration,dbGate,mqttGate,gatedPool;
let stage='repository';
const boot=`check-${randomUUID()}`, session=`session-${randomUUID()}`;
const message={schema_version:1,warehouse_id:'WH01',device_id:'SIM-A01',boot_id:boot,session_id:session,
  seq:10,kind:'telemetry',clock_synced:false,sent_at:null,uptime_ms:10000,
  payload:{zone_id:'A',controller_revision:0,environment:{temperature_c:24.5,humidity_pct:55},
    occupancy:{current_occupants:null,count_verified:false,presence:null},
    doors:['D01','D02','D03'].map(door_id=>({door_id,state:'unknown',beam_clear:null,panic_latched:null,local_inputs_healthy:false}))}};
const packet=(m,retain=false)=>({topic:`khoguard/v1/WH01/devices/SIM-A01/${m.kind}`,payload:Buffer.from(JSON.stringify(m)),qos:1,retain});
const online={...message,kind:'status',seq:0,payload:{zone_id:'A',state:'online'}};
try {
  assert.equal(await databaseReady(pool,state),true);
  assert.equal(await store.ingest(packet(message)),'unconfirmed');
  assert.equal(await store.ingest(packet(online,true)),'status_online');
  assert.equal(await store.ingest(packet(message,true)),'retained');
  assert.equal(await store.ingest(packet(message)),'accepted');
  assert.equal(await store.ingest(packet(message)),'old_sequence');
  const snapshot=await store.snapshot({database:true,mqtt:true});
  assert.equal(validateSnapshot(snapshot).ok,true);
  assert.equal(snapshot.zones[0].environment.temperature_c,24.5);
  assert.equal(snapshot.devices[0].freshness,'fresh');
  const offline={...online,payload:{zone_id:'A',state:'offline'}};
  assert.equal(await store.ingest(packet(offline)),'status_offline');
  const stale=await store.snapshot({database:true,mqtt:true});
  assert.equal(stale.devices[0].state,'offline');
  assert.equal(stale.zones[0].environment.temperature_c,24.5);
  assert.equal(await store.ingest(packet(online)),'retired_session');
  assert.equal(await store.ingest(packet({...message,seq:11})),'retired_session');
  checks.push('real MySQL: confirmed live telemetry, retained rejection, dedupe, snapshot and offline value preservation');

  stage='migration';
  const mysql=await import('mysql2/promise');
  migration=await mysql.default.createConnection(readConfig(process.env,{migration:true}).db);
  assert.deepEqual(await applyTelemetry(migration,state),{applied:false});
  for (const [column,value,pattern] of [['status','applying',/incomplete/],['checksum','0'.repeat(64),/checksum/]]) {
    await migration.beginTransaction();
    try {
      await migration.execute(`UPDATE schema_migrations SET ${column}=? WHERE version=?`,[value,telemetryMigration.version]);
      await assert.rejects(applyTelemetry(migration,state),pattern);
    } finally {await migration.rollback();}
  }
  checks.push('M05 migration no-op and incomplete/checksum guards; no reset');

  const base=`http://${config.host}:${config.port}`;
  await signIn(base);
  async function readSnapshot() {
    const response=await authFetch(`${base}/api/snapshot`,{signal:AbortSignal.timeout(5000)});
    assert.equal(response.status,200); const value=await response.json();
    assert.equal(validateSnapshot(value).ok,true); return value;
  }
  async function until(read,accept) {
    const end=Date.now()+10000;
    while (Date.now()<end) {const value=await read(); if (accept(value)) return value; await delay(100);}
    throw new Error('CHECK_TIMEOUT');
  }
  const accounts=readJson(join(local,'mosquitto/accounts.json'));
  const liveBoot=`mqtt-${randomUUID()}`, liveSession=`session-${randomUUID()}`;
  let seq=10;
  const make=(session=liveSession,boot=liveBoot)=>environmentMessage({boot,session,seq:seq++,uptime:seq*1000,temperature:25.5,humidity:60});
  const first=make(), will=statusMessage(first,'offline');
  publisher=mqtt.connect({...brokerOptions(config.mqtt),username:'SIM-A01',password:accounts['SIM-A01'],clientId:`kg-check-${randomUUID()}`,
    clean:true,reconnectPeriod:0,will:{topic:packet(will).topic,payload:JSON.stringify(will),qos:1,retain:true}});
  publisher.on('error',()=>{});
  await once(publisher,'connect',{signal:AbortSignal.timeout(5000)});
  const publish=m=>publisher.publishAsync(packet(m).topic,JSON.stringify(m),{qos:1,retain:true});
  stage='MQTT to DB and API';
  await publish(statusMessage(first,'online')); await publish(first);
  let liveSnapshot=await until(readSnapshot,s=>s.devices[0].boot_id===liveBoot && s.devices[0].freshness==='fresh');
  const beforeInvalid=liveSnapshot.revision, beforeSeen=liveSnapshot.devices[0].last_seen_at;
  await publish(first); await publish({...first,seq:9});
  await publish({...first,seq:11,payload:{...first.payload,environment:{temperature_c:101,humidity_pct:60}}});
  await publish({...first,seq:11,payload:{...first.payload,zone_id:'B'}});
  await publish({...first,seq:11,uptime_ms:1});
  await publish({...first,seq:11,clock_synced:true,sent_at:'2026-01-01T00:00:00Z'});
  await publisher.publishAsync(packet(first).topic,Buffer.from([0xff]),{qos:1});
  await publisher.publishAsync(packet(first).topic,'x'.repeat(65537),{qos:1});
  await publisher.publishAsync(packet(first).topic,JSON.stringify({...first,seq:11}),{qos:0});
  // A later valid frame provides an observable barrier through the subscriber's ordered packet processing.
  const barrier=make(); barrier.seq=12;
  await publish(barrier);
  liveSnapshot=await until(readSnapshot,s=>s.revision===beforeInvalid+1 && s.devices[0].boot_id===liveBoot);
  const [stored]=await pool.execute('SELECT seq,received_at FROM telemetry WHERE device_id=? AND boot_id=? ORDER BY seq',['SIM-A01',liveBoot]);
  assert.deepEqual(stored.map(r=>r.seq),[10,12]);
  assert.equal(new Date(stored[0].received_at).toISOString(),beforeSeen);
  assert.equal(liveSnapshot.zones[0].environment.temperature_c,25.5);
  checks.push('real broker -> MySQL -> API; duplicate, old seq/clock, regression, wrong schema/zone, invalid UTF-8, oversized and QoS0 do not mutate state');

  stage='history pagination';
  const from=new Date(Date.now()-60000).toISOString(), to=new Date(Date.now()+60000).toISOString();
  const params=new URLSearchParams({device_id:'SIM-A01',from,to,limit:'1'});
  const history=async()=>{const r=await authFetch(`${base}/api/telemetry?${params}`,{signal:AbortSignal.timeout(5000)});assert.equal(r.status,200);return r.json();};
  const ids=[]; let cursor=0;
  do {if (cursor) params.set('cursor',String(cursor));const page=await history();assert.ok(page.items.length<=1);ids.push(...page.items.map(i=>i.id));cursor=page.next_cursor;} while(cursor);
  assert.equal(new Set(ids).size,ids.length); assert.ok(ids.length>=2);
  for (const suffix of ['&limit=201','&device_id=ESP-C01','&unknown=1']) assert.equal((await authFetch(`${base}/api/telemetry?${params}${suffix}`)).status,400);
  checks.push('history UTC received_at, bounded keyset pagination, no duplicate rows and invalid query rejection');

  stage='retained restart';
  const restarted=createTelemetryStore(pool);
  probe=connectBroker(config.mqtt,{...restarted,databaseReady:()=>databaseReady(pool,state)});
  await once(probe,'connect',{signal:AbortSignal.timeout(5000)});
  await until(async()=>probe.ingestReady,x=>x);
  probeApp=createApp(async()=>({database:await databaseReady(pool,state),mqtt:probe.connected && probe.ingestReady}),restarted,createAccessStore(pool));
  probeApp.listen(0,'127.0.0.1');await once(probeApp,'listening');
  await delay(200);
  const restored=await (await authFetch(`http://127.0.0.1:${probeApp.address().port}/api/snapshot`)).json();
  assert.equal(validateSnapshot(restored).ok,true);
  assert.equal(restored.devices[0].freshness,'stale');
  assert.equal(restored.zones[0].environment.temperature_c,25.5);
  assert.equal(restored.revision,liveSnapshot.revision);
  await probe.endAsync(true);probe=null;
  probeApp.closeAllConnections(); await new Promise(resolve=>probeApp.close(resolve));probeApp=null;
  checks.push('new subscriber/runtime restores DB snapshot; retained telemetry does not advance revision or freshness');

  stage='reconnect and old Will';
  const session2=`session-${randomUUID()}`, next=make(session2); next.seq=13;
  await publish(statusMessage(next,'online')); await publish(next);
  liveSnapshot=await until(readSnapshot,s=>s.devices[0].session_id===session2 && s.devices[0].freshness==='fresh');
  const revision2=liveSnapshot.revision;
  await publish(will);await publish(statusMessage(first,'online'));await publish({...first,seq:99,uptime_ms:99000});
  const sentinel={...next,seq:14,uptime_ms:next.uptime_ms+1000};await publish(sentinel);
  liveSnapshot=await until(readSnapshot,s=>s.revision===revision2+1);
  assert.equal(liveSnapshot.devices[0].session_id,session2);
  assert.equal(liveSnapshot.devices[0].state,'online');
  checks.push('reconnect changes session, preserves boot sequence; old Will/online/data cannot replace new session');

  stage='reboot and retired boot';
  const reboot=`mqtt-${randomUUID()}`, rebootSession=`session-${randomUUID()}`;
  const rebooted=environmentMessage({boot:reboot,session:rebootSession,seq:0,uptime:0,temperature:26,humidity:61});
  await publish(statusMessage(rebooted,'online'));await publish(rebooted);
  liveSnapshot=await until(readSnapshot,s=>s.devices[0].boot_id===reboot && s.devices[0].freshness==='fresh');
  const revision3=liveSnapshot.revision;
  await publish(statusMessage(sentinel,'online'));await publish({...sentinel,seq:100,uptime_ms:100000});
  await publish({...rebooted,seq:1,uptime_ms:1000});
  liveSnapshot=await until(readSnapshot,s=>s.revision===revision3+1);
  assert.equal(liveSnapshot.devices[0].boot_id,reboot);
  checks.push('reboot starts seq/uptime at zero; retired boot cannot resurrect');

  stage='Last Will';
  // Gracefully finish old client (its Will belongs to a retired session), then create a client whose current Will is real.
  await publisher.endAsync(true);
  const finalSession=`session-${randomUUID()}`, final={...rebooted,session_id:finalSession,seq:2,uptime_ms:2000};
  const finalWill=statusMessage(final,'offline');
  publisher=mqtt.connect({...brokerOptions(config.mqtt),username:'SIM-A01',password:accounts['SIM-A01'],clientId:`kg-will-${randomUUID()}`,
    reconnectPeriod:0,keepalive:5,will:{topic:packet(finalWill).topic,payload:JSON.stringify(finalWill),qos:1,retain:true}});
  publisher.on('error',()=>{});await once(publisher,'connect',{signal:AbortSignal.timeout(5000)});
  await publish(statusMessage(final,'online'));await publish(final);
  await until(readSnapshot,s=>s.devices[0].session_id===finalSession && s.devices[0].freshness==='fresh');
  publisher.stream.destroy();
  const offlineSnapshot=await until(readSnapshot,s=>s.devices[0].state==='offline');
  assert.equal(offlineSnapshot.zones[0].environment.temperature_c,26);
  assert.equal(offlineSnapshot.devices[0].freshness,'stale');
  checks.push('real unexpected MQTT disconnect triggers Last Will; current offline/stale retains environment');

  stage='database transport fault';
  dbGate=await gate(config.db.port);
  gatedPool=createDbPool({...config.db,port:dbGate.port});
  const faultStore=createTelemetryStore(gatedPool), faultBoot=`fault-${randomUUID()}`, faultSession=`session-${randomUUID()}`;
  const faultFrame=environmentMessage({boot:faultBoot,session:faultSession,seq:0,uptime:0,temperature:27,humidity:62});
  await faultStore.ingest(packet(statusMessage(faultFrame,'online')));
  await faultStore.ingest(packet(faultFrame));
  const [beforeFault]=await pool.execute('SELECT seq,message FROM device_current WHERE device_id=?',['SIM-A01']);
  probeApp=createApp(async()=>({database:await databaseReady(gatedPool,state),mqtt:true}),faultStore,createAccessStore(gatedPool));
  probeApp.listen(0,'127.0.0.1');await once(probeApp,'listening');
  const faultBase=`http://127.0.0.1:${probeApp.address().port}`;
  dbGate.setBlocked(true);
  stage='DB fault snapshot 503';
  assert.equal((await authFetch(`${faultBase}/api/snapshot`)).status,503);
  assert.equal((await fetch(`${faultBase}/api/health`)).status,200);
  await assert.rejects(faultStore.ingest(packet({...faultFrame,seq:1,uptime_ms:1000})));
  stage='DB fault unchanged current';
  const [afterFault]=await pool.execute('SELECT seq,message FROM device_current WHERE device_id=?',['SIM-A01']);
  assert.deepEqual(afterFault,beforeFault);
  dbGate.setBlocked(false);
  await until(()=>databaseReady(gatedPool,state),x=>x);
  stage='DB recovery freshness';
  const afterRecovery=await (await authFetch(`${faultBase}/api/snapshot`)).json();
  assert.equal(afterRecovery.devices[0].freshness,'stale');
  stage='DB recovery confirmation';
  assert.equal(await faultStore.ingest(packet({...faultFrame,seq:1,uptime_ms:1000})),'unconfirmed');
  await faultStore.ingest(packet(statusMessage(faultFrame,'online')));
  assert.equal(await faultStore.ingest(packet({...faultFrame,seq:1,uptime_ms:1000})),'accepted');
  await faultStore.ingest(packet(statusMessage(faultFrame,'offline')));
  probeApp.closeAllConnections();await new Promise(resolve=>probeApp.close(resolve));probeApp=null;
  await gatedPool.end();gatedPool=null;await dbGate.stop();dbGate=null;
  checks.push('actual MySQL transport loss: snapshot 503, health 200, no failed write/current advance; recovery requires renewed session confirmation');

  stage='subscriber transport fault';
  mqttGate=await gate(config.mqtt.port);
  const transportStore=createTelemetryStore(pool);let subscriberPackets=0;
  probe=connectBroker({...config.mqtt,port:mqttGate.port},{resetConnection:()=>transportStore.resetConnection(),databaseReady:()=>databaseReady(pool,state),
    ingest:async p=>{subscriberPackets++;assert.equal(p.qos,1);}});
  await once(probe,'connect',{signal:AbortSignal.timeout(5000)});
  await until(async()=>probe.ingestReady && subscriberPackets>=2,x=>x);
  mqttGate.setBlocked(true);
  await until(async()=>!probe.connected && !probe.ingestReady,x=>x);
  const oldPackets=subscriberPackets;
  mqttGate.setBlocked(false);
  await until(async()=>probe.connected && probe.ingestReady,x=>x);
  await until(async()=>subscriberPackets>oldPackets,x=>x);
  await probe.endAsync(true);probe=null;await mqttGate.stop();mqttGate=null;
  checks.push('actual MQTT transport loss resets subscription readiness; reconnect resubscribes and retained replay is delivered');
  writeFileSync(join(local,'telemetry-check.json'),JSON.stringify({checked_at:new Date().toISOString(),checks},null,2));
  console.log(`M05 telemetry checks passed: ${checks.length} groups.`);
} catch(error) { console.error(`M05 check failed at ${stage} (${error.code ?? error.name}); secrets not printed.`); process.exitCode=1; }
finally {
  await publisher?.endAsync(true);await probe?.endAsync(true);
  if (probeApp) {probeApp.closeAllConnections();await new Promise(resolve=>probeApp.close(resolve));}
  await migration?.end();await pool.end();
  await gatedPool?.end();await dbGate?.stop();await mqttGate?.stop();
}
