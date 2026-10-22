import assert from 'node:assert/strict';
import { connect } from 'node:net';
import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, openSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createInterface } from 'node:readline/promises';
import mqtt from 'mqtt';
import { root, local, readJson } from './local-config.mjs';
import { readConfig } from '../server/config.mjs';
import { brokerOptions } from '../server/mqtt.mjs';
import { shiftAt } from '../server/auth.mjs';
import { validateMqttMessage } from '../contracts/validate.js';
import { signIn, authFetch } from './check-session.mjs';

// Manual-assisted acceptance against the real ESP-C01 firmware in Wokwi (no FakeEdge): RFID via RFC2217 serial,
// switches toggled by a person in the simulator, T08 by stopping the project broker. Evidence stays in .local.
const config = readConfig(process.env), base = `http://${config.host}:${config.port}`;
const SERIAL_PORT = 4000, MANUAL_MS = 180000, TOPIC = 'khoguard/v1/WH01/devices/ESP-C01/';
const from = process.argv.find(a => a.startsWith('--from='))?.slice(7) ?? 'S0';
const runDir = join(local, 'wokwi-acceptance', 'runs', new Date().toISOString().replace(/[:.]/g, '-'));
mkdirSync(runDir, { recursive: true });
const log = (file, line) => appendFileSync(join(runDir, file), `${line}\n`);
const results = [];
const say = text => { console.log(text); log('steps.log', `${new Date().toISOString()} ${text}`); };
const ask = text => say(`\x07\n>>> THAO TÁC: ${text}\n`);
// Some switch positions have no telemetry signal (a released panic button keeps the latch), so the operator confirms.
async function confirm(text) {
  ask(`${text} Xong thì nhấn Enter.`);
  if (!process.stdin.isTTY) { await delay(20000); return; }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  await rl.question('');
  rl.close();
}

// --- Serial over RFC2217 (telnet IAC is stripped; plain bytes are UART data) ---
const serial = { lines: [], socket: null, partial: '' };
function iacFilter() {
  let state = 0;
  return byte => {
    if (state === 0) { if (byte === 255) { state = 1; return null; } return byte; }
    if (state === 1) { if (byte === 255) { state = 0; return 255; } state = byte >= 251 && byte <= 254 ? 2 : byte === 250 ? 3 : 0; return null; }
    if (state === 2) { state = 0; return null; }
    if (byte === 240) state = 0; // end of subnegotiation (approximate: SE)
    return null;
  };
}
async function openSerial(timeoutMs) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const socket = await new Promise(resolve => {
      const s = connect(SERIAL_PORT, '127.0.0.1');
      s.once('connect', () => resolve(s)); s.once('error', () => resolve(null));
    });
    if (socket) {
      const filter = iacFilter();
      socket.on('data', chunk => {
        for (const raw of chunk) {
          const b = filter(raw); if (b === null) continue;
          if (b === 10) {
            const text = serial.partial.replace(/\r$/, ''); serial.partial = '';
            serial.lines.push({ at: Date.now(), text }); log('serial.log', `${new Date().toISOString()} ${text}`);
          } else serial.partial += String.fromCharCode(b);
        }
      });
      socket.on('error', () => {});
      socket.on('close', () => { serial.socket = null; say('Serial RFC2217 đã đóng (simulator dừng?)'); });
      serial.socket = socket; return;
    }
    await delay(1000);
  }
  throw new Error(`Không mở được Serial 127.0.0.1:${SERIAL_PORT}; Start Simulator với firmware/wokwi.toml`);
}
const serialMark = () => serial.lines.length;
async function serialWait(regex, mark, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const hit = serial.lines.slice(mark).find(l => regex.test(l.text));
    if (hit) return hit;
    await delay(50);
  }
  throw new Error(`Serial chưa thấy ${regex}`);
}
async function serialWrite(text) {
  assert.ok(serial.socket, 'Serial chưa kết nối');
  log('serial.log', `${new Date().toISOString()} >>> ${text}`);
  serial.socket.write(`${text}\n`);
}

// --- Read-only MQTT observer; reconnects on its own across the T08 broker stop ---
const frames = [];
const accounts = readJson(join(local, 'mosquitto', 'accounts.json'));
const observer = mqtt.connect({ ...brokerOptions(config.mqtt), username: 'khoguard-observer', password: accounts['khoguard-observer'],
  clientId: `kg-wokwi-acceptance-${randomUUID()}`, clean: true, reconnectPeriod: 1000, connectTimeout: 2000 });
observer.on('error', () => {});
observer.on('connect', () => void observer.subscribeAsync(['telemetry', 'events', 'status', 'acks', 'commands'].map(k => TOPIC + k), { qos: 1 }).catch(() => {}));
observer.on('message', (topic, payload, packet) => {
  const raw = payload.toString(), checked = validateMqttMessage(topic, raw);
  const frame = { at: Date.now(), topic, retain: packet.retain, valid: checked.ok, message: checked.ok ? checked.value : null };
  frames.push(frame); log('mqtt.jsonl', JSON.stringify({ ...frame, raw: checked.ok ? undefined : raw.slice(0, 500) }));
});
const lastTelemetry = () => frames.findLast(f => f.topic.endsWith('/telemetry') && f.valid && !f.retain)?.message;
async function telemetryWait(pred, ms = 15000, label = 'điều kiện telemetry') {
  const startAt = Date.now(), end = startAt + ms;
  let reminded = startAt;
  while (Date.now() < end) {
    const hit = frames.findLast(f => f.at >= startAt && f.topic.endsWith('/telemetry') && f.valid && !f.retain && pred(f.message.payload));
    if (hit) return hit.message;
    if (ms >= 60000 && Date.now() - reminded > 30000) { reminded = Date.now(); say(`   … vẫn đang chờ: ${label}`); }
    await delay(100);
  }
  throw new Error(`Hết giờ chờ ${label}`);
}
async function eventWait(pred, since, ms = 10000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const hit = frames.find(f => f.at >= since && f.topic.endsWith('/events') && f.valid && pred(f.message.payload));
    if (hit) return hit.message;
    await delay(100);
  }
  throw new Error('Không thấy event MQTT mong đợi');
}
// A command carries the controller revision the backend last stored; wait until it has stopped moving.
async function settled() {
  const t1 = await telemetryWait(() => true, 6000, 'telemetry');
  const t2 = await telemetryWait(() => true, 6000, 'telemetry');
  if (t2.payload.controller_revision !== t1.payload.controller_revision) return settled();
  await delay(400);
  return t2;
}
const door = (p, id) => p.doors.find(d => d.door_id === id);
const baselineOk = p => p.occupancy.count_verified && p.occupancy.current_occupants === 0 && p.occupancy.presence === false
  && ['D07', 'D08'].every(id => { const d = door(p, id); return d.state === 'closed' && d.beam_clear === true && d.panic_latched === false && d.local_inputs_healthy && d.locked; });

// --- Backend API as operator ---
const json = async (path, init = {}) => {
  const r = await authFetch(`${base}${path}`, { ...init, signal: AbortSignal.timeout(5000) });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const post = (path, body) => json(path, { method: 'POST', headers: { origin: 'http://127.0.0.1:5173', 'content-type': 'application/json' }, body: JSON.stringify(body) });
async function command(doorId, action, attempt = 1) {
  await settled();
  const created = await post(`/api/doors/${doorId}/commands`, { action });
  assert.equal(created.status, 202, `POST command ${doorId} ${action} → ${created.status} ${JSON.stringify(created.body)}`);
  for (let i = 0; i < 60; i++) {
    const r = await json(`/api/commands/${created.body.command_id}`);
    if (r.body?.status && r.body.status !== 'pending') {
      // A local timer/fault can move the revision between settle and delivery; the edge refuses, so ask again.
      if (r.body.reason === 'REVISION_MISMATCH' && attempt < 3) return command(doorId, action, attempt + 1);
      return r.body;
    }
    await delay(250);
  }
  throw new Error('Lệnh vẫn pending sau 15 s');
}
async function resetUntilApplied(doorId) {
  for (let i = 0; i < 10; i++) {
    const r = await command(doorId, 'reset_panic');
    if (r.status === 'applied') return r;
    say(`   đặt lại ${doorId}: ${r.status} ${r.reason ?? ''}; nút còn giữ? thử lại sau 3 s`);
    await delay(3000);
  }
  throw new Error(`Không đặt lại được ${doorId}`);
}
const snapshot = async () => (await json('/api/snapshot')).body;
const alertsOf = async (code, doorId) => (await snapshot()).alerts.filter(a => a.code === code && (doorId === undefined || a.door_id === doorId));

// --- Project broker control (T08): only the Mosquitto started with .local/mosquitto/mosquitto.conf ---
function projectBrokerPids() {
  const ps = `Get-CimInstance Win32_Process -Filter "Name='mosquitto.exe'" | Where-Object { $_.CommandLine -like '*\\.local\\mosquitto\\mosquitto.conf*' } | ForEach-Object { $_.ProcessId }`;
  return execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).split(/\s+/).filter(Boolean).map(Number);
}
const portOpen = port => new Promise(resolve => { const s = connect(port, '127.0.0.1'); s.once('connect', () => { s.destroy(); resolve(true); }); s.once('error', () => resolve(false)); });
async function stopBroker() {
  const pids = projectBrokerPids();
  assert.equal(pids.length, 1, `cần đúng 1 broker dự án, thấy ${pids.length}`);
  process.kill(pids[0]);
  for (let i = 0; i < 50 && await portOpen(config.mqtt.port); i++) await delay(100);
  assert.equal(await portOpen(config.mqtt.port), false, 'broker vẫn mở cổng');
  return pids[0];
}
function startBroker() {
  const out = openSync(join(runDir, 'broker.log'), 'a');
  const child = spawn(process.execPath, ['scripts/start-mqtt.mjs'], { cwd: root, detached: true, stdio: ['ignore', out, out], windowsHide: true });
  child.unref();
  return child.pid;
}

// --- Steps ---
let reached = false;
async function step(id, test, title, run, { always = false } = {}) {
  if (id === from) reached = true;
  if (!reached && !always) { say(`[bỏ qua] ${id} ${title}`); return; }
  say(`\n=== ${id} [${test}] ${title}`);
  const started = Date.now();
  try {
    const detail = await run();
    results.push({ id, test, title, pass: true, ms: Date.now() - started, detail });
    say(`  ĐẠT${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
  } catch (error) {
    results.push({ id, test, title, pass: false, ms: Date.now() - started, error: error.message });
    say(`  KHÔNG ĐẠT — ${error.message}`);
    throw error;
  }
}
async function waitBaseline(reason) {
  const t = lastTelemetry();
  if (t && baselineOk(t.payload)) return;
  ask(`${reason}: D07/D08 đóng (contact LOW), hai HC-SR04 ở 400 cm, không bấm nút panic, PIR không tín hiệu (chờ 10 s sau lần Simulate Motion cuối).`);
  await telemetryWait(baselineOk, MANUAL_MS, 'trạng thái nền an toàn');
}
const rfid = async (line, expect, count) => {
  const mark = serialMark(), since = Date.now();
  await serialWrite(line);
  const hit = await serialWait(/^RFID_EVENT /, mark);
  const code = { accepted: 0, duplicate: 1, unauthorized: 2 }[expect];
  assert.match(hit.text, new RegExp(`result=${code} count=${count} verified=1`), hit.text);
  const [, doorId, card, dir] = line.split(' ');
  const event = await eventWait(p => p.event_type === 'rfid' && p.card_id === card && p.direction === dir.toLowerCase() && p.door_id === doorId, since);
  assert.equal(event.payload.result, expect);
  await telemetryWait(p => p.occupancy.count_verified && p.occupancy.current_occupants === count, 6000, `số người = ${count}`);
  return { serial: hit.text, event_id: event.event_id };
};

const runStarted = new Date();
let bootId;
try {
  await step('S0', 'chuẩn bị', 'Backend sẵn sàng, Serial RFC2217 và telemetry ESP-C01 từ Wokwi', async () => {
    const ready = await fetch(`${base}/api/ready`).then(r => r.status);
    assert.equal(ready, 200, 'backend chưa ready');
    await signIn(base, 'operator');
    if (!await portOpen(SERIAL_PORT)) ask('Trong VS Code: Wokwi: Start Simulator (cấu hình firmware/wokwi.toml). Harness chờ cổng Serial 4000.');
    await openSerial(1200000);
    const boot = await serialWait(/^KHOGUARD_M12 boot=([0-9a-f]{32})/, 0, 20000).catch(() => null);
    const t = await telemetryWait(() => true, 30000, 'telemetry ESP-C01 qua broker');
    bootId = t.boot_id;
    if (boot) assert.equal(boot.text.match(/boot=([0-9a-f]{32})/)[1], bootId, 'boot Serial ≠ boot MQTT');
    const s = await snapshot();
    assert.equal(s.devices.find(d => d.id === 'ESP-C01').source, 'wokwi');
    return { boot_id: bootId, boot_correlated: Boolean(boot), transport: boot?.text.match(/transport=(\S+)/)?.[1] ?? 'chưa thấy dòng boot' };
  }, { always: true });
  await step('S0b', 'chuẩn bị', 'Trạng thái nền: hai cửa đóng/khóa, count đã xác minh = 0', async () => {
    await waitBaseline('Đặt công tắc về trạng thái nền');
    return 'baseline ok';
  }, { always: true });

  await step('S1a', 'T04', 'RFID DEMO-017 vào D07 → count 1', () => rfid('RFID D07 DEMO-017 IN', 'accepted', 1));
  await step('S1b', 'T05/KB1', 'Còn 1 người: lệnh đóng D07 bị edge từ chối OCCUPIED', async () => {
    const c = await command('D07', 'close');
    assert.equal(c.status, 'rejected'); assert.equal(c.reason, 'OCCUPIED');
    return c;
  });
  await step('S1c', 'T04', 'Đọc lặp DEMO-017 IN không tăng count', () => rfid('RFID D07 DEMO-017 IN', 'duplicate', 1));
  await step('S1d', 'T19', 'Thẻ đã thu hồi DEMO-999 bị từ chối', () => rfid('RFID D08 DEMO-999 IN', 'unauthorized', 1));
  await step('S1e', 'T19', 'Thẻ lạ DEMO-404 bị từ chối', () => rfid('RFID D08 DEMO-404 IN', 'unauthorized', 1));
  await step('S1f', 'T04', 'DEMO-017 ra → count 0', () => rfid('RFID D07 DEMO-017 OUT', 'accepted', 0));
  await step('S1g', 'T04', 'Ra lần nữa khi count 0: duplicate, không âm', () => rfid('RFID D07 DEMO-017 OUT', 'duplicate', 0));
  await step('S1h', 'T04', 'Dòng sai định dạng không tạo event', async () => {
    const mark = serialMark(), since = Date.now();
    await serialWrite('RFID D09 DEMO-017 IN');
    await serialWait(/^RFID_FORMAT/, mark);
    await delay(3000);
    assert.equal(frames.some(f => f.at >= since && f.topic.endsWith('/events')), false, 'không được có event');
    return 'RFID_FORMAT';
  });
  await step('S1i', 'T04/T19', 'MySQL: device_events và access_audit khớp edge', async () => {
    const events = (await json('/api/events?device_id=ESP-C01&type=rfid&limit=20')).body.items.filter(e => Date.parse(e.received_at) >= runStarted.getTime());
    const got = events.map(e => `${e.card_id}:${e.direction}:${e.result}`).reverse();
    assert.deepEqual(got, ['DEMO-017:in:accepted', 'DEMO-017:in:duplicate', 'DEMO-999:in:unauthorized', 'DEMO-404:in:unauthorized', 'DEMO-017:out:accepted', 'DEMO-017:out:duplicate']);
    const q = new URLSearchParams({ from: runStarted.toISOString(), to: new Date(Date.now() + 1000).toISOString(), limit: '50' });
    const access = (await json(`/api/reports/access?${q}`)).body.items.reverse();
    const shift = shiftAt(new Date()).code, first = shift === 'DAY' ? 'in_shift' : 'out_of_shift';
    assert.deepEqual(access.map(a => a.decision), [first, 'duplicate', 'edge_rejected', 'edge_rejected', 'exit', 'duplicate']);
    return { events: got.length, shift, decisions: access.map(a => a.decision) };
  });

  await step('S2a', 'T05/KB2', 'RFID 0 nhưng mmWave còn người: chặn đóng + cảnh báo', async () => {
    ask('Bấm vào PIR → Simulate Motion (có người); bấm lại mỗi vài giây nếu bước này kéo dài quá 10 s.');
    await telemetryWait(p => p.occupancy.presence === true && p.occupancy.current_occupants === 0 && p.occupancy.count_verified, MANUAL_MS, 'presence = true');
    const c = await command('D07', 'close');
    assert.equal(c.status, 'rejected'); assert.equal(c.reason, 'PRESENCE_DETECTED');
    const a = await alertsOf('PRESENCE_MISMATCH');
    assert.ok(a.some(x => x.state === 'active'), 'thiếu cảnh báo PRESENCE_MISMATCH');
    return { command: c.reason, alert: a.find(x => x.state === 'active').id };
  });
  await step('S2b', 'T05/KB2', 'Hết hiện diện: cảnh báo tự hết, đóng được', async () => {
    ask('Ngừng bấm Simulate Motion (nếu đã đổi delayTime thì trả về 10); PIR tự về LOW.');
    await telemetryWait(p => p.occupancy.presence === false, MANUAL_MS, 'presence = false');
    await delay(2500);
    const a = await alertsOf('PRESENCE_MISMATCH');
    assert.ok(!a.some(x => x.state === 'active'), 'cảnh báo vẫn active');
    const c = await command('D07', 'close');
    assert.equal(c.status, 'applied');
    return { command: c.status };
  });

  await step('S3a', 'T11', 'Liên động: D07 mở thì lệnh mở D08 bị từ chối', async () => {
    ask('Gạt CONTACT07 sang HIGH (cửa D07 mở).');
    await telemetryWait(p => door(p, 'D07').state === 'open', MANUAL_MS, 'D07 mở');
    const c = await command('D08', 'open');
    assert.equal(c.status, 'rejected'); assert.equal(c.reason, 'INTERLOCK_ACTIVE');
    return c.reason;
  });
  await step('S3b', 'T10', 'Rèm quang bị chặn khi đang đóng → đảo chiều', async () => {
    await settled();
    say('  Harness sẽ gửi lệnh ĐÓNG D07 sau 5 giây. Khi servo D07 bắt đầu quay về 0°, kéo HC-SR04 D07 xuống dưới 100 cm trong vòng 8 giây.');
    for (let i = 5; i > 0; i--) { process.stdout.write(`  ${i}… `); await delay(1000); }
    const mark = serialMark(), since = Date.now();
    const created = await post('/api/doors/D07/commands', { action: 'close' });
    assert.equal(created.status, 202);
    say('\x07\n>>> KÉO HC-SR04 D07 XUỐNG DƯỚI 100 CM NGAY.');
    const hit = await serialWait(/^SAFETY_EVENT door=D07 closing reversed BEAM_BLOCKED/, mark, 12000);
    const ev = await eventWait(p => p.event_type === 'door' && p.door_id === 'D07' && p.reason === 'BEAM_BLOCKED', since);
    return { serial: hit.text, event_state: ev.payload.state };
  });
  await step('S3c', 'T10', 'Trả rèm quang và đóng D07 bằng tay', async () => {
    ask('Kéo HC-SR04 D07 về 400 cm rồi gạt CONTACT07 về LOW (cửa đóng).');
    await waitBaseline('Trả về trạng thái nền');
    return 'baseline';
  });

  await step('S4a', 'T07/KB3', 'Panic D07 từ trạng thái đóng: chốt, nhả khóa, mở, output khẩn cấp', async () => {
    const mark = serialMark(), since = Date.now();
    ask('Bấm nút đỏ PANIC07.');
    const ev = await eventWait(p => p.event_type === 'panic' && p.door_id === 'D07', since, MANUAL_MS);
    const inp = await serialWait(/^INPUT_EVENT door=D07 panic=1/, mark);
    const out = await serialWait(/^OUTPUTS .*lock=00 motor07=10 .*light=1 buzzer=1 heater=1 fan=0/, mark);
    const t = await telemetryWait(p => door(p, 'D07').panic_latched === true && !door(p, 'D07').locked && !door(p, 'D08').locked, 8000, 'panic chốt');
    assert.ok(['opening', 'open'].includes(door(t.payload, 'D07').state));
    assert.deepEqual(t.payload.outputs, { light: true, buzzer: true, heater: true, fan: false });
    return { event_id: ev.event_id, serial: [inp.text, out.text] };
  });
  await step('S4b', 'T09', 'Tiếp nhận cảnh báo không reset chốt', async () => {
    await delay(2500);
    const active = (await alertsOf('PANIC_ACTIVE', 'D07')).find(a => a.state === 'active');
    assert.ok(active, 'thiếu cảnh báo PANIC_ACTIVE');
    const ack = await post(`/api/alerts/${active.id}/ack`, {});
    assert.equal(ack.status, 200);
    await telemetryWait(p => door(p, 'D07').panic_latched === true, 6000, 'vẫn chốt');
    const after = (await alertsOf('PANIC_ACTIVE', 'D07')).find(a => a.id === active.id);
    assert.equal(after.state, 'active'); assert.equal(after.acknowledged, true);
    return { alert: active.id, state: after.state, acknowledged: after.acknowledged };
  });
  await step('S4c', 'T07', 'Đặt lại khi nút còn giữ bị từ chối', async () => {
    const c = await command('D07', 'reset_panic');
    assert.equal(c.status, 'rejected'); assert.equal(c.reason, 'PANIC_ACTIVE');
    return c.reason;
  });
  await step('S4d', 'T07', 'Cửa mở hẳn; nhả nút vẫn chốt; lệnh đóng bị PANIC_ACTIVE', async () => {
    ask('Gạt CONTACT07 sang HIGH (cửa D07 đã mở hẳn).');
    await telemetryWait(p => door(p, 'D07').state === 'open', MANUAL_MS, 'D07 mở');
    await confirm('Nút PANIC07 đã nhả (không giữ chuột trên nút).');
    await delay(1000);
    const t = await telemetryWait(() => true, 6000, 'telemetry');
    assert.equal(door(t.payload, 'D07').panic_latched, true, 'nhả nút không được tự xóa chốt');
    const c = await command('D07', 'close');
    assert.equal(c.status, 'rejected'); assert.equal(c.reason, 'PANIC_ACTIVE');
    return { latched_after_release: true, close: c.reason };
  });

  await step('S5a', 'T11', 'Panic D08 khi D07 đang mở: thoát hiểm thắng liên động', async () => {
    // Also runnable on its own (--from=S5a): the escape-over-interlock case needs D07 open first.
    if (door(lastTelemetry().payload, 'D07').state !== 'open') {
      ask('Gạt CONTACT07 sang HIGH (cửa D07 mở). Chưa bấm PANIC08.');
      await telemetryWait(p => door(p, 'D07').state === 'open', MANUAL_MS, 'D07 mở');
    }
    const mark = serialMark();
    ask('Chỉ bấm nút đỏ PANIC08 (giữ CONTACT07 ở HIGH).');
    const out = await serialWait(/^OUTPUTS .*motor08=10 /, mark, MANUAL_MS);
    await telemetryWait(p => door(p, 'D08').panic_latched === true && door(p, 'D07').state === 'open', 8000, 'D08 chốt');
    return out.text;
  });
  await step('S5b', 'T07', 'Nhả hai nút, đặt lại từng cửa bằng lệnh có quyền', async () => {
    ask('Gạt CONTACT08 sang HIGH (cửa D08 đã mở); nút PANIC08 đã tự nhả.');
    await telemetryWait(p => door(p, 'D08').state === 'open', MANUAL_MS, 'D08 mở');
    await delay(1000);
    const r7 = await resetUntilApplied('D07'), r8 = await resetUntilApplied('D08');
    await telemetryWait(p => !door(p, 'D07').panic_latched && !door(p, 'D08').panic_latched, 8000, 'hết chốt');
    await delay(2500);
    assert.ok(!(await alertsOf('PANIC_ACTIVE')).some(a => a.state === 'active'), 'cảnh báo panic chưa hết');
    return { D07: r7.status, D08: r8.status };
  });
  await step('S5c', 'chuẩn bị', 'Đóng cả hai cửa', async () => {
    ask('Gạt CONTACT07 và CONTACT08 về LOW.');
    await waitBaseline('Trả về trạng thái nền');
    return 'baseline';
  });

  let outage;
  await step('S6a', 'T08', 'Dừng broker dự án', async () => {
    await settled();
    const pid = await stopBroker();
    outage = { stopped_at: Date.now(), pid };
    const s = await snapshot().catch(() => null);
    return { stopped_pid: pid, backend_broker: s?.connections?.broker ?? 'không đọc được' };
  });
  await step('S6b', 'T08', 'Panic khi broker dừng: output an toàn cục bộ vẫn áp dụng', async () => {
    const mark = serialMark();
    ask('Broker đã dừng. Bấm nút đỏ PANIC07. Quan sát: relay khóa nhả, servo D07 mở, đèn/sưởi bật, buzzer kêu, quạt tắt.');
    const inp = await serialWait(/^INPUT_EVENT door=D07 panic=1/, mark, MANUAL_MS);
    const out = await serialWait(/^OUTPUTS .*lock=00 motor07=10 .*light=1 buzzer=1 heater=1 fan=0/, mark);
    assert.equal(await portOpen(config.mqtt.port), false, 'broker phải còn dừng lúc panic');
    outage.panic_at = inp.at;
    await delay(4000);
    return { serial: [inp.text, out.text], broker_down: true };
  });
  await step('S6c', 'T08/T22', 'Bật lại broker: ESP nối phiên mới, event panic lúc mất mạng tới MySQL', async () => {
    const mark = serialMark();
    const pid = startBroker();
    for (let i = 0; i < 50 && !await portOpen(config.mqtt.port); i++) await delay(200);
    const online = await serialWait(/^MQTT_ONLINE /, mark, 30000);
    const t = await telemetryWait(p => door(p, 'D07').panic_latched === true, 15000, 'telemetry sau nối lại');
    const ev = frames.find(f => f.at >= outage.stopped_at && f.topic.endsWith('/events') && f.valid && f.message.payload.event_type === 'panic' && f.message.payload.door_id === 'D07');
    assert.ok(ev, 'event panic chưa được gửi lại');
    await delay(1500);
    const stored = (await json('/api/events?device_id=ESP-C01&type=panic&limit=5')).body.items.find(e => Date.parse(e.received_at) >= outage.stopped_at);
    assert.ok(stored, 'event panic chưa vào MySQL');
    return { broker_pid: pid, serial: online.text, session_changed: t.session_id !== frames.findLast(f => f.at < outage.stopped_at && f.message)?.message.session_id,
      event_id: ev.message.event_id, event_uptime_ms: ev.message.uptime_ms, stored_id: stored.id };
  });
  await step('S6d', 'T08', 'Dọn: nhả nút, đặt lại, đóng cửa', async () => {
    ask('Gạt CONTACT07 sang HIGH (cửa đã mở); nút PANIC07 đã tự nhả — harness sẽ đặt lại.');
    await telemetryWait(p => door(p, 'D07').state === 'open', MANUAL_MS, 'D07 mở');
    const r = await resetUntilApplied('D07');
    ask('Gạt CONTACT07 về LOW.');
    await waitBaseline('Trả về trạng thái nền');
    return r.status;
  });

  // T23 on the real edge: these frames are published straight to the device with the backend account (the only one
  // allowed to write commands), so they have no DB row; the outcome is read from the firmware's serial line.
  const rawCommand = async (sessionId, commandId) => {
    const t = await settled(), now = Date.now();
    const message = { schema_version: 1, warehouse_id: 'WH01', device_id: 'ESP-C01', boot_id: t.boot_id, session_id: sessionId, seq: 1, kind: 'commands',
      clock_synced: true, sent_at: new Date(now).toISOString(), uptime_ms: 0,
      payload: { zone_id: 'C', door_id: 'D07', command_id: commandId, action: 'close', expires_at: new Date(now + 10000).toISOString(), expected_revision: t.payload.controller_revision } };
    const raw = JSON.stringify(message);
    assert.ok(validateMqttMessage(TOPIC + 'commands', raw).ok, 'lệnh thử phải đúng hợp đồng');
    const sender = mqtt.connect({ ...brokerOptions(config.mqtt), username: config.mqtt.username, password: config.mqtt.password,
      clientId: `kg-wokwi-acceptance-cmd-${randomUUID()}`, clean: true, reconnectPeriod: 0, connectTimeout: 3000 });
    sender.on('error', () => {});
    await new Promise((resolve, reject) => { sender.once('connect', resolve); sender.once('error', reject); });
    return { publish: () => sender.publishAsync(TOPIC + 'commands', raw, { qos: 1, retain: false }), end: () => sender.endAsync(true), session: t.session_id };
  };
  await step('S7a', 'T23', 'Lệnh trùng ID chỉ chạy một lần tại edge', async () => {
    const id = `accept-dup-${randomUUID().slice(0, 8)}`, mark = serialMark();
    const c = await rawCommand(lastTelemetry().session_id, id);
    try {
      await c.publish();
      const first = await serialWait(new RegExp(`^COMMAND ${id} D07 close -> applied$`), mark);
      await c.publish();
      const second = await serialWait(new RegExp(`^COMMAND ${id} D07 close -> applied \\(duplicate, not re-run\\)$`), mark);
      return { serial: [first.text, second.text] };
    } finally { await c.end(); }
  });
  await step('S7b', 'T23', 'Lệnh của phiên cũ bị edge từ chối COMMAND_EXPIRED', async () => {
    const id = `accept-old-${randomUUID().slice(0, 8)}`, mark = serialMark();
    const c = await rawCommand(`old-${randomUUID().replaceAll('-', '')}`, id);
    try {
      await c.publish();
      const hit = await serialWait(new RegExp(`^COMMAND ${id} D07 close -> COMMAND_EXPIRED$`), mark);
      return hit.text;
    } finally { await c.end(); }
  });

  // T12 + M11 on the device clock (OUTPUTS ms=…), with the broker down so the timers are shown to run locally.
  const outputsAfter = (mark, regex) => serial.lines.slice(mark).find(l => /^OUTPUTS /.test(l.text) && regex.test(l.text));
  const msOf = line => Number(line.text.match(/ms=(\d+)/)[1]);
  await step('S8', 'T12/M11', 'Timer cửa mở 30 s / >60 s chạy tại edge khi broker dừng', async () => {
    const mark = serialMark();
    ask('Gạt CONTACT07 sang HIGH (cửa D07 mở) và để nguyên khoảng 70 giây.');
    const opened = await serialWait(/^OUTPUTS .*lock=0\d .*light=0 buzzer=0/, mark, MANUAL_MS);
    const pid = await stopBroker();
    say(`   Broker dừng (PID ${pid}); chờ timer tại thiết bị…`);
    await serialWait(/^OUTPUTS .*light=1 buzzer=1/, mark, 75000);
    const light = outputsAfter(mark, /light=1 buzzer=0/), buzzer = outputsAfter(mark, /light=1 buzzer=1/);
    assert.ok(light && buzzer, 'thiếu dòng OUTPUTS đèn/còi');
    const warnMs = msOf(light) - msOf(opened), critMs = msOf(buzzer) - msOf(opened);
    assert.equal(await portOpen(config.mqtt.port), false, 'broker phải còn dừng');
    // The open moment is when debounce accepted the contact; the first OUTPUTS line follows in the same 10 ms loop.
    assert.ok(warnMs >= 29990 && warnMs <= 30100, `đèn ở ${warnMs} ms`);
    assert.ok(critMs > 59990 && critMs <= 60100, `còi ở ${critMs} ms`);
    startBroker();
    await serialWait(/^MQTT_ONLINE /, mark, 30000);
    const t = await telemetryWait(p => (p.alarms ?? []).some(a => a.code === 'DOOR_OPEN_CRITICAL' && a.door_id === 'D07'), 15000, 'alarm cửa mở');
    await delay(1500);
    const alert = (await alertsOf('DOOR_OPEN', 'D07')).find(a => a.state === 'active');
    assert.ok(alert && alert.level === 'danger', 'thiếu cảnh báo DOOR_OPEN mức danger');
    ask('Gạt CONTACT07 về LOW (đóng D07).');
    await waitBaseline('Trả về trạng thái nền');
    await delay(2500);
    assert.ok(!(await alertsOf('DOOR_OPEN', 'D07')).some(a => a.state === 'active'), 'cảnh báo cửa mở chưa hết');
    return { light_after_ms: warnMs, buzzer_after_ms: critMs, open_ms_reported: door(t.payload, 'D07').open_ms, alert: alert.id };
  });
  await step('S9', 'T12/M11', 'Người mắc kẹt: presence liên tục khi hai cửa đóng >5 phút', async () => {
    const mark = serialMark();
    ask('Giữ PIR có tín hiệu khoảng 5 phút 10 giây (hai cửa vẫn đóng): bấm Simulate Motion lại trước khi hết 10 s, hoặc tạm đặt delayTime của PIR = 330 trong diagram.json.');
    const seen = await telemetryWait(p => p.occupancy.presence === true, MANUAL_MS, 'presence = true');
    say('   Đang chờ 5 phút theo đồng hồ thiết bị…');
    const trapped = await serialWait(/^OUTPUTS .*light=1 buzzer=1 heater=1 fan=0/, mark, 320000);
    // Presence started at most one telemetry period (2 s) before the first frame that reported it.
    const afterMs = msOf(trapped) - seen.uptime_ms;
    assert.ok(afterMs > 298000 && afterMs <= 303000, `mắc kẹt sau ${afterMs} ms`);
    await telemetryWait(p => (p.alarms ?? []).some(a => a.code === 'TRAPPED_PERSON'), 8000, 'alarm TRAPPED_PERSON');
    await delay(1500);
    assert.ok((await alertsOf('TRAPPED_PERSON')).some(a => a.state === 'active'), 'thiếu cảnh báo TRAPPED_PERSON');
    ask('Ngừng bấm Simulate Motion (nếu đã đổi delayTime thì trả về 10); PIR tự về LOW.');
    await waitBaseline('Trả về trạng thái nền');
    const cleared = await serialWait(/^OUTPUTS .*heater=0 fan=1/, mark, 8000);
    return { trapped_after_ms: afterMs, serial: [trapped.text, cleared.text] };
  });
} catch {
  // Recorded in results; stop at the first failure so later steps do not run from an unknown state.
} finally {
  const passed = results.filter(r => r.pass).length;
  writeFileSync(join(runDir, 'result.json'), JSON.stringify({ started_at: runStarted.toISOString(), finished_at: new Date().toISOString(), boot_id: bootId, from, results }, null, 2));
  say(`\nKết quả: ${passed}/${results.length} bước đạt. Bằng chứng: ${runDir}`);
  if (results.some(r => !r.pass)) process.exitCode = 1;
  serial.socket?.end();
  await observer.endAsync(true).catch(() => {});
  process.exit();
}
