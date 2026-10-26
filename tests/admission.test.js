import test from 'node:test';
import assert from 'node:assert/strict';
import { capacityDecision, pickSlot, parseAdmission, reservationAction, RESERVATION_TTL_MS } from '../server/admission.mjs';

test('95% ceiling uses exact integers on occupied + reserved after this reservation, never a rounded percent', () => {
  // 258 usable slots: 95% = 245.1, so 245 used is allowed and 246 is refused.
  assert.deepEqual(capacityDecision({capacity:258,occupied:200,reserved:44}),{ok:true,used:244,after:245,warning:'NEAR_CAPACITY'});
  assert.deepEqual(capacityDecision({capacity:258,occupied:200,reserved:45}),{ok:false,code:'CAPACITY_LIMIT',used:245,after:246});
  // 100 slots: reaching exactly 95 is allowed; already at 95 refuses.
  assert.equal(capacityDecision({capacity:100,occupied:94,reserved:0}).ok,true);
  assert.equal(capacityDecision({capacity:100,occupied:95,reserved:0}).code,'CAPACITY_LIMIT');
  // 94.6% would round to 95% on a UI but is still below the ceiling.
  assert.equal(capacityDecision({capacity:1000,occupied:945,reserved:0}).ok,true);
  assert.equal(capacityDecision({capacity:1000,occupied:950,reserved:0}).ok,false);
  // 85% warning boundary is also exact.
  assert.equal(capacityDecision({capacity:100,occupied:83,reserved:0}).warning,null);
  assert.equal(capacityDecision({capacity:100,occupied:84,reserved:0}).warning,'NEAR_CAPACITY');
  assert.equal(capacityDecision({capacity:0,occupied:0,reserved:0}).code,'CAPACITY_LIMIT');
});

test('single cold zone refuses goods assigned to retired ambient or chilled zones', () => {
  for (const temperature_class of ['ambient','chilled']) assert.throws(()=>parseAdmission(JSON.stringify({request_id:'req-12345678',temperature_class,size_class:1,load_kg:100})),{code:'INVALID_ADMISSION'});
});

test('slot must match temperature, size and load; best fit keeps large slots free', () => {
  const slots=[{id:'A-003',temperature_class:'ambient',size_class:3,max_load_kg:1500},{id:'A-002',temperature_class:'ambient',size_class:2,max_load_kg:1000},
    {id:'A-001',temperature_class:'ambient',size_class:2,max_load_kg:1000},{id:'C-001',temperature_class:'frozen',size_class:1,max_load_kg:500}];
  assert.equal(pickSlot(slots,{temperature_class:'ambient',size_class:1,load_kg:400}).id,'A-001');
  assert.equal(pickSlot(slots,{temperature_class:'ambient',size_class:2,load_kg:1200}).id,'A-003');
  assert.equal(pickSlot(slots,{temperature_class:'frozen',size_class:2,load_kg:100}),null,'frozen goods never go to an ambient slot');
  assert.equal(pickSlot(slots,{temperature_class:'ambient',size_class:3,load_kg:2000}),null);
});

test('admission requests are strictly validated', () => {
  const ok={request_id:'req-12345678',temperature_class:'frozen',size_class:2,load_kg:800};
  assert.deepEqual(parseAdmission(JSON.stringify(ok)),ok);
  for (const bad of [{...ok,extra:1},{...ok,size_class:4},{...ok,load_kg:0},{...ok,load_kg:1.5},{...ok,temperature_class:'hot'},{...ok,request_id:'short'},{...ok,request_id:'bad id 123'}])
    assert.throws(()=>parseAdmission(JSON.stringify(bad)),{code:'INVALID_ADMISSION'});
  assert.throws(()=>parseAdmission('['),{code:'INVALID_ADMISSION'});
});

test('reservation ends exactly once; expiry is at 15:00.000 measured by the backend clock', () => {
  const created=Date.parse('2026-10-13T03:00:00.000Z'), r={status:'pending',expires_at:new Date(created+RESERVATION_TTL_MS)};
  assert.equal(RESERVATION_TTL_MS,15*60*1000);
  assert.deepEqual(reservationAction(r,'confirm',new Date(created+RESERVATION_TTL_MS-1)),{next:'confirmed'});
  assert.deepEqual(reservationAction(r,'confirm',new Date(created+RESERVATION_TTL_MS)),{expire:true,code:'RESERVATION_EXPIRED'});
  assert.deepEqual(reservationAction(r,'cancel',new Date(created+RESERVATION_TTL_MS)),{expire:true,code:'RESERVATION_EXPIRED'});
  assert.deepEqual(reservationAction({...r,status:'confirmed'},'confirm',new Date(created)),{same:true},'repeat is idempotent');
  assert.deepEqual(reservationAction({...r,status:'confirmed'},'cancel',new Date(created)),{code:'RESERVATION_FINAL'});
  assert.deepEqual(reservationAction({...r,status:'cancelled'},'confirm',new Date(created)),{code:'RESERVATION_FINAL'});
  assert.deepEqual(reservationAction({...r,status:'expired'},'confirm',new Date(created)),{code:'RESERVATION_EXPIRED'});
});
