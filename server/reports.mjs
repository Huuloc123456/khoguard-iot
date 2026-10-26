import { sqlUtc } from './telemetry.mjs';
import { eventView } from './events.mjs';
import { registry } from '../contracts/validate.js';

// M15 history: one bounded, filtered, paginated query per stored dataset. SQL pieces come only from this table.
const SPECS = {
  events: {types:['rfid','panic','door','command_rejected'],
    sql:'SELECT id,device_id,received_at,message FROM device_events t',time:'t.received_at',zone:'t.zone_id = ?',type:'t.event_type = ?',view:eventView},
  alerts: {types:['info','warning','danger'],
    sql:'SELECT id,zone_id,door_id,code,level,state,title,raised_at,resolved_at,occurrences,acknowledged_at,acknowledged_by FROM alerts t',time:'t.raised_at',zone:'t.zone_id = ?',type:'t.level = ?'},
  commands: {types:['pending','applied','rejected','expired'],
    sql:'SELECT t.id,t.command_id,t.door_id,d.zone_id,t.action,t.status,t.reason,t.late_ack,t.requested_by,t.created_at,t.expires_at,t.acked_at FROM door_commands t JOIN doors d ON d.id=t.door_id',
    time:'t.created_at',zone:'d.zone_id = ?',type:'t.status = ?'},
  reservations: {types:['pending','confirmed','cancelled','expired'],
    sql:'SELECT t.id,t.request_id,t.slot_id,s.zone_id,t.temperature_class,t.size_class,t.load_kg,t.status,t.requested_by,t.created_at,t.expires_at,t.finished_at,t.finished_by FROM reservations t JOIN slots s ON s.id=t.slot_id',
    time:'t.created_at',zone:'s.zone_id = ?',type:'t.status = ?'},
  access: {types:['in_shift','out_of_shift','exit','duplicate','unknown_card','revoked_card','edge_rejected'],
    sql:'SELECT t.id,t.card_id,c.holder,t.door_id,d.zone_id,t.direction,t.edge_result,t.shift_code,t.shift_date,t.decision,t.at FROM access_audit t JOIN doors d ON d.id=t.door_id LEFT JOIN access_cards c ON c.card_id=t.card_id',
    time:'t.at',zone:'d.zone_id = ?',type:'t.decision = ?'},
};
export const REPORT_KINDS = Object.keys(SPECS);
const MAX_RANGE_MS = 31*24*3600000, DAY_MS = 24*3600000;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

export function parseReportQuery(kind,params,now=new Date()) {
  const invalid=()=>{throw new Error('INVALID_QUERY');};
  const spec=SPECS[kind]; if (!spec) invalid();
  for (const key of params.keys()) if (!['from','to','zone','type','limit','cursor'].includes(key) || params.getAll(key).length!==1) invalid();
  const time=key=>{const raw=params.get(key); if (raw===null) return null; if (!ISO.test(raw) || Number.isNaN(Date.parse(raw))) invalid(); return new Date(raw);};
  const integer=(key,min,max)=>{const raw=params.get(key); if (raw===null) return null;
    if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw)<min || Number(raw)>max) invalid(); return Number(raw);};
  const to=time('to') ?? now, from=time('from') ?? new Date(to.getTime()-DAY_MS);
  if (to<=from || to-from>MAX_RANGE_MS) invalid();
  const zone=params.get('zone'), type=params.get('type');
  if (zone!==null && !registry.zones.includes(zone)) invalid();
  if (type!==null && !spec.types.includes(type)) invalid();
  return {kind,from:from.toISOString(),to:to.toISOString(),zone,type,limit:integer('limit',1,500) ?? 100,cursor:integer('cursor',1,Number.MAX_SAFE_INTEGER)};
}

const iso = v => v===null || v===undefined ? null : new Date(v).toISOString();
const DATES = ['raised_at','resolved_at','acknowledged_at','created_at','expires_at','acked_at','finished_at','at'];
function plain(row) {
  const out={...row,id:Number(row.id)};
  for (const k of DATES) if (k in out) out[k]=iso(out[k]);
  if (out.shift_date && typeof out.shift_date!=='string') out.shift_date=new Date(out.shift_date).toISOString().slice(0,10);
  return out;
}

export async function runReport(connection,query) {
  const spec=SPECS[query.kind], where=[`${spec.time} >= ?`,`${spec.time} < ?`], values=[sqlUtc(new Date(query.from)),sqlUtc(new Date(query.to))];
  where.push(spec.zone);values.push(query.zone ?? registry.zones[0]);
  if (query.kind==='events' || query.kind==='alerts') {where.push('t.device_id = ?');values.push(registry.devices[0].id);}
  if (query.kind==='commands' || query.kind==='access') {where.push('t.door_id IN (?, ?)');values.push(...registry.devices[0].doors);}
  if (query.type) {where.push(spec.type);values.push(query.type);}
  if (query.cursor) {where.push('t.id < ?');values.push(query.cursor);}
  const [rows]=await connection.execute({sql:`${spec.sql} WHERE ${where.join(' AND ')} ORDER BY t.id DESC LIMIT ?`,timeout:3000},[...values,query.limit+1]);
  if (rows.some(r=>!Number.isSafeInteger(Number(r.id)))) throw new Error('CURSOR_OVERFLOW');
  const more=rows.length>query.limit, items=rows.slice(0,query.limit).map(spec.view ?? plain);
  return {kind:query.kind,from:query.from,to:query.to,items,next_cursor:more ? Number(items.at(-1).id):null};
}
