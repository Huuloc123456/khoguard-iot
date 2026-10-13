import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import deviceRegistry from './devices.json' with {type:'json'};
import mqttContract from './mqtt.schema.json' with {type:'json'};
import snapshotContract from './snapshot.schema.json' with {type:'json'};

export const registry = deviceRegistry;
const ajv = new Ajv({ strict: true, allErrors: true, ownProperties: true });
addFormats(ajv, ['date-time']);
const mqttSchema = ajv.compile(mqttContract);
const snapshotSchema = ajv.compile(snapshotContract);
const failure = (code, message, details) => ({ ok: false, error: { code, message, ...(details ? { details } : {}) } });
const schemaFailure = (code, validate) => failure(code, 'Data does not match the contract', structuredClone(validate.errors));
const deviceById = id => registry.devices.find(device => device.id === id);
const uniqueIds = items => new Set(items.map(item => item.id)).size === items.length;

export function validateMqttMessage(topic, raw) {
  const match = typeof topic === 'string' && /^khoguard\/v1\/WH01\/devices\/([A-Z0-9-]{1,32})\/(telemetry|events|status|commands|acks)$/.exec(topic);
  if (!match) return failure('INVALID_TOPIC', 'Unsupported MQTT topic');
  if (typeof raw !== 'string' && !Buffer.isBuffer(raw)) return failure('INVALID_JSON', 'Payload must be UTF-8 JSON');
  if (Buffer.byteLength(raw) > 65536) return failure('PAYLOAD_TOO_LARGE', 'Payload exceeds 65536 bytes');
  let value;
  try {
    const text = typeof raw === 'string' ? raw : new TextDecoder('utf-8', { fatal: true }).decode(raw);
    value = JSON.parse(text);
  } catch {
    return failure('INVALID_JSON', 'Payload must be valid UTF-8 JSON');
  }
  if (!mqttSchema(value)) return schemaFailure('INVALID_SCHEMA', mqttSchema);
  if (value.device_id !== match[1] || value.kind !== match[2]) return failure('DEVICE_MISMATCH', 'Topic and envelope do not agree');
  const device = deviceById(value.device_id);
  if (!device) return failure('DEVICE_NOT_REGISTERED', 'Device is not registered');
  const payload = value.payload;
  if (payload.zone_id !== device.zone_id) return failure('ZONE_MISMATCH', 'Device cannot report another zone');
  const doorIds = payload.doors?.map(door => door.door_id) ?? (payload.door_id ? [payload.door_id] : []);
  const alarmDoors = (payload.alarms ?? []).filter(alarm => alarm.door_id).map(alarm => alarm.door_id);
  if (alarmDoors.some(id => !device.doors.includes(id))) return failure('DOOR_NOT_ASSIGNED', 'Alarm door is not assigned to this device');
  if (new Set(doorIds).size !== doorIds.length || doorIds.some(id => !device.doors.includes(id))) {
    return failure('DOOR_NOT_ASSIGNED', 'Door is duplicated or not assigned to this device');
  }
  if ((payload.environment && !device.environment) || (payload.occupancy && !device.occupancy)) {
    return failure('UNSUPPORTED_TELEMETRY', 'Device is not the owner of these zone measurements');
  }
  if (value.kind === 'telemetry' && ((device.environment && !payload.environment) || (device.occupancy && !payload.occupancy)
    || doorIds.length !== device.doors.length)) {
    return failure('INCOMPLETE_TELEMETRY', 'Telemetry must include every measurement and door owned by the device');
  }
  if (value.kind === 'commands') {
    const ttl = Date.parse(payload.expires_at) - Date.parse(value.sent_at);
    if (ttl <= 0 || ttl > 30000) return failure('INVALID_COMMAND', 'Command lifetime must be between 1 and 30000 ms');
  }
  return { ok: true, value };
}

export function validateSnapshot(value) {
  if (!snapshotSchema(value)) return schemaFailure('INVALID_SNAPSHOT', snapshotSchema);
  if (![value.zones, value.doors, value.devices, value.alerts].every(uniqueIds)) return failure('INVALID_SNAPSHOT', 'Duplicate ID');
  if (value.zones.length !== registry.zones.length || value.doors.length !== registry.devices.reduce((total, device) => total + device.doors.length, 0)
    || value.devices.length !== registry.devices.length) return failure('INVALID_SNAPSHOT', 'Snapshot must include the entire configured warehouse');
  if (value.zones.some(zone => (zone.occupied ?? 0) + (zone.reserved ?? 0) > zone.capacity || zone.range[0] > zone.range[1])) {
    return failure('INVALID_SNAPSHOT', 'Invalid capacity or temperature range');
  }
  const zoneIds = new Set(value.zones.map(zone => zone.id));
  if (value.doors.some(door => !zoneIds.has(door.zone) || !registry.devices.some(device => device.zone_id === door.zone && device.doors.includes(door.id)))) {
    return failure('INVALID_SNAPSHOT', 'Door has no matching zone assignment');
  }
  if (value.devices.some(device => {
    const registered = deviceById(device.id);
    const age = device.last_seen_at === null ? null : Date.parse(value.generated_at) - Date.parse(device.last_seen_at);
    return !registered || !zoneIds.has(device.zone) || registered.zone_id !== device.zone || registered.source !== device.source
      || (age !== null && age < 0)
      || (device.freshness === 'fresh' && (device.state !== 'online' || age === null || age > 10000 || device.boot_id === null || device.session_id === null || device.controller_revision === null));
  })) return failure('INVALID_SNAPSHOT', 'Invalid device provenance or freshness');
  if (value.alerts.some(alert => !zoneIds.has(alert.zone))) return failure('INVALID_SNAPSHOT', 'Alert has no matching zone');
  return { ok: true, value };
}
