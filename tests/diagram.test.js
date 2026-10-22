import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const diagram=JSON.parse(readFileSync(new URL('../firmware/diagram.json',import.meta.url)));
const config=readFileSync(new URL('../firmware/include/config.h',import.meta.url),'utf8');
const list=name=>new RegExp(`${name}\\[\\]\\s*=\\s*\\{([\\d,\\s]+)\\}`).exec(config)[1].split(',').map(Number);
const scalar=name=>Number(new RegExp(`\\b${name}\\s*=\\s*(\\d+)`).exec(config)[1]);
const esp=n=>({16:'esp:RX2',17:'esp:TX2'})[n] ?? `esp:D${n}`;
const wired=from=>diagram.connections.filter(c=>c[0]===from).map(c=>c[1]);
const part=id=>diagram.parts.find(p=>p.id===id);

test('Wokwi ESP32 wiring uses RX2/TX2 aliases for GPIO16/17',()=>{
  const endpoints=diagram.connections.flatMap(c=>c.slice(0,2));
  assert.ok(!endpoints.includes('esp:D16') && !endpoints.includes('esp:D17'));
  assert.ok(endpoints.includes('esp:RX2') && endpoints.includes('esp:TX2'));
});
test('each ESP-C01 input part drives exactly the controller slot assigned to it (DEC-044)',()=>{
  const pins=list('INPUT_PINS');
  // Slot order is the controller contract: per door contact, beam, panic; then shared presence.
  assert.deepEqual(pins.length,7);
  for (const [slot,id] of [[0,'contact07'],[1,'beam07'],[3,'contact08'],[4,'beam08']]) {
    assert.equal(part(id)?.type,'wokwi-slide-switch',id);
    assert.deepEqual(wired(`${id}:2`),[esp(pins[slot])],id);
  }
  // Panic buttons close to 3V3; the firmware uses INPUT_PULLDOWN so a press reads HIGH like the old switch.
  assert.deepEqual(list('PANIC_SLOTS'),[2,5]);
  for (const [slot,id] of [[2,'panic07'],[5,'panic08']]) {
    assert.equal(part(id)?.type,'wokwi-pushbutton',id);
    assert.equal(part(id).attrs.bounce,'0');
    assert.deepEqual(wired(`${id}:1.l`),[esp(pins[slot])],id);
    assert.deepEqual(wired(`${id}:2.l`),['esp:3V3'],id);
  }
  assert.equal(part('presence')?.type,'wokwi-pir-motion-sensor');
  assert.deepEqual(wired('presence:OUT'),[esp(pins[6])]);
  assert.equal(new Set(pins).size,pins.length);
  assert.ok(!pins.includes(scalar('DHT_PIN')),'DHT22 data pin must stay separate from safety inputs');
});
test('ESP-C01 outputs: lock relays, door servos, buzzer and indicator LEDs on their configured pins',()=>{
  const relays=list('LOCK_RELAY_PINS'), servos=list('DOOR_SERVO_PINS');
  for (const [i,door] of ['07','08'].entries()) {
    assert.equal(part(`relay${door}`)?.type,'wokwi-relay-module');
    assert.equal(part(`relay${door}`).attrs.transistor,'pnp','IN HIGH switches COM to NO');
    assert.deepEqual(wired(`relay${door}:IN`),[esp(relays[i])]);
    // The green lock lamp is the relay's load: it lights only while the relay holds the lock.
    assert.deepEqual(wired(`relay${door}:NO`),[`led-lock${door}:A`]);
    assert.deepEqual(wired(`relay${door}:COM`),['esp:3V3']);
    assert.equal(part(`servo${door}`)?.type,'wokwi-servo');
    assert.deepEqual(wired(`servo${door}:PWM`),[esp(servos[i])]);
  }
  assert.equal(part('buzzer')?.type,'wokwi-buzzer');
  assert.deepEqual(wired('buzzer:2'),[esp(scalar('BUZZER_PIN'))]);
  for (const [id,name] of [['light','LIGHT_PIN'],['heater','HEATER_PIN'],['fan','FAN_PIN']]) {
    assert.equal(part(`led-${id}`)?.type,'wokwi-led',id);
    assert.deepEqual(wired(`led-${id}:A`),[esp(scalar(name))],id);
    assert.ok(diagram.parts.some(p=>p.type==='wokwi-text' && p.id===`label-${id}`));
  }
  for (const id of ['open07','close07','open08','close08','buzzer']) assert.equal(part(`led-${id}`),undefined,`old LED ${id} removed`);
});
test('ESP-C01 MFRC522 reader and direction switch use the configured SPI pins, separate from every other pin',()=>{
  assert.equal(part('rfid')?.type,'board-mfrc522');
  const spi={SCK:'RFID_SCK_PIN',MOSI:'RFID_MOSI_PIN',MISO:'RFID_MISO_PIN',SDA:'RFID_SS_PIN'};
  for (const [pin,name] of Object.entries(spi)) assert.deepEqual(wired(`rfid:${pin}`),[esp(scalar(name))],pin);
  assert.deepEqual(wired('rfid:RST'),['esp:3V3'],'no free GPIO for reset: held high');
  assert.equal(part('rfid-dir')?.type,'wokwi-slide-switch');
  assert.deepEqual(wired('rfid-dir:2'),[esp(scalar('RFID_DIRECTION_PIN'))]);
  const used=[...list('INPUT_PINS'),...list('LOCK_RELAY_PINS'),...list('DOOR_SERVO_PINS'),
    ...['LIGHT_PIN','BUZZER_PIN','HEATER_PIN','FAN_PIN','DHT_PIN',...Object.values(spi),'RFID_DIRECTION_PIN'].map(scalar)];
  assert.equal(new Set(used).size,used.length,'every GPIO has one role');
  // Wokwi preset cards: Blue, Green and Red are mapped to the controller's card table.
  for (const card of ['DEMO-017','DEMO-018','DEMO-999']) assert.match(config,new RegExp(`"${card}"`));
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
    assert.equal(zone.parts.find(p => p.id === 'presence')?.type, 'wokwi-pir-motion-sensor', `${dir} presence is a PIR`);
    assert.deepEqual(wired('presence:OUT'), [esp(pin('PRESENCE_PIN'))]);
    const lcd = zone.parts.find(p => p.id === 'lcd');
    assert.equal(lcd?.type, 'wokwi-lcd1602');
    assert.equal(lcd.attrs.pins, 'i2c');
    assert.deepEqual(wired('lcd:SDA'), [esp(pin('LCD_SDA_PIN'))]);
    assert.deepEqual(wired('lcd:SCL'), [esp(pin('LCD_SCL_PIN'))]);
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
