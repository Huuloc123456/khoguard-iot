import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { join } from 'node:path';
import mqtt from 'mqtt';
import { brokerOptions } from '../server/mqtt.mjs';
import { registry, validateMqttMessage } from '../contracts/validate.js';
import { local, readJson } from './local-config.mjs';

// M16 simulation helpers. Every device uses its own MQTT account/ACL, real topics and contract-checked frames.
// Deterministic: values come from a seeded PRNG; uptime comes from a virtual clock, not wall time.
export function prng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const ZONE_TEMPERATURE = { A: [18, 30], B: [2, 8], C: [-22, -16], D: [18, 28] };
const door = (id, extra = {}) => ({ door_id: id, state: 'closed', beam_clear: true, panic_latched: false, local_inputs_healthy: true, ...extra });

export class SimDevice {
  constructor(id, { config, accounts = readJson(join(local, 'mosquitto/accounts.json')), clock = () => 0, label = 'sim' } = {}) {
    this.spec = registry.devices.find(d => d.id === id);
    if (!this.spec) throw new Error(`unknown device ${id}`);
    Object.assign(this, { id, config, accounts, clock, label, seq: { telemetry: 0, events: 0, acks: 0 }, revision: 1, client: null });
    this.state = { temperature: null, humidity: 55, count: 0, presence: false, doors: Object.fromEntries(this.spec.doors.map(d => [d, door(d, this.spec.door_control ? { locked: true } : {})])) };
    this.newBoot();
  }
  newBoot() { this.boot = `${this.label}-${randomUUID()}`; this.session = `s-${randomUUID()}`; this.seq = { telemetry: 0, events: 0, acks: 0 }; }
  topic(kind) { return `khoguard/v1/WH01/devices/${this.id}/${kind}`; }
  envelope(kind, payload, extra = {}) {
    const seq = kind === 'status' ? 0 : ++this.seq[kind];
    return { schema_version: 1, warehouse_id: 'WH01', device_id: this.id, boot_id: this.boot, session_id: this.session, seq, kind, clock_synced: false, sent_at: null,
      uptime_ms: Math.floor(this.clock()), ...extra, payload: { zone_id: this.spec.zone_id, ...payload } };
  }
  async connect({ newSession = true } = {}) {
    if (newSession) this.session = `s-${randomUUID()}`;
    const will = JSON.stringify(this.envelope('status', { state: 'offline' }));
    this.client = mqtt.connect({ ...brokerOptions(this.config.mqtt), username: this.id, password: this.accounts[this.id], clientId: `kg-${this.label}-${this.id}-${randomUUID().slice(0, 8)}`,
      reconnectPeriod: 0, connectTimeout: 3000, keepalive: 10, clean: true, will: { topic: this.topic('status'), payload: will, qos: 1, retain: true } });
    this.client.on('error', () => {});
    await once(this.client, 'connect', { signal: AbortSignal.timeout(6000) });
    await this.publish(this.envelope('status', { state: 'online' }), true);
  }
  async publish(message, retain = false) {
    const raw = JSON.stringify(message), ok = validateMqttMessage(this.topic(message.kind), raw);
    if (!ok.ok) throw new Error(`frame breaks contract: ${JSON.stringify(ok.errors ?? ok).slice(0, 200)}`);
    await this.client.publishAsync(this.topic(message.kind), raw, { qos: 1, retain });
    return message;
  }
  telemetryPayload() {
    const s = this.state, p = { controller_revision: this.revision, doors: Object.values(s.doors) };
    if (this.spec.environment) p.environment = { temperature_c: s.temperature, humidity_pct: s.humidity };
    if (this.spec.occupancy) p.occupancy = { current_occupants: s.count, count_verified: true, presence: s.presence };
    if (s.alarms?.length) p.alarms = s.alarms;
    return p;
  }
  telemetry() { return this.publish(this.envelope('telemetry', this.telemetryPayload())); }
  event(payload) { const m = this.envelope('events', payload); m.event_id = `${m.boot_id}:${m.seq}`; return this.publish(m); }
  async offline() { await this.publish(this.envelope('status', { state: 'offline' }), true).catch(() => {}); await this.client?.endAsync(true); this.client = null; }
}

// Fake ESP-C01 edge for scripted demos: a reduced copy of the M09 close/open rules (the real ones run in firmware C++).
export class FakeEdge extends SimDevice {
  constructor(options) { super('ESP-C01', { ...options, label: options?.label ?? 'fake-edge' }); this.state.temperature = -18.4; this.decisions = []; }
  async connect(options) {
    await super.connect(options);
    await this.client.subscribeAsync(this.topic('commands'), { qos: 1 });
    this.client.on('message', (_t, raw) => void this.onCommand(JSON.parse(raw)).catch(() => {}));
  }
  closeReason(doorId) {
    const s = this.state, d = s.doors[doorId];
    if (d.panic_latched) return 'PANIC_ACTIVE';
    if (s.count > 0) return 'OCCUPIED';
    if (s.presence) return 'PRESENCE_DETECTED';
    if (!d.beam_clear) return 'BEAM_BLOCKED';
    return null;
  }
  async onCommand(m) {
    const p = m.payload;
    let reason = m.boot_id !== this.boot || m.session_id !== this.session ? 'COMMAND_EXPIRED' : p.expected_revision !== this.revision ? 'REVISION_MISMATCH' : null;
    const other = Object.values(this.state.doors).find(d => d.door_id !== p.door_id);
    if (!reason && p.action === 'close') reason = this.closeReason(p.door_id);
    if (!reason && p.action === 'open' && other && other.state !== 'closed' && !Object.values(this.state.doors).some(d => d.panic_latched)) reason = 'INTERLOCK_ACTIVE';
    if (!reason) {
      const d = this.state.doors[p.door_id];
      if (p.action === 'open') Object.assign(d, { state: 'open', locked: false });
      if (p.action === 'close') Object.assign(d, { state: 'closed', locked: true });
      if (p.action === 'reset_panic') d.panic_latched = false;
      this.revision++;
    }
    this.decisions.push({ action: p.action, door: p.door_id, reason });
    await this.publish(this.envelope('acks', { door_id: p.door_id, command_id: p.command_id, status: reason ? 'rejected' : 'applied', reason }));
    await this.telemetry();
  }
}
