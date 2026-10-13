import test from 'node:test';
import assert from 'node:assert/strict';
import { telemetryDecision, parseHistoryQuery, buildSnapshot } from '../server/telemetry.mjs';
import { registry, validateSnapshot } from '../contracts/validate.js';
import { validateMqttMessage } from '../contracts/validate.js';
import { environmentMessage } from '../scripts/environment-message.mjs';

const now = Date.parse('2026-10-13T01:00:00Z');
const message = {device_id:'SIM-A01',boot_id:'boot1',session_id:'session1',seq:10,uptime_ms:20000,
  clock_synced:false,sent_at:null,payload:{controller_revision:2}};
const current = {boot_id:'boot1',session_id:'session1',seq:9,uptime_ms:19000,controller_revision:2};
const candidate = {boot_id:'boot1',session_id:'session1'};
const decide = (m=message,c=current,options={}) => telemetryDecision(c,candidate,m,{retain:false},now,options.retired ?? false);

test('node environment simulator uses its own device and leaves unimplemented safety inputs unknown', () => {
  const m=environmentMessage({boot:'b',session:'s',seq:0,uptime:0});
  assert.equal(validateMqttMessage('khoguard/v1/WH01/devices/SIM-A01/telemetry',JSON.stringify(m)).ok,true);
  assert.equal(m.payload.occupancy.current_occupants,null);
  assert.ok(m.payload.doors.every(d=>d.state==='unknown' && !d.local_inputs_healthy));
  m.payload.environment.temperature_c=101;
  assert.equal(validateMqttMessage('khoguard/v1/WH01/devices/SIM-A01/telemetry',JSON.stringify(m)).ok,false);
});

test('telemetry needs a confirmed session and live data; retained and old clocks never refresh state', () => {
  assert.equal(decide(),'accepted');
  assert.equal(telemetryDecision(current,null,message,{retain:false},now,false),'unconfirmed');
  assert.equal(telemetryDecision(current,candidate,message,{retain:true},now,false),'retained');
  assert.equal(decide(message,current,{retired:true}),'retired_session');
  assert.equal(decide({...message,session_id:'other'}),'unconfirmed');
  assert.equal(decide({...message,clock_synced:true,sent_at:new Date(now-10001).toISOString()}),'invalid_time');
  assert.equal(decide({...message,clock_synced:true,sent_at:new Date(now+1).toISOString()}),'invalid_time');
});
test('duplicates, decreasing seq/uptime/revision cannot change the current snapshot; reboot resets counters', () => {
  assert.equal(decide({...message,seq:9}),'old_sequence');
  assert.equal(decide({...message,seq:8}),'old_sequence');
  assert.equal(decide({...message,uptime_ms:1}),'regression');
  assert.equal(decide({...message,payload:{controller_revision:1}}),'regression');
  assert.equal(telemetryDecision(current,{boot_id:'boot2',session_id:'session2'},
    {...message,boot_id:'boot2',session_id:'session2',seq:0,uptime_ms:0,payload:{controller_revision:0}},{retain:false},now,false),'accepted');
});
test('history queries require registry device and UTC time window, reject duplicate/unknown parameters and bound pagination', () => {
  const valid = 'device_id=SIM-A01&from=2026-10-13T00:00:00Z&to=2026-10-13T01:00:00Z';
  assert.deepEqual(parseHistoryQuery(new URLSearchParams(valid)),{device:'SIM-A01',from:'2026-10-13 00:00:00.000',to:'2026-10-13 01:00:00.000',limit:100,cursor:0});
  for (const query of ['',valid+'&limit=201',valid+'&limit=0',valid+'&limit=1x',valid+'&cursor=-1',valid+'&cursor=9007199254740992',valid+'&unexpected=1',valid+'&device_id=SIM-B01',valid.replace('SIM-A01',"x' OR 1=1"),valid.replace('01:00:00Z','00:00:00Z'),valid.replace('2026-10-13T01','2026-10-21T01'),valid.replace('00:00:00Z','00:00:00+07:00')]) {
    assert.throws(()=>parseHistoryQuery(new URLSearchParams(query)), /INVALID_QUERY/);
  }
});
test('snapshot includes offline inventory, unknown WMS and signals, then marks stored data stale on disconnect/restart', () => {
  const zones=registry.zones.map(id=>({id,name:id,temperature_min:0,temperature_max:30,capacity:100}));
  const row={device_id:'SIM-A01',boot_id:'boot1',session_id:'session1',state:'online',received_at:new Date(now),
    message:{...message,payload:{controller_revision:2,environment:{temperature_c:25,humidity_pct:50},occupancy:{current_occupants:1,count_verified:true,presence:true},doors:registry.devices[0].doors.map(door_id=>({door_id,state:'open',beam_clear:true,panic_latched:false,local_inputs_healthy:true}))}}};
  const args = [zones,[row],1,new Date(now),{database:true,mqtt:true}];
  const live=new Set([JSON.stringify(['SIM-A01','boot1','session1'])]);
  const snapshot=buildSnapshot(...args,live);
  assert.equal(validateSnapshot(snapshot).ok,true);
  assert.equal(snapshot.devices.length,5); assert.equal(snapshot.doors.length,12);
  assert.equal(snapshot.devices[0].freshness,'fresh');
  assert.equal(snapshot.zones[0].occupied,null); assert.equal(snapshot.zones[0].reserved,null);
  assert.equal(snapshot.zones[1].environment.temperature_c,null);
  assert.equal(snapshot.devices[1].state,'unknown');
  assert.equal(buildSnapshot(...args,new Set()).devices[0].freshness,'stale');
  args[4]={database:true,mqtt:false};
  assert.equal(buildSnapshot(...args,live).devices[0].freshness,'stale');
  assert.equal(buildSnapshot(...args,live).zones[0].occupancy.current_occupants,1);
  args[4]={database:true,mqtt:true}; args[3]=new Date(now+10001);
  assert.equal(buildSnapshot(...args,live).devices[0].freshness,'stale');
  args[3]=new Date(now);
  row.message.clock_synced=true; row.message.sent_at=new Date(now-9000).toISOString();
  assert.equal(buildSnapshot(...args,live).devices[0].freshness,'fresh');
  args[3]=new Date(now+1001);
  assert.equal(buildSnapshot(...args,live).devices[0].freshness,'stale');
});
test('snapshot carries edge lock/open time and stored alerts with acknowledgement kept separate from state', () => {
  const zones=registry.zones.map(id=>({id,name:id,temperature_min:-22,temperature_max:30,capacity:100}));
  const row={device_id:'ESP-C01',boot_id:'b',session_id:'s',state:'online',received_at:new Date(now),
    message:{...message,device_id:'ESP-C01',payload:{zone_id:'C',controller_revision:3,environment:{temperature_c:-18,humidity_pct:50},
      occupancy:{current_occupants:0,count_verified:true,presence:false},
      doors:[{door_id:'D07',state:'open',beam_clear:true,panic_latched:false,local_inputs_healthy:true,locked:false,open_ms:31500},
        {door_id:'D08',state:'closed',beam_clear:true,panic_latched:false,local_inputs_healthy:true,locked:true}]}}};
  const alerts=[{id:9,zone_id:'C',door_id:'D07',code:'DOOR_OPEN',title:'Cửa D07 mở từ 30 giây',detail:'d',level:'warning',state:'active',
    raised_at:new Date(now-1000),resolved_at:null,acknowledged_at:new Date(now)}];
  const snapshot=buildSnapshot(zones,[row],4,new Date(now),{database:true,mqtt:true},new Set(),alerts);
  assert.equal(validateSnapshot(snapshot).ok,true,JSON.stringify(validateSnapshot(snapshot).error));
  const d07=snapshot.doors.find(d=>d.id==='D07'), d08=snapshot.doors.find(d=>d.id==='D08');
  assert.deepEqual([d07.open_seconds,d07.locked,d08.open_seconds,d08.locked],[31.5,false,null,true]);
  assert.equal(snapshot.doors.find(d=>d.id==='D01').locked,null);
  assert.deepEqual(snapshot.alerts[0],{id:'AL-9',zone:'C',door_id:'D07',code:'DOOR_OPEN',title:'Cửa D07 mở từ 30 giây',detail:'d',level:'warning',state:'active',
    acknowledged:true,raised_at:new Date(now-1000).toISOString(),resolved_at:null,acknowledged_at:new Date(now).toISOString()});
});
