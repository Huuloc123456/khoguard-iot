import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registry } from '../contracts/validate.js';
import { toThingsBoard, unavailableTelemetry, flattenTelemetry, cloudTarget, telemetryMessages } from '../integrations/thingsboard.mjs';
import { warehouseDashboard } from '../integrations/thingsboard-dashboard.mjs';

const example=JSON.parse(readFileSync(new URL('../contracts/snapshot.example.json',import.meta.url),'utf8'));
function freshSnapshot() {
  const s=structuredClone(example);
  s.connections={broker:'connected',database:'connected'};
  for(const d of s.devices) {d.state='online';d.freshness='fresh';d.last_seen_at=s.generated_at;d.boot_id='boot-test';d.session_id='session-test';d.controller_revision=1;}
  s.zones.find(z=>z.id==='C').environment={temperature_c:-18,humidity_pct:55};
  s.zones.find(z=>z.id==='C').occupancy={current_occupants:0,count_verified:true,presence:false};
  return s;
}
const latest=(data,id)=>data[id][0].values;

test('ThingsBoard exports every registered device and only its assigned door keys',()=>{
  const s=freshSnapshot(), result=toThingsBoard(s,Date.parse(s.generated_at));
  assert.deepEqual(Object.keys(result).sort(),registry.devices.map(d=>d.id).sort());
  for(const d of registry.devices) {
    assert.equal(latest(result,d.id).source,d.source);
    assert.equal(latest(result,d.id).freshness,'fresh');
    for(const door of s.doors) assert.equal(Object.hasOwn(latest(result,d.id),`${door.id}_state`),d.doors.includes(door.id));
  }
  assert.equal(result['ESP-C01'][1].values.temperature_c,-18);
  assert.equal(result['ESP-C01'][1].values.current_occupants,0);
  assert.equal(result['SIM-C02'],undefined,'retired device is not exported');
});

test('unknown sensors and unverified counts never become numeric zero or clear',()=>{
  const s=freshSnapshot(), z=s.zones.find(z=>z.id==='C');
  z.environment={temperature_c:null,humidity_pct:null};z.occupancy={current_occupants:null,count_verified:false,presence:null};
  const d=s.doors.find(d=>d.id==='D07');d.state='unknown';d.beam_clear=null;d.panic_latched=null;d.local_inputs_healthy=false;
  const values=latest(toThingsBoard(s,Date.parse(s.generated_at)),'ESP-C01');
  assert.equal(values.temperature_display,'Chưa rõ');assert.equal(values.occupants_display,'Chưa xác minh');
  assert.equal(values.presence_display,'Chưa rõ');assert.equal(values.D07_beam_display,'Chưa rõ');
  assert.equal(toThingsBoard(s,Date.parse(s.generated_at))['ESP-C01'].length,1);
});

test('stale device does not emit new numeric measurements and shows old data explicitly',()=>{
  const s=freshSnapshot();s.devices.find(d=>d.id==='ESP-C01').freshness='stale';
  const result=toThingsBoard(s,Date.parse(s.generated_at));
  assert.equal(latest(result,'ESP-C01').temperature_display,'Dữ liệu cũ');
  assert.equal(result['ESP-C01'].length,1);
});

test('measurement time is last_seen_at, not the export time',()=>{
  const s=freshSnapshot();const time=Date.parse(s.generated_at);s.devices.find(d=>d.id==='ESP-C01').last_seen_at=new Date(time-3000).toISOString();
  const frames=toThingsBoard(s,time)['ESP-C01'];assert.equal(frames[0].ts,time);assert.equal(frames[1].ts,time-3000);
});

test('invalid, old or future snapshots cannot be passed off as live',()=>{
  const s=freshSnapshot(), time=Date.parse(s.generated_at);
  assert.throws(()=>toThingsBoard({...s,devices:[]},time),/INVALID_SNAPSHOT/);
  assert.throws(()=>toThingsBoard(s,time+10001),/SNAPSHOT_EXPIRED/);
  assert.throws(()=>toThingsBoard(s,time-1001),/SNAPSHOT_EXPIRED/);
});

test('backend failure emits explicit unavailable state for every configured device',()=>{
  const data=unavailableTelemetry(12345);
  for(const d of registry.devices) {
    assert.equal(data[d.id].length,1);assert.equal(data[d.id][0].ts,12345);
    assert.equal(latest(data,d.id).source_available,false);assert.equal(latest(data,d.id).freshness,'unknown');
    assert.equal(latest(data,d.id).temperature_display,'Nguồn không khả dụng');
    assert.equal(Object.hasOwn(latest(data,d.id),'temperature_c'),false);
  }
});

test('a disconnected database or broker suppresses all measurements even if the snapshot has fresh flags',()=>{
  for(const connection of ['database','broker']) {
    const s=freshSnapshot();s.connections[connection]='disconnected';
    const data=toThingsBoard(s,Date.parse(s.generated_at));
    for(const d of registry.devices) {
      assert.equal(data[d.id].length,1);
      assert.equal(latest(data,d.id).source_available,false);
      assert.equal(latest(data,d.id).freshness,'unknown');
      assert.equal(latest(data,d.id).temperature_display,'Nguồn không khả dụng');
    }
  }
});

test('Cloud payload flattens device keys without collisions and preserves original measurement timestamps',()=>{
  const s=freshSnapshot(),now=Date.parse(s.generated_at);
  s.devices.find(d=>d.id==='ESP-C01').last_seen_at=new Date(now-3000).toISOString();
  const frames=flattenTelemetry(toThingsBoard(s,now));
  assert.equal(frames.find(f=>f.ts===now).values.ESP_C01_temperature_display,'-18 °C');
  assert.equal(frames.find(f=>f.ts===now-3000).values.ESP_C01_temperature_c,-18);
  assert.equal(frames.find(f=>f.ts===now).values.SIM_C02_D09_state,undefined);
  assert.equal(Object.hasOwn(frames.find(f=>f.ts===now).values,'SIM_C02_temperature_c'),false);
});

test('Cloud target requires an approved HTTPS region and MQTT TLS with certificate verification',()=>{
  for(const url of ['https://thingsboard.cloud','https://eu.thingsboard.cloud']) {
    const target=cloudTarget(url);assert.equal(target.mqtt.host,url==='https://thingsboard.cloud'?'mqtt.thingsboard.cloud':'mqtt.eu.thingsboard.cloud');assert.equal(target.mqtt.protocol,'mqtts');assert.equal(target.mqtt.port,8883);assert.equal(target.mqtt.rejectUnauthorized,true);
  }
  for(const url of ['http://thingsboard.cloud','https://thingsboard.cloud.evil.test','https://thingsboard.cloud/path','https://other.test','https://me:secret@thingsboard.cloud'])assert.throws(()=>cloudTarget(url),/INVALID_CLOUD_URL/);
});

test('Cloud messages cap datapoints at 50 without losing values or changing source timestamps',()=>{
  const s=freshSnapshot(),now=Date.parse(s.generated_at),data=toThingsBoard(s,now);
  const messages=telemetryMessages(data);
  assert.ok(messages.every(m=>Object.keys(m.values).length<=50),'warehouse snapshot must not exceed Cloud per-message limits');
  assert.deepEqual(Object.assign({},...messages.filter(m=>m.ts===now).map(m=>m.values)),flattenTelemetry(data).find(m=>m.ts===now).values);
  assert.ok(messages.every(m=>m.ts===now));
});

test('Cloud dashboard has one zone table, two charts, a single warehouse alias and no control widgets',()=>{
  const id='00000000-0000-4000-8000-000000000001',config=warehouseDashboard(id).configuration;
  assert.equal(Object.keys(config.widgets).length,3);
  assert.equal(Object.keys(config.entityAliases).length,1);
  assert.equal(Object.values(config.entityAliases)[0].filter.singleEntity.id,id);
  assert.equal(Object.values(config.widgets).filter(w=>w.type==='latest').length,1);
  for(const widget of Object.values(config.widgets)) {
    assert.ok(['system.cards.entities_table','system.charts.basic_timeseries'].includes(widget.typeFullFqn));
    for(const datasource of widget.config.datasources) {
      assert.equal(datasource.type,'entity');assert.ok(config.entityAliases[datasource.entityAliasId]);
      assert.ok(datasource.dataKeys.every(k=>k.type==='timeseries'));
    }
  }
});
