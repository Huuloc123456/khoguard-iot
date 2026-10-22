import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const diagram=JSON.parse(readFileSync(new URL('../firmware/diagram.json',import.meta.url)));
test('Wokwi ESP32 wiring uses RX2/TX2 aliases for GPIO16/17 and unique assigned inputs',()=>{
  const endpoints=diagram.connections.flatMap(c=>c.slice(0,2));
  assert.ok(!endpoints.includes('esp:D16') && !endpoints.includes('esp:D17'));
  assert.ok(endpoints.includes('esp:RX2') && endpoints.includes('esp:TX2'));
  const switches=diagram.parts.filter(p=>p.type==='wokwi-slide-switch');
  assert.equal(switches.length,7);
  assert.ok(switches.every(s=>['','1'].includes(s.attrs.value)));
});
test('each Wokwi switch drives exactly the firmware input slot assigned to its door',()=>{
  const source=readFileSync(new URL('../firmware/include/config.h',import.meta.url),'utf8');
  const pins=/INPUT_PINS\[\]\s*=\s*\{([\d,\s]+)\}/.exec(source)[1].split(',').map(Number);
  const pin=endpoint=>({'esp:RX2':16,'esp:TX2':17})[endpoint] ?? Number(/^esp:D(\d+)$/.exec(endpoint)?.[1]);
  const wired=id=>diagram.connections.filter(c=>c[0]===`${id}:2`).map(c=>pin(c[1]));
  // Slot order is the controller contract: per door contact, beam, panic; then shared presence.
  const slots=['contact07','beam07','panic07','contact08','beam08','panic08','presence'];
  assert.deepEqual(slots.map(wired),pins.map(p=>[p]));
  assert.equal(new Set(pins).size,pins.length);
  assert.ok(!pins.includes(15),'DHT22 data pin must stay separate from safety inputs');
});
test('each firmware output pin drives one labelled LED to ground, separate from inputs',()=>{
  const source=readFileSync(new URL('../firmware/include/config.h',import.meta.url),'utf8');
  const list=name=>new RegExp(`${name}\\[\\]\\s*=\\s*\\{([\\d,\\s]+)\\}`).exec(source)[1].split(',').map(Number);
  const outputs=list('OUTPUT_PINS'), inputs=list('INPUT_PINS');
  const leds=['lock07','lock08','open07','close07','open08','close08','light','buzzer','heater','fan'];
  assert.equal(outputs.length,leds.length);
  for (const [i,id] of leds.entries()) {
    const part=diagram.parts.find(p=>p.id===`led-${id}`);
    assert.equal(part?.type,'wokwi-led',id);
    assert.deepEqual(diagram.connections.filter(c=>c[0]===`led-${id}:A`).map(c=>c[1]),[`esp:D${outputs[i]}`]);
    assert.ok(diagram.connections.some(c=>c[0]===`led-${id}:C` && /^esp:GND/.test(c[1])));
    assert.ok(diagram.parts.some(p=>p.type==='wokwi-text' && p.id===`label-${id}`));
  }
  assert.equal(new Set([...outputs,...inputs,15]).size,outputs.length+inputs.length+1);
});

test('each zone-node Wokwi project wires the pins of zn_config.h and points at its own PlatformIO build', () => {
  const config = readFileSync(new URL('../firmware/lib/khoguard_zone/src/zn_config.h', import.meta.url), 'utf8');
  const pin = name => Number(new RegExp(`${name}\\s*=\\s*(\\d+)`).exec(config)[1]);
  const contacts = /CONTACT_PINS\[3\]\s*=\s*\{([\d,\s]+)\}/.exec(config)[1].split(',').map(Number);
  const alias = { 16: 'esp:RX2', 17: 'esp:TX2' };
  const esp = n => alias[n] ?? `esp:D${n}`;
  for (const [dir, env, doors] of [['zone-a', 'zone_a', ['D01', 'D02', 'D03']], ['zone-b', 'zone_b', ['D04', 'D05', 'D06']], ['zone-d', 'zone_d', ['D10', 'D11', 'D12']]]) {
    const zone = JSON.parse(readFileSync(new URL(`../firmware/wokwi/${dir}/diagram.json`, import.meta.url)));
    const wired = from => zone.connections.filter(c => c[0] === from).map(c => c[1]);
    doors.forEach((door, i) => assert.deepEqual(wired(`contact-${door.toLowerCase()}:2`), [esp(contacts[i])], `${dir} ${door}`));
    assert.deepEqual(wired('presence:2'), [esp(pin('PRESENCE_PIN'))]);
    assert.deepEqual(wired('btn-in:1.l'), [esp(pin('IN_BUTTON_PIN'))]);
    assert.deepEqual(wired('btn-out:1.l'), [esp(pin('OUT_BUTTON_PIN'))]);
    assert.deepEqual(wired('led-warning:A'), [esp(pin('WARNING_LED_PIN'))]);
    assert.deepEqual(wired('led-critical:A'), [esp(pin('CRITICAL_LED_PIN'))]);
    assert.ok(zone.connections.some(c => c[0] === 'esp:D15' && c[1] === 'dht:SDA'));
    const toml = readFileSync(new URL(`../firmware/wokwi/${dir}/wokwi.toml`, import.meta.url), 'utf8');
    assert.match(toml, new RegExp(`firmware-build/${env}/firmware\\.bin`));
    assert.doesNotMatch(toml, /rfc2217/, 'only ESP-C01 owns the RFC2217 serial port 4000');
  }
});
