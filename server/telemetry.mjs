import { registry } from '../contracts/validate.js';

export const sessionKey = m => JSON.stringify([m.device_id,m.boot_id,m.session_id]);
export const sqlUtc = date => date.toISOString().replace('T',' ').replace('Z','');

export function telemetryDecision(current,candidate,message,packet,now,retired) {
  if (packet.retain) return 'retained';
  if (retired) return 'retired_session';
  const sameSession = s => s?.boot_id === message.boot_id && s?.session_id === message.session_id;
  const confirmed = sameSession(candidate);
  // After a DB fault or backend restart the broker redelivers frames of the session the DB still holds as current,
  // before the retained status online re-confirms it. Keep them as history ('backlog'); only confirmation makes it live.
  if (!confirmed && !sameSession(current)) return 'unconfirmed';
  if (message.clock_synced && (Date.parse(message.sent_at) > now || now-Date.parse(message.sent_at) > 10000)) return 'invalid_time';
  if (current?.boot_id === message.boot_id && current.seq !== null) {
    if (message.seq <= current.seq) return 'old_sequence';
    if (message.uptime_ms < current.uptime_ms || message.payload.controller_revision < current.controller_revision) return 'regression';
  }
  return confirmed ? 'accepted' : 'backlog';
}

export function parseHistoryQuery(params) {
  const invalid = () => { throw new Error('INVALID_QUERY'); };
  const allowed = ['device_id','from','to','limit','cursor'];
  for (const key of params.keys()) if (!allowed.includes(key) || params.getAll(key).length !== 1) invalid();
  const device = params.get('device_id');
  if (!registry.devices.some(d=>d.id===device)) invalid();
  const utc = key => {
    const raw = params.get(key);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:[0-5]\d(?:\.\d{1,3})?Z$/.test(raw ?? '') || !Number.isFinite(Date.parse(raw))) invalid();
    const date = new Date(raw);
    if (date.toISOString().slice(0,19) !== raw.slice(0,19)) invalid();
    return date;
  };
  const from=utc('from'), to=utc('to');
  if (to <= from || to-from > 7*86400000) invalid();
  const integer = (key,fallback,min,max) => {
    const raw = params.get(key) ?? String(fallback);
    if (!/^(0|[1-9]\d*)$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw)<min || Number(raw)>max) invalid();
    return Number(raw);
  };
  return {device,from:sqlUtc(from),to:sqlUtc(to),limit:integer('limit',100,1,200),cursor:integer('cursor',0,0,Number.MAX_SAFE_INTEGER)};
}

const iso = value => value ? new Date(value).toISOString() : null;
export const alertView = a => ({id:`AL-${a.id}`,zone:a.zone_id,door_id:a.door_id ?? null,code:a.code,title:a.title,detail:a.detail,level:a.level,state:a.state,
  acknowledged:a.acknowledged_at!==null && a.acknowledged_at!==undefined,raised_at:iso(a.raised_at),resolved_at:iso(a.resolved_at),acknowledged_at:iso(a.acknowledged_at)});

export function buildSnapshot(zones,rows,revision,now,connections,live,alerts=[],slots=[]) {
  const byId = new Map(rows.map(row=>[row.device_id,row]));
  const devices = registry.devices.map(device=>{
    const row=byId.get(device.id), message=row?.message;
    const last=row?.received_at ? new Date(row.received_at) : null;
    const age=last ? now-last : null;
    const sentAge=message?.clock_synced ? now-Date.parse(message.sent_at) : age;
    const fresh=message && row.state==='online' && connections.mqtt && live.has(sessionKey({...row,device_id:device.id})) && age>=0 && age<=10000 && sentAge>=0 && sentAge<=10000;
    return {id:device.id,zone:device.zone_id,source:device.source,state:connections.mqtt && live.has(sessionKey({...row,device_id:device.id})) ? row.state : row?.state==='offline' ? 'offline' : 'unknown',
      freshness:fresh ? 'fresh' : message ? 'stale' : 'unknown',last_seen_at:last?.toISOString() ?? null,
      boot_id:row?.boot_id ?? null,session_id:row?.session_id ?? null,controller_revision:message?.payload.controller_revision ?? null};
  });
  return {schema_version:1,warehouse_id:'WH01',revision,generated_at:now.toISOString(),
    connections:{broker:connections.mqtt ? 'connected':'disconnected',database:connections.database ? 'connected':'disconnected'},
    zones:zones.filter(zone=>registry.zones.includes(zone.id)).map(zone=>{
      const owner=registry.devices.find(d=>d.zone_id===zone.id && d.environment);
      const payload=byId.get(owner.id)?.message?.payload;
      const count=slots.find(c=>c.zone_id===zone.id);
      // Capacity is usable slots (defrost excluded); occupancy is demo-seed or confirmed reservations, never a WMS reading.
      return {id:zone.id,name:zone.name,range:[zone.temperature_min,zone.temperature_max],capacity:count ? Number(count.capacity):zone.capacity,
        occupied:count ? Number(count.occupied):null,reserved:count ? Number(count.reserved):null,
        environment:payload?.environment ?? {temperature_c:null,humidity_pct:null},
        occupancy:payload?.occupancy ?? {current_occupants:null,count_verified:false,presence:null}};
    }),
    doors:registry.devices.flatMap(device=>device.doors.map(id=>{
      const row=byId.get(device.id), door=row?.message?.payload.doors.find(d=>d.door_id===id);
      return {id,zone:device.zone_id,state:door?.state ?? 'unknown',beam_clear:door?.beam_clear ?? null,panic_latched:door?.panic_latched ?? null,
        local_inputs_healthy:door?.local_inputs_healthy ?? false,locked:door?.locked ?? null,
        open_seconds:door?.open_ms!==undefined ? door.open_ms/1000 : null,updated_at:row?.received_at ? new Date(row.received_at).toISOString():null};
    })),devices,alerts:alerts.filter(a=>registry.zones.includes(a.zone_id) && (a.door_id==null || registry.devices.some(d=>d.doors.includes(a.door_id)))).map(alertView)};
}
