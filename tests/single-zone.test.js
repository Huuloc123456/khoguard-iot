import test from 'node:test';
import assert from 'node:assert/strict';
import {registry,validateMqttMessage,validateSnapshot} from '../contracts/validate.js';
import {buildSnapshot} from '../server/telemetry.mjs';
import {parseReportQuery,runReport} from '../server/reports.mjs';
import {readFileSync} from 'node:fs';
const examples=JSON.parse(readFileSync(new URL('../contracts/examples.json',import.meta.url)));

test('the active model contains only C, ESP-C01 and two controlled doors',()=>{
  assert.deepEqual(registry.zones,['C']);
  assert.deepEqual(registry.devices.map(d=>d.id),['ESP-C01']);
  assert.deepEqual(registry.devices[0].doors,['D07','D08']);
  for(const id of ['SIM-A01','SIM-B01','SIM-C02','SIM-D01']) {
    const m=structuredClone(examples.find(e=>e.message.kind==='telemetry').message);m.device_id=id;
    assert.equal(validateMqttMessage(`khoguard/v1/WH01/devices/${id}/telemetry`,JSON.stringify(m)).error.code,'DEVICE_NOT_REGISTERED');
  }
});
test('historical DB zones and alerts never leak into active snapshots or reports',async()=>{
  const zones=['A','B','C','D'].map(id=>({id,name:id,temperature_min:-22,temperature_max:-16,capacity:80}));
  const s=buildSnapshot(zones,[],1,new Date(),{database:true,mqtt:true},new Set(),[{id:99,zone_id:'A'},{id:98,zone_id:'C',door_id:'D09'}]);
  assert.deepEqual(s.zones.map(z=>z.id),['C']);assert.deepEqual(s.alerts,[]);assert.equal(validateSnapshot(s).ok,true);
  for(const zone of ['A','B','D'])assert.throws(()=>parseReportQuery('events',new URLSearchParams({zone})),/INVALID_QUERY/);
  let statement,values;
  for(const kind of ['events','alerts','commands','access']){
    await runReport({execute:async(q,p)=>{statement=q.sql;values=p;return [[]];}},parseReportQuery(kind,new URLSearchParams()));
    assert.ok(values.includes('C'),'unfiltered reports still enforce active zone');
    if(['events','alerts'].includes(kind)){assert.match(statement,/t\.device_id = \?/);assert.ok(values.includes('ESP-C01'));}
    else {assert.match(statement,/t\.door_id IN \(\?, \?\)/);assert.ok(values.includes('D07') && values.includes('D08'),'retired D09 cannot leak through zone-C reports');}
  }
});
