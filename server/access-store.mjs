import { createHash } from 'node:crypto';
import { verifyPassword, newToken, LoginLimiter, SESSION_TTL_MS } from './auth.mjs';
import { sqlUtc } from './telemetry.mjs';
import { registry } from '../contracts/validate.js';

const execute = (pool,sql,values=[]) => pool.execute({sql,timeout:1500},values);
const digest = token => createHash('sha256').update(token).digest('hex');
// A fixed hash keeps the timing of unknown usernames close to wrong passwords.
const DUMMY = 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$' + 'A'.repeat(86);
const iso = value => value ? new Date(value).toISOString() : null;

export function createAccessStore(pool) {
  const limiter=new LoginLimiter();
  const audit=(username,action,detail=null)=>execute(pool,'INSERT INTO auth_audit (username,action,detail,at) VALUES (?,?,?,?)',[username.slice(0,32),action,detail,sqlUtc(new Date())]);
  async function login(username,password) {
    if (typeof username!=='string' || !/^[a-z][a-z0-9_-]{2,31}$/.test(username) || typeof password!=='string' || password.length>128) return {error:'INVALID_CREDENTIALS'};
    if (limiter.blocked(username)) {await audit(username,'login_locked');return {error:'LOGIN_LOCKED'};}
    const [rows]=await execute(pool,'SELECT id,username,role,password_hash,active FROM users WHERE username = ?',[username]);
    const user=rows[0];
    const ok=await verifyPassword(password,user?.password_hash ?? DUMMY) && user?.active;
    if (!ok) {limiter.fail(username);await audit(username,'login_failed');return {error:'INVALID_CREDENTIALS'};}
    limiter.succeed(username);
    const token=newToken(), now=new Date();
    await execute(pool,'INSERT INTO user_sessions (token_hash,user_id,created_at,expires_at) VALUES (?,?,?,?)',[digest(token),user.id,sqlUtc(now),sqlUtc(new Date(now.getTime()+SESSION_TTL_MS))]);
    await audit(username,'login');
    return {token,user:{username:user.username,role:user.role},expires_at:new Date(now.getTime()+SESSION_TTL_MS).toISOString()};
  }
  async function session(token) {
    if (!token) return null;
    const [rows]=await execute(pool,`SELECT u.username,u.role,s.expires_at FROM user_sessions s JOIN users u ON u.id=s.user_id
      WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND u.active`,[digest(token),sqlUtc(new Date())]);
    return rows[0] ? {username:rows[0].username,role:rows[0].role,expires_at:iso(rows[0].expires_at)} : null;
  }
  async function logout(token) {
    const user=await session(token);
    if (!user) return false;
    await execute(pool,'UPDATE user_sessions SET revoked_at = ? WHERE token_hash = ?',[sqlUtc(new Date()),digest(token)]);
    await audit(user.username,'logout');
    return true;
  }
  const denied=(user,detail)=>audit(user?.username ?? 'anonymous','denied',detail.slice(0,64)).catch(()=>{});
  async function accessAudit(limit=50) {
    const [rows]=await execute(pool,`SELECT a.id,a.card_id,c.holder,a.door_id,a.direction,a.edge_result,a.shift_code,a.shift_date,a.decision,a.at
      FROM access_audit a JOIN doors d ON d.id=a.door_id LEFT JOIN access_cards c ON c.card_id=a.card_id WHERE d.zone_id = ? AND a.door_id IN (?, ?) ORDER BY a.id DESC LIMIT ?`,[registry.zones[0],...registry.devices[0].doors,limit]);
    return {items:rows.map(r=>({...r,shift_date:typeof r.shift_date==='string' ? r.shift_date : new Date(r.shift_date).toISOString().slice(0,10),at:iso(r.at)}))};
  }
  async function authAudit(limit=50) {
    const [rows]=await execute(pool,'SELECT id,username,action,detail,at FROM auth_audit ORDER BY id DESC LIMIT ?',[limit]);
    return {items:rows.map(r=>({...r,at:iso(r.at)}))};
  }
  return {login,session,logout,denied,accessAudit,authAudit};
}
