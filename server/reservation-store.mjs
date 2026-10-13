import { sqlUtc } from './telemetry.mjs';
import { capacityDecision, stagingBlocked, pickSlot, reservationAction, RESERVATION_TTL_MS } from './admission.mjs';

const execute = (connection,sql,values=[]) => connection.execute({sql,timeout:1500},values);
const conflict = code => Object.assign(new Error(code),{code,conflict:true});
const RETRYABLE = new Set(['ER_LOCK_DEADLOCK','ER_LOCK_WAIT_TIMEOUT']);
const iso = value => value ? new Date(value).toISOString() : null;
const view = r => ({id:Number(r.id),request_id:r.request_id,slot_id:r.slot_id,zone_id:r.zone_id ?? r.slot_id.split('-')[0],temperature_class:r.temperature_class,
  size_class:r.size_class,load_kg:r.load_kg,status:r.status,requested_by:r.requested_by,created_at:iso(r.created_at),expires_at:iso(r.expires_at),
  finished_at:iso(r.finished_at),finished_by:r.finished_by});
// Slot counts with pending reservations past expires_at already excluded (they are marked expired first).
const COUNTS = `SELECT s.staging,SUM(s.status='occupied') AS occupied,SUM(s.status<>'defrost') AS capacity,COUNT(r.id) AS reserved
  FROM slots s LEFT JOIN reservations r ON r.active_slot=s.id GROUP BY s.staging`;
const area = rows => staging => {const r=rows.find(x=>Boolean(x.staging)===staging); return {capacity:Number(r?.capacity ?? 0),occupied:Number(r?.occupied ?? 0),reserved:Number(r?.reserved ?? 0)};};

// now() is the backend clock (injectable for boundary checks); the browser clock is never used.
export function createReservationStore(pool,{now=()=>new Date()}={}) {
  async function transaction(work) {
    for (let attempt=1;;attempt++) {
      let connection,deadline;
      try {
        connection=await pool.getConnection();
        deadline=setTimeout(()=>connection.destroy(),5000);
        await connection.query({sql:'SET SESSION innodb_lock_wait_timeout = 2',timeout:1500});
        await connection.beginTransaction();
        // Every admission/transition locks the warehouse capacity row first, then slots in a stable order.
        await execute(connection,"SELECT id FROM warehouses WHERE id = 'WH01' FOR UPDATE");
        const result=await work(connection,now());
        await connection.commit();
        return result;
      } catch(error) {
        await connection?.rollback().catch(()=>{});
        if (error.conflict) throw error;
        connection?.destroy(); connection=null;
        if (!RETRYABLE.has(error.code) || attempt>=3) throw error;
      } finally {clearTimeout(deadline);connection?.release();}
    }
  }
  const expireDue = (connection,at) => execute(connection,"UPDATE reservations SET status='expired',finished_at=expires_at WHERE status='pending' AND expires_at <= ?",[sqlUtc(at)]);
  const bump = connection => execute(connection,"UPDATE warehouse_stream SET revision = revision + 1 WHERE warehouse_id = 'WH01'");

  async function admit(request,actor) {
    return transaction(async(connection,at)=>{
      const [same]=await execute(connection,'SELECT * FROM reservations WHERE request_id = ?',[request.request_id]);
      if (same.length) {
        const r=same[0];
        // Retrying the same request returns the original result; a different body under the same id is refused.
        if (r.temperature_class!==request.temperature_class || r.size_class!==request.size_class || r.load_kg!==request.load_kg) throw conflict('REQUEST_ID_REUSED');
        return {created:false,reservation:view(r)};
      }
      // A refusal rolls back this expiry too; it is re-applied by the next transaction, so nothing is lost.
      await expireDue(connection,at);
      const [rows]=await execute(connection,COUNTS);
      const counts=area(rows);
      if (stagingBlocked(counts(true))) throw conflict('STAGING_BLOCKED');
      const decision=capacityDecision(counts(false));
      if (!decision.ok) throw conflict('CAPACITY_LIMIT');
      const [free]=await execute(connection,`SELECT s.id,s.temperature_class,s.size_class,s.max_load_kg FROM slots s LEFT JOIN reservations r ON r.active_slot=s.id
        WHERE s.status='available' AND NOT s.staging AND s.temperature_class = ? AND r.id IS NULL ORDER BY s.id FOR UPDATE`,[request.temperature_class]);
      const slot=pickSlot(free,request);
      if (!slot) throw conflict('NO_SUITABLE_SLOT');
      const expires=new Date(at.getTime()+RESERVATION_TTL_MS);
      const [inserted]=await execute(connection,`INSERT INTO reservations (request_id,slot_id,temperature_class,size_class,load_kg,status,requested_by,created_at,expires_at)
        VALUES (?,?,?,?,?,'pending',?,?,?)`,[request.request_id,slot.id,request.temperature_class,request.size_class,request.load_kg,actor,sqlUtc(at),sqlUtc(expires)]);
      await bump(connection);
      const [created]=await execute(connection,'SELECT * FROM reservations WHERE id = ?',[inserted.insertId]);
      return {created:true,reservation:view(created[0]),warning:decision.warning};
    });
  }
  async function finish(id,action,actor) {
    return transaction(async(connection,at)=>{
      const [rows]=await execute(connection,'SELECT * FROM reservations WHERE id = ? FOR UPDATE',[id]);
      const r=rows[0];
      if (!r) return null;
      const step=reservationAction(r,action,at);
      if (step.expire) {
        await execute(connection,"UPDATE reservations SET status='expired',finished_at=expires_at WHERE id = ? AND status='pending'",[id]);
        await bump(connection);
        // Commit the expiry, then report the conflict.
        return {code:step.code};
      }
      if (step.code) throw conflict(step.code);
      if (step.next) {
        await execute(connection,'UPDATE reservations SET status=?,finished_at=?,finished_by=? WHERE id = ? AND status=\'pending\'',[step.next,sqlUtc(at),actor,id]);
        // Confirmed = goods put away: the slot becomes occupied, so it is never offered again.
        if (step.next==='confirmed') await execute(connection,"UPDATE slots SET status='occupied',occupancy_source='reservation' WHERE id = ? AND status='available'",[r.slot_id]);
        await bump(connection);
      }
      const [after]=await execute(connection,'SELECT * FROM reservations WHERE id = ?',[id]);
      return {reservation:view(after[0])};
    }).then(result=>{if (result?.code) throw conflict(result.code); return result?.reservation ?? null;});
  }
  async function list(limit=20) {
    return transaction(async(connection,at)=>{
      const [expired]=await expireDue(connection,at);
      if (expired.affectedRows) await bump(connection);
      const [rows]=await execute(connection,COUNTS);
      const [items]=await execute(connection,'SELECT * FROM reservations ORDER BY id DESC LIMIT ?',[limit]);
      const counts=area(rows);
      return {storage:counts(false),staging:counts(true),generated_at:at.toISOString(),items:items.map(view)};
    });
  }
  return {admit,confirm:(id,actor)=>finish(id,'confirm',actor),cancel:(id,actor)=>finish(id,'cancel',actor),list};
}
