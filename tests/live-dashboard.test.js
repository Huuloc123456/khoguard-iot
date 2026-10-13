import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { snapshotToView, acceptSnapshot, eventsToView } from '../src/live-data.js';
import { getSummary, canCloseDoor } from '../src/demo.js';
const fixture=JSON.parse(readFileSync(new URL('../contracts/snapshot.example.json',import.meta.url)));

test('door provenance uses its registered device rather than the zone environment owner',()=>{
  const view=snapshotToView(fixture);
  assert.equal(view.doors.find(d=>d.id==='D07').source,'Wokwi');
  assert.equal(view.doors.find(d=>d.id==='D08').source,'Wokwi');
  assert.equal(view.doors.find(d=>d.id==='D09').source,'Node mô phỏng');
  assert.equal(view.doors.find(d=>d.id==='D09').deviceId,'SIM-C02');
});
test('live adapter preserves unknowns/provenance and stale data never permits closing',()=>{
  const value=structuredClone(fixture);value.zones[0].occupied=null;value.zones[0].reserved=null;
  value.zones[0].environment.temperature_c=null;value.zones[0].occupancy.current_occupants=null;
  value.doors[0].state='unknown';value.doors[0].beam_clear=null;
  const view=snapshotToView(value);
  assert.equal(view.zones[0].temperature,null);assert.equal(view.doors[0].open,null);
  assert.equal(getSummary(view).occupied,null);assert.equal(getSummary(view).people,null);
  assert.equal(view.zones[2].source,'Wokwi');
  view.zones[2].freshness='stale';view.zones[2].people=0;view.zones[2].presence=false;view.zones[2].beam=false;view.zones[2].panic=false;
  assert.equal(canCloseDoor(view.zones[2]),false);
});
test('full snapshots resync skipped revisions; old revisions/time and malformed snapshots are refused',()=>{
  assert.equal(acceptSnapshot(fixture,null),true);
  assert.equal(acceptSnapshot({...fixture,revision:fixture.revision+3},fixture),true);
  assert.equal(acceptSnapshot({...fixture,revision:fixture.revision-1},fixture),false);
  assert.equal(acceptSnapshot({...fixture,generated_at:'2026-01-01T00:00:00Z'},fixture),false);
  assert.equal(acceptSnapshot({revision:1},null),false);
});
test('live event log shows edge RFID decisions and reports gaps instead of hiding them',()=>{
  const at='2026-10-13T01:00:00.000Z', base={device_id:'ESP-C01',zone:'C',received_at:at};
  const rows=eventsToView({items:[
    {...base,id:4,door_id:'D08',event_type:'rfid',card_id:'STRANGER-1',direction:'in',result:'unauthorized'},
    {...base,id:3,door_id:'D07',event_type:'rfid',card_id:'DEMO-017',direction:'in',result:'duplicate'},
    {...base,id:2,door_id:'D07',event_type:'rfid',card_id:'DEMO-017',direction:'in',result:'accepted'},
    {...base,id:1,door_id:'D08',event_type:'door',state:'open'}],
    gaps:[{device_id:'ESP-C01',boot_id:'b',from_seq:5,to_seq:8,detected_at:'2026-10-13T01:00:01.000Z'},{device_id:'ESP-C01',boot_id:'old',from_seq:2,to_seq:2,detected_at:'2026-10-12T23:00:00.000Z'}]});
  assert.equal(rows.length,6);
  assert.deepEqual(rows.map(r=>r.type),['Cảnh báo','Ra / vào','Ra / vào','Ra / vào','Cửa','Cảnh báo']);
  assert.match(rows[5].title,/Mất 1 sự kiện/,'older gaps sort below newer events');
  assert.match(rows[0].title,/Mất 4 sự kiện/);
  assert.match(rows[1].title,/STRANGER-1.*từ chối.*D08/);assert.match(rows[1].detail,/không chặn thoát hiểm/);
  assert.match(rows[2].title,/đọc lặp/);assert.match(rows[3].title,/DEMO-017 vào.*D07/);
  assert.equal(rows[4].title,'Cửa D08 mở');assert.equal(rows[4].zone,'Khu C');
  assert.ok(rows.every(r=>/^\d{2}:\d{2}:\d{2}$/.test(r.time)));
});
test('live alerts keep active/acknowledged/resolved separate; only active unacknowledged alerts need attention',async()=>{
  const { needsAttention, commandText, lockLabel } = await import('../src/live-data.js');
  const value=structuredClone(fixture);
  const base={zone:'C',door_id:'D07',code:'DOOR_OPEN',title:'Cửa D07 mở từ 30 giây',detail:'d',level:'warning',raised_at:'2026-10-13T01:00:00.000Z',acknowledged_at:null,resolved_at:null};
  value.alerts=[{...base,id:'AL-1',state:'active',acknowledged:true,acknowledged_at:'2026-10-13T01:00:05.000Z'},
    {...base,id:'AL-2',state:'active',acknowledged:false,level:'danger'},
    {...base,id:'AL-3',state:'resolved',acknowledged:false,resolved_at:'2026-10-13T01:01:00.000Z'}];
  value.doors[6]={...value.doors[6],locked:true};
  const view=snapshotToView(value);
  assert.deepEqual(view.alerts.map(a=>[a.id,a.state,a.acknowledged]),[['AL-1','active',true],['AL-2','active',false],['AL-3','resolved',false]]);
  assert.deepEqual(view.alerts.filter(needsAttention).map(a=>a.id),['AL-2']);
  assert.match(view.alerts[2].resolvedTime,/^\d{2}:\d{2}:\d{2}$/);
  assert.equal(lockLabel(view.doors[6]),'Đã khóa');assert.equal(lockLabel({locked:false}),'Không khóa');assert.equal(lockLabel({locked:null}),'Chưa xác định');
  assert.equal(commandText({status:'pending'}),'Đang chờ ESP-C01 xác nhận…');
  assert.match(commandText({status:'applied'}),/Đã áp dụng tại thiết bị/);
  assert.equal(commandText({status:'rejected',reason:'PRESENCE_DETECTED'}),'Bị từ chối: mmWave còn phát hiện người trong kho');
  assert.equal(commandText({status:'rejected',reason:'INTERLOCK_ACTIVE'}),'Bị từ chối: liên động hai cửa, cửa còn lại chưa đóng');
  assert.match(commandText({status:'expired',reason:'COMMAND_EXPIRED',late_ack:'applied'}),/Hết hạn.*phản hồi muộn: applied/);
  assert.match(commandText({error:'DEVICE_NOT_LIVE'}),/ESP-C01 chưa trực tuyến/);
});
test('access audit rows label shift decisions; out-of-shift is a warning, never a block',async()=>{
  const {accessToView}=await import('../src/live-data.js');
  const at='2026-10-13T11:30:00.000Z';
  const rows=accessToView({items:[
    {id:3,card_id:'DEMO-999',holder:'Thẻ thu hồi',door_id:'D07',direction:'in',edge_result:'unauthorized',shift_code:'NIGHT',shift_date:'2026-10-13',decision:'edge_rejected',at},
    {id:2,card_id:'DEMO-017',holder:'Ca ngày',door_id:'D07',direction:'in',edge_result:'accepted',shift_code:'NIGHT',shift_date:'2026-10-13',decision:'out_of_shift',at},
    {id:1,card_id:'DEMO-018',holder:'Ca đêm',door_id:'D07',direction:'in',edge_result:'accepted',shift_code:'NIGHT',shift_date:'2026-10-13',decision:'in_shift',at}]});
  assert.deepEqual(rows.map(r=>r.tone),['warning','warning','success']);
  assert.match(rows[1].label,/Ngoài ca/);assert.match(rows[1].note,/vẫn tính người/);
  assert.equal(rows[0].shift,'Ca đêm 13/10');assert.equal(rows[0].time,'18:30:00');
});
test('dashboard permissions follow the role list from the backend session',async()=>{
  const {can}=await import('../src/live-data.js');
  assert.equal(can({permissions:['read']},'command'),false);
  assert.equal(can({permissions:['read','command']},'command'),true);
  assert.equal(can(null,'read'),false);
});
test('receiving view: percent is display-only and truncated, level uses exact counts, reason codes are Vietnamese',async()=>{
  const {areaView,admissionText}=await import('../src/live-data.js');
  const a=areaView({capacity:258,occupied:200,reserved:45});
  assert.equal(a.used,245);assert.equal(a.percent,'94,9%');assert.equal(a.level,'warning');
  assert.equal(areaView({capacity:10000,occupied:9499,reserved:0}).percent,'94,9%','never rounds up to 95');
  assert.equal(areaView({capacity:100,occupied:95,reserved:0}).level,'danger');
  assert.equal(areaView({capacity:100,occupied:84,reserved:0}).level,'normal');
  assert.match(admissionText('CAPACITY_LIMIT'),/95%/);
  assert.match(admissionText('NO_SUITABLE_SLOT'),/nhiệt độ.*kích thước.*tải trọng/);
  assert.match(admissionText('STAGING_BLOCKED'),/khu đệm/i);
  assert.match(admissionText('RESERVATION_EXPIRED'),/15 phút/);
});
