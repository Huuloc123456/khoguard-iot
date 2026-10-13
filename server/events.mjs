import { registry } from '../contracts/validate.js';

export function eventDecision(current,candidate,message,packet,now,retired) {
  if (packet.retain) return 'retained';
  if (retired) return 'retired_session';
  const confirmed=[current,candidate].some(s=>s?.boot_id===message.boot_id && s?.session_id===message.session_id);
  if (!confirmed) return 'unconfirmed';
  if (message.clock_synced && (Date.parse(message.sent_at) > now || now-Date.parse(message.sent_at) > 10000)) return 'invalid_time';
  return 'accepted';
}

// Edge event sequences start at 1 per boot; a jump means frames were dropped before persistence.
export function eventGap(lastSeq,seq) {
  const expected=(lastSeq ?? 0)+1;
  return seq>expected ? {from:expected,to:seq-1} : null;
}

export function parseEventsQuery(params) {
  const invalid=()=>{throw new Error('INVALID_QUERY');};
  for (const key of params.keys()) if (!['device_id','type','limit','cursor'].includes(key) || params.getAll(key).length!==1) invalid();
  const device=params.get('device_id'), type=params.get('type');
  if (device!==null && !registry.devices.some(d=>d.id===device)) invalid();
  if (type!==null && !['rfid','panic','door','command_rejected'].includes(type)) invalid();
  const integer=(key,min,max)=>{
    const raw=params.get(key);
    if (raw===null) return null;
    if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw)<min || Number(raw)>max) invalid();
    return Number(raw);
  };
  return {device,type,limit:integer('limit',1,200) ?? 50,cursor:integer('cursor',1,Number.MAX_SAFE_INTEGER)};
}

export function eventView(row) {
  const p=row.message.payload;
  const optional=Object.fromEntries(['card_id','direction','result','state','input','command_id','reason'].filter(k=>p[k]!==undefined).map(k=>[k,p[k]]));
  return {id:row.id,device_id:row.device_id,zone:p.zone_id,door_id:p.door_id,event_type:p.event_type,received_at:new Date(row.received_at).toISOString(),...optional};
}
