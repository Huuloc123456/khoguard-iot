import test from 'node:test';
import assert from 'node:assert/strict';
import { createTelemetryStore } from '../server/telemetry-store.mjs';
import { environmentMessage } from '../scripts/environment-message.mjs';

function fixture() {
  const message=environmentMessage({boot:'rejection-test',session:'session-test',seq:0,uptime:1000});
  const row={device_id:'ESP-C01',boot_id:message.boot_id,session_id:message.session_id,seq:null,state:'online'};
  let fail=false;
  const connection={query:async()=>{},beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},destroy(){},release(){},
    execute:async({sql},values=[])=>{
      if(sql.startsWith('SELECT * FROM device_current')) return [values[0]==='ESP-C01'?[row]:[]];
      if(sql.startsWith('SELECT zone_id AS id')) return [[{id:'C',temperature_min:-22,temperature_max:-16}]];
      return sql.startsWith('SELECT')?[[]]:[{insertId:1,affectedRows:1}];
    }};
  const store=createTelemetryStore({getConnection:async()=>{if(fail)throw new Error('database unavailable');return connection;}});
  const ingest=m=>store.ingest({topic:`khoguard/v1/WH01/devices/${m.device_id}/${m.kind}`,payload:Buffer.from(JSON.stringify(m)),qos:1,retain:false});
  const confirm=()=>ingest({...message,kind:'status',seq:0,payload:{zone_id:'C',state:'online'}});
  return {store,ingest,message,confirm,setDbFailure:value=>{fail=value;}};
}

test('refusing a command to an unavailable device preserves confirmed sessions of other devices',async()=>{
  const f=fixture();assert.equal(await f.confirm(),'status_online');
  await assert.rejects(f.store.command({device:'UNKNOWN-01',door:'D07',action:'close'},'operator'),{code:'DEVICE_NOT_LIVE'});
  assert.equal(await f.ingest(f.message),'accepted','business rejection must not turn live telemetry into backlog');
});

test('an actual database failure still invalidates confirmed sessions',async()=>{
  const f=fixture();assert.equal(await f.confirm(),'status_online');
  f.setDbFailure(true);
  await assert.rejects(f.store.command({device:'ESP-C01',door:'D07',action:'close'},'operator'),/database unavailable/);
  f.setDbFailure(false);
  assert.equal(await f.ingest(f.message),'backlog','without reconfirmation recovered frames are history only');
});
