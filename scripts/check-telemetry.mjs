import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDbPool, loadOwnership, databaseReady } from '../server/database.mjs';
import { readConfig } from '../server/config.mjs';
import { createTelemetryStore } from '../server/telemetry-store.mjs';
import { validateSnapshot } from '../contracts/validate.js';
const config=readConfig(process.env), state=loadOwnership(), pool=createDbPool(config.db);
const store=createTelemetryStore(pool);
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
  console.log('M05 repository checks passed: real MySQL, session, retained, dedupe, snapshot and offline preservation.');
} catch(error) { console.error(`M05 check failed (${error.code ?? error.name}); secrets not printed.`); process.exitCode=1; }
finally {await pool.end();}
