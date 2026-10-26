import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {faultSources} from '../scripts/wokwi-fault-source.mjs';

const read=path=>readFileSync(new URL(`../firmware/${path}`,import.meta.url),'utf8').replaceAll('\r\n','\n');
const files=Object.fromEntries(['src/main.cpp','lib/khoguard/src/kg_edge.cpp','lib/khoguard/src/kg_rfid.cpp','lib/khoguard/src/kg_network.cpp'].map(p=>[p,read(p)]));
test('private Wokwi faults instrument current modules without changing production controller or inputs',()=>{
  const original=JSON.stringify(files);
  for(const variant of ['good','wrong-ca','wrong-hostname']) {
    const result=faultSources(files,variant);
    assert.match(result['src/main.cpp'],/ACCEPTANCE_PROFILE/);
    assert.match(result['lib/khoguard/src/kg_edge.cpp'],/acceptance::presence/);
    assert.match(result['lib/khoguard/src/kg_rfid.cpp'],/TEST REBOOT/);
    assert.match(result['lib/khoguard/src/kg_network.cpp'],/acceptance::paused/);
    assert.match(result['lib/khoguard/src/kg_network.cpp'],/net\.setCACert\(MQTT_CA_CERT\)/);
    assert.doesNotMatch(result['lib/khoguard/src/kg_network.cpp'],/net\.setInsecure\s*\(/);
    assert.equal(/wrong\.example\.invalid/.test(result['lib/khoguard/src/kg_network.cpp']),variant==='wrong-hostname');
    assert.equal(Object.keys(result).some(p=>p.endsWith('controller.h')||p.endsWith('config.h')||p.endsWith('kg_board.cpp')),false);
  }
  assert.equal(JSON.stringify(files),original);
});
test('private Wokwi fixture refuses a changed source anchor or unknown profile',()=>{
  assert.throws(()=>faultSources({...files,'src/main.cpp':''},'good'),/anchor/);
  assert.throws(()=>faultSources(files,'unsafe'),/profile/);
});
