import { validateMqttMessage, validateSnapshot } from '../contracts/validate.js';
import { telemetryDecision, sessionKey, sqlUtc, buildSnapshot } from './telemetry.mjs';
import { eventDecision, eventGap, eventView } from './events.mjs';
import { desiredAlerts, offlineAlert, planAlerts } from './alerts.mjs';
import { buildCommand, commandView, ackTransition } from './commands.mjs';
import { alertView } from './telemetry.mjs';
import { shiftAt, accessDecision } from './auth.mjs';
import { randomUUID } from 'node:crypto';
import { runReport } from './reports.mjs';

const LEVELS = {info:0,warning:1,danger:2};
const commandTopic = id => `khoguard/v1/WH01/devices/${id}/commands`;

const execute = (connection,sql,values=[]) => connection.execute({sql,timeout:1500},values);

export function createTelemetryStore(pool,{publish}={}) {
  const candidates=new Map(), live=new Set();
  let generation=0;
  const resetConnection=()=>{generation++;candidates.clear();live.clear();};
  async function transaction(work) {
    let connection,deadline;
    try {
      connection=await pool.getConnection();
      // Includes pool commands/commit in the deadline; a destroyed connection rolls back on MySQL.
      deadline=setTimeout(()=>connection.destroy(),5000);
      await connection.query({sql:'SET SESSION innodb_lock_wait_timeout = 1',timeout:1500});
      await connection.beginTransaction();
      const result=await work(connection);
      await connection.commit();
      return result;
    } catch(error) {
      await connection?.rollback().catch(()=>{});
      connection?.destroy();
      resetConnection();
      throw error;
    } finally {clearTimeout(deadline);connection?.release();}
  }
  const latestAlerts = async (connection,deviceId) => {
    const [rows]=await execute(connection,`SELECT a.id,a.alert_key AS \`key\`,a.state,a.level,a.resolved_at FROM alerts a
      JOIN (SELECT MAX(id) AS id FROM alerts WHERE device_id = ? GROUP BY alert_key) latest ON latest.id=a.id FOR UPDATE`,[deviceId]);
    return rows;
  };
  async function applyAlerts(connection,deviceId,ops,now) {
    const at=sqlUtc(now);
    for (const o of ops) {
      if (o.op==='raise') await execute(connection,"INSERT INTO alerts (alert_key,device_id,zone_id,door_id,code,level,state,title,detail,raised_at) VALUES (?,?,?,?,?,?,'active',?,?,?)",
        [o.key,deviceId,o.zone,o.door_id,o.code,o.level,o.title,o.detail,at]);
      // Escalation to a higher level asks for a fresh acknowledgement; ack never changes state.
      if (o.op==='update') await execute(connection,'UPDATE alerts SET level=?,title=?,detail=?,acknowledged_at=IF(?,NULL,acknowledged_at),acknowledged_by=IF(?,NULL,acknowledged_by) WHERE id=?',
        [o.level,o.title,o.detail,o.raise,o.raise,o.id]);
      if (o.op==='reopen') await execute(connection,"UPDATE alerts SET state='active',level=?,title=?,detail=?,raised_at=?,resolved_at=NULL,occurrences=occurrences+1,acknowledged_at=NULL,acknowledged_by=NULL WHERE id=?",
        [o.level,o.title,o.detail,at,o.id]);
      if (o.op==='resolve') await execute(connection,"UPDATE alerts SET state='resolved',resolved_at=? WHERE id=?",[at,o.id]);
    }
    return ops.length;
  }
  async function syncAlerts(connection,m,now) {
    const [zones]=await execute(connection,'SELECT zone_id AS id,temperature_min,temperature_max FROM zone_settings WHERE zone_id = ?',[m.payload.zone_id]);
    const rows=await latestAlerts(connection,m.device_id);
    const active=new Set(rows.filter(r=>r.state==='active').map(r=>r.key));
    const ops=planAlerts(rows,desiredAlerts(m,zones[0],active),now.getTime());
    const levels=new Map(rows.map(r=>[r.id,r.level]));
    return applyAlerts(connection,m.device_id,ops.map(o=>o.op==='update' ? {...o,raise:LEVELS[o.level]>LEVELS[levels.get(o.id)]}:o),now);
  }
  async function ingest(packet) {
    const started=generation;
    const validated=validateMqttMessage(packet.topic,packet.payload);
    if (!validated.ok) return validated.error.code;
    const m=validated.value;
    if (!['status','telemetry','events','acks'].includes(m.kind)) return 'unsupported_kind';
    if (packet.qos!==1) return 'invalid_qos';
    if (m.kind==='telemetry' && packet.retain) return 'retained';
    const key=sessionKey(m);
    const result=await transaction(async connection=>{
      const [rows]=await execute(connection,'SELECT * FROM device_current WHERE device_id = ? FOR UPDATE',[m.device_id]);
      const current=rows[0];
      if (!current) throw new Error('INVENTORY_MISSING');
      const [sessions]=await execute(connection,'SELECT boot_id, session_id, retired FROM device_sessions WHERE device_id = ? AND boot_id = ?',[m.device_id,m.boot_id]);
      const retired=sessions.some(s=>s.retired && (s.session_id===m.session_id || current.boot_id!==m.boot_id));
      if (retired) return 'retired_session';
      if (m.kind==='status') {
        if (m.payload.state==='online') return 'status_online';
        const pending=candidates.get(m.device_id);
        const currentMatches=current.boot_id===m.boot_id && current.session_id===m.session_id;
        if (!currentMatches && (pending?.boot_id!==m.boot_id || pending?.session_id!==m.session_id)) return 'old_status';
        await execute(connection,'INSERT INTO device_sessions (device_id,boot_id,session_id,retired) VALUES (?,?,?,TRUE) ON DUPLICATE KEY UPDATE retired = TRUE',[m.device_id,m.boot_id,m.session_id]);
        if (!currentMatches) return 'old_status';
        if (current.state!=='offline') {
          await execute(connection,"UPDATE device_current SET state = 'offline' WHERE device_id = ?",[m.device_id]);
          const offline=offlineAlert(m.device_id,m.payload.zone_id);
          const rows=(await latestAlerts(connection,m.device_id)).filter(r=>r.key===offline.key);
          await applyAlerts(connection,m.device_id,planAlerts(rows,[offline],Date.now()),new Date());
          await execute(connection,"UPDATE warehouse_stream SET revision = revision + 1 WHERE warehouse_id = 'WH01'");
        }
        return 'status_offline';
      }
      if (m.kind==='acks') {
        if (packet.retain) return 'retained';
        const [commands]=await execute(connection,'SELECT * FROM door_commands WHERE command_id = ? FOR UPDATE',[m.payload.command_id]);
        const command=commands[0];
        // An ack only counts from the exact session and door the command was bound to.
        if (!command || command.device_id!==m.device_id || command.door_id!==m.payload.door_id || command.boot_id!==m.boot_id || command.session_id!==m.session_id) return 'unknown_command';
        const now=new Date(), view=commandView(command,now.getTime());
        if (view.status==='expired' && command.status==='pending') {
          await execute(connection,"UPDATE door_commands SET status='expired',reason='COMMAND_EXPIRED' WHERE id=?",[command.id]);
          command.status='expired'; command.reason='COMMAND_EXPIRED';
        }
        const change=ackTransition(command,m.payload);
        if (!change) return 'duplicate';
        if (change.late_ack) {
          await execute(connection,'UPDATE door_commands SET late_ack=? WHERE id=?',[change.late_ack,command.id]);
          return 'late_ack';
        }
        await execute(connection,'UPDATE door_commands SET status=?,reason=?,acked_at=? WHERE id=?',[change.status,change.reason,sqlUtc(now),command.id]);
        return `ack_${change.status}`;
      }
      if (m.kind==='events') {
        const decision=eventDecision(current,candidates.get(m.device_id),m,packet,Date.now(),retired);
        if (decision!=='accepted') return decision;
        const [duplicates]=await execute(connection,'SELECT id FROM device_events WHERE device_id = ? AND event_id = ?',[m.device_id,m.event_id]);
        if (duplicates.length) return 'duplicate';
        const [last]=await execute(connection,'SELECT MAX(seq) AS seq FROM device_events WHERE device_id = ? AND boot_id = ?',[m.device_id,m.boot_id]);
        const received=sqlUtc(new Date()), gap=eventGap(last[0].seq===null ? null:Number(last[0].seq),m.seq);
        if (gap) await execute(connection,'INSERT INTO event_gaps (device_id,boot_id,from_seq,to_seq,detected_at) VALUES (?,?,?,?,?)',[m.device_id,m.boot_id,gap.from,gap.to,received]);
        const [stored]=await execute(connection,'INSERT INTO device_events (device_id,event_id,boot_id,session_id,seq,zone_id,door_id,event_type,received_at,message) VALUES (?,?,?,?,?,?,?,?,?,?)',
          [m.device_id,m.event_id,m.boot_id,m.session_id,m.seq,m.payload.zone_id,m.payload.door_id,m.payload.event_type,received,JSON.stringify(m)]);
        if (m.payload.event_type==='rfid') {
          // M13 access audit by backend receive time (edge has no clock); it records shift compliance and never changes the edge decision.
          const p=m.payload, shift=shiftAt(new Date(received+'Z'));
          const [cards]=await execute(connection,'SELECT card_id,shift_code,active FROM access_cards WHERE card_id = ?',[p.card_id]);
          await execute(connection,'INSERT INTO access_audit (event_id,card_id,door_id,direction,edge_result,shift_code,shift_date,decision,at) VALUES (?,?,?,?,?,?,?,?,?)',
            [stored.insertId,p.card_id,p.door_id,p.direction,p.result,shift.code,shift.date,accessDecision(cards[0] ? {...cards[0],active:Boolean(cards[0].active)} : null,p.result,p.direction,shift),received]);
        }
        await execute(connection,"UPDATE warehouse_stream SET revision = revision + 1 WHERE warehouse_id = 'WH01'");
        return gap ? 'accepted_with_gap' : 'accepted';
      }
      const now=new Date();
      const decision=telemetryDecision(current,candidates.get(m.device_id),m,packet,now.getTime(),retired);
      if (!['accepted','backlog'].includes(decision)) return decision;
      const [duplicates]=await execute(connection,'SELECT id FROM telemetry WHERE device_id = ? AND boot_id = ? AND seq = ?',[m.device_id,m.boot_id,m.seq]);
      if (duplicates.length) return 'duplicate';
      if (decision==='backlog') {
        // History only: current state, alerts and freshness wait for the session to be confirmed again.
        await execute(connection,'INSERT INTO telemetry (device_id,boot_id,seq,received_at,message) VALUES (?,?,?,?,?)',[m.device_id,m.boot_id,m.seq,sqlUtc(now),JSON.stringify(m)]);
        return 'backlog';
      }
      if (current.boot_id && (current.boot_id!==m.boot_id || current.session_id!==m.session_id)) {
        await execute(connection,'UPDATE device_sessions SET retired = TRUE WHERE device_id = ? AND boot_id = ? AND session_id = ?',[m.device_id,current.boot_id,current.session_id]);
      }
      await execute(connection,'INSERT INTO device_sessions (device_id,boot_id,session_id) VALUES (?,?,?) ON DUPLICATE KEY UPDATE retired = retired',[m.device_id,m.boot_id,m.session_id]);
      const json=JSON.stringify(m), received=sqlUtc(now);
      await execute(connection,'INSERT INTO telemetry (device_id,boot_id,seq,received_at,message) VALUES (?,?,?,?,?)',[m.device_id,m.boot_id,m.seq,received,json]);
      await execute(connection,"UPDATE device_current SET boot_id=?,session_id=?,state='online',seq=?,uptime_ms=?,controller_revision=?,message=?,received_at=? WHERE device_id=?",
        [m.boot_id,m.session_id,m.seq,m.uptime_ms,m.payload.controller_revision,json,received,m.device_id]);
      await syncAlerts(connection,m,now);
      await execute(connection,"UPDATE warehouse_stream SET revision = revision + 1 WHERE warehouse_id = 'WH01'");
      return 'accepted';
    });
    // In-memory freshness never advances before the transaction commits.
    if (started!==generation) return result;
    if (result==='status_online') candidates.set(m.device_id,{boot_id:m.boot_id,session_id:m.session_id});
    if (m.kind==='status' && m.payload.state==='offline') {
      if (sessionKey({device_id:m.device_id,...candidates.get(m.device_id)})===key) candidates.delete(m.device_id);
      live.delete(key);
    }
    if (m.kind==='telemetry' && result==='accepted') {
      for (const old of live) if (JSON.parse(old)[0]===m.device_id) live.delete(old);
      live.add(key);
    }
    return result;
  }
  async function snapshot(connections) {
    const snapshot=await transaction(async connection=>{
      const [zones]=await execute(connection,'SELECT z.id,z.name,s.temperature_min,s.temperature_max,s.capacity FROM zones z JOIN zone_settings s ON s.zone_id=z.id ORDER BY z.id');
      const [rows]=await execute(connection,'SELECT * FROM device_current ORDER BY device_id');
      const [stream]=await execute(connection,"SELECT revision FROM warehouse_stream WHERE warehouse_id='WH01'");
      const now=new Date();
      // Active alerts plus those resolved in the last 10 minutes, so an operator sees what just cleared.
      const [alerts]=await execute(connection,"SELECT * FROM alerts WHERE state='active' OR resolved_at >= ? ORDER BY state='active' DESC, raised_at DESC, id DESC LIMIT 50",
        [sqlUtc(new Date(now.getTime()-600000))]);
      // Expired-but-unmarked reservations do not count as reserved.
      const [slots]=await execute(connection,`SELECT s.zone_id,SUM(s.status='occupied') AS occupied,SUM(s.status<>'defrost') AS capacity,COUNT(r.id) AS reserved
        FROM slots s LEFT JOIN reservations r ON r.active_slot=s.id AND r.expires_at > ? GROUP BY s.zone_id`,[sqlUtc(now)]);
      return buildSnapshot(zones,rows,stream[0].revision,now,connections,live,alerts,slots);
    });
    if (!validateSnapshot(snapshot).ok) throw new Error('SNAPSHOT_INVALID');
    return snapshot;
  }
  async function history(query) {
    return transaction(async connection=>{
      const [rows]=await execute(connection,'SELECT id,received_at,message FROM telemetry WHERE device_id = ? AND received_at >= ? AND received_at < ? AND id > ? ORDER BY id LIMIT ?',
        [query.device,query.from,query.to,query.cursor,query.limit+1]);
      if (rows.some(row=>!Number.isSafeInteger(row.id))) throw new Error('CURSOR_OVERFLOW');
      const more=rows.length>query.limit, items=rows.slice(0,query.limit).map(row=>({id:row.id,received_at:new Date(row.received_at).toISOString(),message:row.message}));
      return {schema_version:1,warehouse_id:'WH01',device_id:query.device,items,next_cursor:more ? items.at(-1).id:null};
    });
  }
  async function events(query) {
    return transaction(async connection=>{
      const filters=[],values=[];
      if (query.device) {filters.push('device_id = ?');values.push(query.device);}
      if (query.type) {filters.push('event_type = ?');values.push(query.type);}
      if (query.cursor) {filters.push('id < ?');values.push(query.cursor);}
      const where=filters.length ? `WHERE ${filters.join(' AND ')}`:'';
      const [rows]=await execute(connection,`SELECT id,device_id,received_at,message FROM device_events ${where} ORDER BY id DESC LIMIT ?`,[...values,query.limit+1]);
      const [gaps]=await execute(connection,`SELECT device_id,boot_id,from_seq,to_seq,detected_at FROM event_gaps ${query.device ? 'WHERE device_id = ?':''} ORDER BY id DESC LIMIT 20`,query.device ? [query.device]:[]);
      if (rows.some(row=>!Number.isSafeInteger(row.id))) throw new Error('CURSOR_OVERFLOW');
      const more=rows.length>query.limit, items=rows.slice(0,query.limit).map(eventView);
      return {schema_version:1,warehouse_id:'WH01',items,next_cursor:more ? items.at(-1).id:null,
        gaps:gaps.map(g=>({device_id:g.device_id,boot_id:g.boot_id,from_seq:g.from_seq,to_seq:g.to_seq,detected_at:new Date(g.detected_at).toISOString()}))};
    });
  }
  async function command(request,actor) {
    const commandId=`cmd-${randomUUID()}`, now=Date.now();
    const message=await transaction(async connection=>{
      const [rows]=await execute(connection,'SELECT * FROM device_current WHERE device_id = ? FOR UPDATE',[request.device]);
      const row=rows[0];
      const age=row?.received_at ? now-new Date(row.received_at).getTime() : Infinity;
      // A command targets exactly one live session; after a reboot/reconnect the edge drops it as COMMAND_EXPIRED.
      if (!row || row.state!=='online' || !live.has(sessionKey(row)) || age<0 || age>10000 || row.controller_revision===null)
        return null;
      const device={id:row.device_id,boot_id:row.boot_id,session_id:row.session_id,controller_revision:Number(row.controller_revision)};
      const draft=buildCommand({commandId,seq:1,door:request.door,action:request.action,device,now});
      const [inserted]=await execute(connection,'INSERT INTO door_commands (command_id,device_id,door_id,action,boot_id,session_id,expected_revision,requested_by,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [commandId,device.id,request.door,request.action,device.boot_id,device.session_id,device.controller_revision,actor,sqlUtc(new Date(now)),sqlUtc(new Date(draft.payload.expires_at))]);
      return {...draft,seq:inserted.insertId};
    });
    // An expected business rejection must not enter transaction's DB-failure path and erase every live session.
    if (!message) throw Object.assign(new Error('DEVICE_NOT_LIVE'),{code:'DEVICE_NOT_LIVE'});
    const raw=JSON.stringify(message);
    try {
      if (!publish || !validateMqttMessage(commandTopic(message.device_id),raw).ok) throw new Error('NOT_SENT');
      await publish(commandTopic(message.device_id),raw,{qos:1,retain:false});
    } catch {
      // Never left pending when the broker did not take it; nothing reached the edge.
      await transaction(connection=>execute(connection,"UPDATE door_commands SET status='rejected',reason='NOT_SENT' WHERE command_id=? AND status='pending'",[commandId]));
      return {command_id:commandId,status:'rejected',reason:'NOT_SENT',expires_at:message.payload.expires_at};
    }
    return {command_id:commandId,status:'pending',expires_at:message.payload.expires_at};
  }
  async function getCommand(id) {
    return transaction(async connection=>{
      const [rows]=await execute(connection,'SELECT * FROM door_commands WHERE command_id = ? FOR UPDATE',[id]);
      if (!rows[0]) return null;
      const view=commandView(rows[0],Date.now());
      if (view.status==='expired' && rows[0].status==='pending') await execute(connection,"UPDATE door_commands SET status='expired',reason='COMMAND_EXPIRED' WHERE id=?",[rows[0].id]);
      return view;
    });
  }
  async function ackAlert(id,actor) {
    return transaction(async connection=>{
      const [rows]=await execute(connection,'SELECT * FROM alerts WHERE id = ? FOR UPDATE',[id]);
      const alert=rows[0];
      if (!alert) return null;
      const at=new Date();
      // Acknowledging records who saw it; it never resolves or downgrades the alert.
      await execute(connection,'INSERT INTO alert_acks (alert_id,acknowledged_at,actor,alert_state,alert_level) VALUES (?,?,?,?,?)',[id,sqlUtc(at),actor,alert.state,alert.level]);
      if (alert.acknowledged_at===null) {
        await execute(connection,'UPDATE alerts SET acknowledged_at=?,acknowledged_by=? WHERE id=?',[sqlUtc(at),actor,id]);
        await execute(connection,"UPDATE warehouse_stream SET revision = revision + 1 WHERE warehouse_id = 'WH01'");
        alert.acknowledged_at=at; alert.acknowledged_by=actor;
      }
      return alertView(alert);
    });
  }
  const report=query=>transaction(connection=>runReport(connection,query));
  return {ingest,snapshot,history,events,command,getCommand,ackAlert,report,resetConnection};
}
