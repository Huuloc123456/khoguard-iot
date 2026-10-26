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
  for (const [slot,id] of [[0,'contact07'],[3,'contact08']]) {
    assert.equal(part(id)?.type,'wokwi-slide-switch',id);
    assert.deepEqual(wired(`${id}:2`),[esp(pins[slot])],id);
  }
  // DEC-045: light curtains are HC-SR04 sensors; ECHO uses the beam slot pin, one shared TRIG pin fires both.
  assert.deepEqual(list('BEAM_SLOTS'),[1,4]);
  for (const [slot,id] of [[1,'sonar07'],[4,'sonar08']]) {
    assert.equal(part(id)?.type,'wokwi-hc-sr04',id);
    assert.deepEqual(wired(`${id}:ECHO`),[esp(pins[slot])],id);
    assert.deepEqual(wired(`${id}:TRIG`),[esp(scalar('SONAR_TRIG_PIN'))],id);
  }
  for (const old of ['beam07','beam08']) assert.equal(part(old),undefined,`old beam switch ${old} removed`);
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
    assert.deepEqual(wired(`relay${door}:NO`),[`r-lock${door}:1`]);
    assert.deepEqual(wired(`r-lock${door}:2`),[`led-lock${door}:A`]);
    assert.deepEqual(wired(`relay${door}:COM`),['esp:3V3']);
    assert.equal(part(`servo${door}`)?.type,'wokwi-servo');
    assert.deepEqual(wired(`servo${door}:PWM`),[esp(servos[i])]);
  }
  assert.equal(part('buzzer')?.type,'wokwi-buzzer');
  assert.deepEqual(wired('buzzer:2'),[esp(scalar('BUZZER_PIN'))]);
  assert.equal(part('led-light')?.type,'wokwi-led');
  assert.deepEqual(wired('led-light:A'),['r-light:1']);
  assert.deepEqual(wired('r-light:2'),[esp(scalar('LIGHT_PIN'))]);
  // Fan is always the opposite of the heater (controller.h), so one changeover relay drives both lamps.
  assert.equal(part('relay-climate')?.type,'wokwi-relay-module');
  assert.equal(part('relay-climate').attrs.transistor,'pnp');
  assert.deepEqual(wired('relay-climate:IN'),[esp(scalar('CLIMATE_RELAY_PIN'))]);
  assert.deepEqual(wired('relay-climate:COM'),['esp:3V3']);
  assert.deepEqual(wired('relay-climate:NO'),['r-heater:1']);
  assert.deepEqual(wired('relay-climate:NC'),['r-fan:1']);
  for (const id of ['light','heater','fan']) assert.ok(diagram.parts.some(p=>p.type==='wokwi-text' && p.id===`label-${id}`),id);
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
    ...['LIGHT_PIN','BUZZER_PIN','CLIMATE_RELAY_PIN','SONAR_TRIG_PIN','DHT_PIN',...Object.values(spi),'RFID_DIRECTION_PIN'].map(scalar)];
  assert.equal(new Set(used).size,used.length,'every GPIO has one role');
  // Wokwi preset cards: Blue, Green and Red are mapped to the controller's card table.
  for (const card of ['DEMO-017','DEMO-018','DEMO-999']) assert.match(config,new RegExp(`"${card}"`));
});

// Pin names of every Wokwi part we use (wokwi-elements / docs.wokwi.com). A wire to an unknown pin is silently dropped.
const PART_PINS={
  'wokwi-esp32-devkit-v1':['VIN','GND.2','D13','D12','D14','D27','D26','D25','D33','D32','D35','D34','VN','VP','EN',
    '3V3','GND.1','D15','D2','D4','RX2','TX2','D5','D18','D19','D21','RX0','TX0','D22','D23'],
  'wokwi-dht22':['VCC','SDA','NC','GND'], 'wokwi-resistor':['1','2'], 'wokwi-slide-switch':['1','2','3'],
  'wokwi-pushbutton':['1.l','1.r','2.l','2.r'], 'wokwi-pir-motion-sensor':['VCC','OUT','GND'], 'wokwi-led':['A','C'],
  'wokwi-relay-module':['VCC','GND','IN','NC','COM','NO'], 'wokwi-servo':['GND','V+','PWM'], 'wokwi-buzzer':['1','2'],
  'board-mfrc522':['3.3V','RST','GND','IRQ','MISO','MOSI','SCK','SDA'], 'wokwi-hc-sr04':['VCC','TRIG','ECHO','GND'],
  'wokwi-lcd1602':['GND','VCC','SDA','SCL'],
};
const diagrams=[['firmware/diagram.json',diagram]];

test('every wire in the active Wokwi diagram ends on a real pin of an existing part',()=>{
  for (const [name,d] of diagrams) {
    const types=new Map(d.parts.map(p=>[p.id,p.type]));
    for (const endpoint of d.connections.flatMap(c=>c.slice(0,2))) {
      const [id,pin]=endpoint.split(/:(.+)/);
      if (id==='$serialMonitor') {assert.ok(['RX','TX'].includes(pin),`${name} ${endpoint}`);continue;}
      assert.ok(types.has(id),`${name}: wire to missing part ${endpoint}`);
      const pins=PART_PINS[types.get(id)];
      assert.ok(pins,`${name}: no pin list for part type ${types.get(id)}`);
      assert.ok(pins.includes(pin),`${name}: ${types.get(id)} has no pin "${pin}" (${endpoint})`);
    }
  }
});

// Wokwi simulates the ESP32's internal pull resistors only on RTC GPIOs (docs.wokwi.com/guides/esp32), so a push button
// on GPIO 18/21/22 needs an external resistor or the input floats when the button is released.
const pulled=(d,gpio,rail)=>d.parts.filter(p=>p.type==='wokwi-resistor').some(r=>{
  const ends=d.connections.filter(c=>c[0].startsWith(`${r.id}:`)).map(c=>c[1]);
  return ends.includes(gpio) && ends.some(e=>rail.test(e));
});
test('push buttons on non-RTC GPIOs have an external pull resistor to the released level',()=>{
  for (const gpio of ['esp:D18','esp:D22']) assert.ok(pulled(diagram,gpio,/^esp:GND/),`ESP-C01 panic ${gpio} needs a pull-down to GND`);
});

test('every indicator LED has its own 220 ohm series resistor',()=>{
  for(const name of ['lock07','lock08','light','heater','fan']) {
    assert.equal(part(`r-${name}`).attrs.value,'220');
    const ends=diagram.connections.filter(c=>c.slice(0,2).some(e=>e.startsWith(`r-${name}:`)));
    assert.equal(ends.length,2,`${name}: resistor has exactly two connections`);
    assert.ok(ends.some(c=>c.includes(`led-${name}:A`)),`${name}: resistor is in series with the anode`);
  }
});
