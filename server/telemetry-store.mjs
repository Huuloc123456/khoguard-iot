import { validateMqttMessage, validateSnapshot } from '../contracts/validate.js';
import { telemetryDecision, sessionKey, sqlUtc, buildSnapshot } from './telemetry.mjs';

const execute = (connection,sql,values=[]) => connection.execute({sql,timeout:1500},values);

export function createTelemetryStore(pool) {
  const candidates=new Map(), live=new Set();
  let generation=0;
  const resetConnection=()=>{generation++;candidates.clear();live.clear();};
  async function transaction(work) {
    const connection=await pool.getConnection();
    // Includes pool commands/commit in the deadline; a destroyed connection rolls back on MySQL.
    const deadline=setTimeout(()=>connection.destroy(),5000);
    try {
      await connection.query({sql:'SET SESSION innodb_lock_wait_timeout = 1',timeout:1500});
      await connection.beginTransaction();
      const result=await work(connection);
      await connection.commit();
      return result;
    } catch(error) {
      await connection.rollback().catch(()=>{});
      connection.destroy();
      resetConnection();
      throw error;
    } finally {clearTimeout(deadline);connection.release();}
  }
  async function ingest(packet) {
    const started=generation;
    const validated=validateMqttMessage(packet.topic,packet.payload);
    if (!validated.ok) return validated.error.code;
    const m=validated.value;
    if (!['status','telemetry'].includes(m.kind)) return 'unsupported_kind';
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
        await execute(connection,'INSERT INTO device_sessions (device_id,boot_id,session_id,retired) VALUES (?,?,?,TRUE) ON DUPLICATE KEY UPDATE retired = TRUE',[m.device_id,m.boot_id,m.session_id]);
        if (current.boot_id!==m.boot_id || current.session_id!==m.session_id) return 'old_status';
        if (current.state!=='offline') {
          await execute(connection,"UPDATE device_current SET state = 'offline' WHERE device_id = ?",[m.device_id]);
          await execute(connection,"UPDATE warehouse_stream SET revision = revision + 1 WHERE warehouse_id = 'WH01'");
        }
        return 'status_offline';
      }
      const now=new Date();
      const decision=telemetryDecision(current,candidates.get(m.device_id),m,packet,now.getTime(),retired);
      if (decision!=='accepted') return decision;
      const [duplicates]=await execute(connection,'SELECT id FROM telemetry WHERE device_id = ? AND boot_id = ? AND seq = ?',[m.device_id,m.boot_id,m.seq]);
      if (duplicates.length) return 'duplicate';
      if (current.boot_id && (current.boot_id!==m.boot_id || current.session_id!==m.session_id)) {
        await execute(connection,'UPDATE device_sessions SET retired = TRUE WHERE device_id = ? AND boot_id = ? AND session_id = ?',[m.device_id,current.boot_id,current.session_id]);
      }
      await execute(connection,'INSERT INTO device_sessions (device_id,boot_id,session_id) VALUES (?,?,?) ON DUPLICATE KEY UPDATE retired = retired',[m.device_id,m.boot_id,m.session_id]);
      const json=JSON.stringify(m), received=sqlUtc(now);
      await execute(connection,'INSERT INTO telemetry (device_id,boot_id,seq,received_at,message) VALUES (?,?,?,?,?)',[m.device_id,m.boot_id,m.seq,received,json]);
      await execute(connection,"UPDATE device_current SET boot_id=?,session_id=?,state='online',seq=?,uptime_ms=?,controller_revision=?,message=?,received_at=? WHERE device_id=?",
        [m.boot_id,m.session_id,m.seq,m.uptime_ms,m.payload.controller_revision,json,received,m.device_id]);
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
    if (result==='accepted') {
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
      return buildSnapshot(zones,rows,stream[0].revision,new Date(),connections,live);
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
  return {ingest,snapshot,history,resetConnection};
}
