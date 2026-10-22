import { registry } from '../contracts/validate.js';

export const COMMAND_TTL_MS = 10000;
const ACK_GRACE_MS = 2000;
const invalid = code => { throw Object.assign(new Error(code),{code}); };

export function parseCommandRequest(doorId,raw) {
  const device=registry.devices.find(d=>d.doors.includes(doorId));
  if (!device) invalid('INVALID_COMMAND');
  let body;
  try {body=JSON.parse(raw);} catch {invalid('INVALID_COMMAND');}
  if (!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).join()!=='action' || !['open','close','reset_panic'].includes(body.action)) invalid('INVALID_COMMAND');
  // Only the door controller (ESP-C01) runs local door rules; zone nodes and simulators have no actuator to command.
  if (!device.door_control) invalid('NOT_COMMANDABLE');
  return {door:doorId,action:body.action,device:device.id};
}

export function buildCommand({commandId,seq,door,action,device,now}) {
  const zone=registry.devices.find(d=>d.id===device.id).zone_id;
  return {schema_version:1,warehouse_id:'WH01',device_id:device.id,boot_id:device.boot_id,session_id:device.session_id,seq,kind:'commands',
    clock_synced:true,sent_at:new Date(now).toISOString(),uptime_ms:0,
    payload:{zone_id:zone,door_id:door,command_id:commandId,action,expires_at:new Date(now+COMMAND_TTL_MS).toISOString(),expected_revision:device.controller_revision}};
}

export function commandView(row,now) {
  const expired=row.status==='pending' && now>new Date(row.expires_at).getTime()+ACK_GRACE_MS;
  return {command_id:row.command_id,door_id:row.door_id,action:row.action,status:expired ? 'expired':row.status,
    reason:expired ? 'COMMAND_EXPIRED':row.reason,late_ack:row.late_ack ?? null,
    created_at:new Date(row.created_at).toISOString(),expires_at:new Date(row.expires_at).toISOString(),acked_at:row.acked_at ? new Date(row.acked_at).toISOString():null};
}

// One final state per command; an ack after expiry is kept as late_ack so the edge's real outcome is not lost.
export function ackTransition(row,ack) {
  if (row.status==='pending') return {status:ack.status,reason:ack.reason};
  if (row.status==='expired' && !row.late_ack) return {late_ack:ack.status};
  return null;
}
