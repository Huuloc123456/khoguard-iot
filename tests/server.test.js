import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { get } from 'node:http';
import { readConfig } from '../server/config.mjs';
import { createApp } from '../server/http.mjs';
import { databaseReady } from '../server/database.mjs';
import { inventoryMigration, telemetryMigration, eventsMigration, controlMigration, accessMigration, reservationMigration, seedChecksum } from '../db/migrate.mjs';

const env = { DB_HOST:'127.0.0.1', DB_PORT:'3306', DB_NAME:'khoguard_demo', DB_USER:'khoguard_runtime', DB_PASSWORD:'a'.repeat(48), DB_MIGRATION_USER:'khoguard_migrate', DB_MIGRATION_PASSWORD:'b'.repeat(48), MQTT_HOST:'127.0.0.1', MQTT_PORT:'18884', MQTT_USERNAME:'khoguard-backend', MQTT_PASSWORD:'c'.repeat(48) };
test('configuration fails closed without secrets and cannot select another schema/account or LAN bind', () => {
  const config = readConfig(env);
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.port, 3001);
  assert.equal(config.db.user, 'khoguard_runtime');
  assert.equal('migrationPassword' in config.db, false);
  for (const [key,value] of Object.entries({DB_PASSWORD:'', MQTT_PASSWORD:'', DB_NAME:'mysql', DB_USER:'root', HTTP_HOST:'0.0.0.0', HTTP_PORT:'3x', DB_PORT:'65536', MQTT_PORT:'1883', MQTT_HOST:'example.com'})) {
    assert.throws(() => readConfig({...env,[key]:value}), error=>error.code==='CONFIG' && error.message.includes(key));
  }
  assert.equal(readConfig({...env,MQTT_PASSWORD:undefined,DB_PASSWORD:undefined},{migration:true}).db.user,'khoguard_migrate');
  assert.throws(() => readConfig({...env,DB_MIGRATION_PASSWORD:''},{migration:true}), /DB_MIGRATION_PASSWORD/);
});

const TOKENS = { viewer:'v'.repeat(43), operator:'o'.repeat(43), admin:'a'.repeat(43) };
const accessStub = () => ({ session:async token=>{const role=Object.keys(TOKENS).find(r=>TOKENS[r]===token);return role ? {username:role,role,expires_at:'2026-10-13T13:00:00.000Z'} : null;},
  denied:async()=>{}, login:async()=>({error:'INVALID_CREDENTIALS'}), logout:async()=>false, accessAudit:async()=>({items:[]}), authAudit:async()=>({items:[]}) });
const fetchAs = (role,url,init={}) => fetch(url,{...init,headers:{...(init.headers ?? {}),cookie:`kg_session=${TOKENS[role]}`}});
async function withApp(t, readiness, store, access = store ? accessStub() : undefined, reservations) {
  const server = createApp(readiness,store,access,reservations);
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); });
  return `http://127.0.0.1:${server.address().port}`;
}
test('health stays live while readiness reflects dependency loss and recovery', async t => {
  let database = false, mqtt = true;
  const base = await withApp(t, async()=>({database,mqtt}));
  const health = await fetch(`${base}/api/health`);
  assert.equal(health.status,200);
  assert.deepEqual(await health.json(),{status:'ok',service:'khoguard-backend'});
  assert.equal(health.headers.get('cache-control'),'no-store');
  assert.equal(health.headers.get('x-content-type-options'),'nosniff');
  let ready = await fetch(`${base}/api/ready`);
  assert.equal(ready.status,503);
  assert.deepEqual(await ready.json(),{status:'not_ready',dependencies:{database:'unavailable',mqtt:'connected'}});
  database = true;
  ready = await fetch(`${base}/api/ready`);
  assert.equal(ready.status,200);
  mqtt = false;
  assert.equal((await fetch(`${base}/api/ready`)).status,503);
});

test('snapshot/history routes validate queries, bound rows and return 503 without leaking database errors', async t => {
  let database=true;
  const store={snapshot:async()=>({revision:1}),history:async query=>({limit:query.limit,device:query.device}),events:async query=>({limit:query.limit,type:query.type})};
  const base=await withApp(t,async()=>({database,mqtt:true}),store);
  assert.deepEqual(await (await fetchAs('viewer',`${base}/api/snapshot`)).json(),{revision:1});
  const query='device_id=SIM-A01&from=2026-10-13T00:00:00Z&to=2026-10-13T01:00:00Z&limit=2';
  assert.deepEqual(await (await fetchAs('viewer',`${base}/api/telemetry?${query}`)).json(),{limit:2,device:'SIM-A01'});
  assert.deepEqual(await (await fetchAs('viewer',`${base}/api/events?type=rfid&limit=5`)).json(),{limit:5,type:'rfid'});
  for (const path of ['/api/telemetry','/api/snapshot?x=1',`/api/telemetry?${query}&limit=1000`,'/api/events?limit=500','/api/events?zone=C']) assert.equal((await fetchAs('viewer',`${base}${path}`)).status,400);
  database=false;
  assert.equal((await fetchAs('viewer',`${base}/api/snapshot`)).status,503);
  database=true; store.snapshot=async()=>{throw new Error('SELECT secret password');};
  const error=await fetchAs('viewer',`${base}/api/snapshot`);
  assert.equal(error.status,503); assert.deepEqual(await error.json(),{error:{code:'DATA_UNAVAILABLE'}});
});
test('readiness exceptions do not leak credentials and no mutation route is exposed', async t => {
  const base = await withApp(t,async()=>{throw new Error('password=private SQL SELECT');});
  const ready = await fetch(`${base}/api/ready`);
  assert.equal(ready.status,503);
  assert.doesNotMatch(await ready.text(),/password|private|SELECT/);
  assert.equal((await fetch(`${base}/api/health`,{method:'POST',body:'ignored'})).status,405);
  assert.equal((await fetch(`${base}/api/doors/D07/commands`,{method:'POST'})).status,404);
  assert.equal((await fetch(`${base}/api/health?unexpected=1`)).status,400);
  const invalidHostStatus = await new Promise((resolve,reject) => {
    get(`${base}/api/health`,{headers:{host:'attacker.example'}},res=>{res.resume();resolve(res.statusCode);}).on('error',reject);
  });
  assert.equal(invalidHostStatus,400);
});
test('database readiness requires ownership, completed schema and seed; a failed connection is discarded', async () => {
  const state={server_uuid:'server',setup_id:'setup'};
  const row={...state,checksum:inventoryMigration.checksum,seed_checksum:seedChecksum,telemetry_checksum:telemetryMigration.checksum,events_checksum:eventsMigration.checksum,control_checksum:controlMigration.checksum,access_checksum:accessMigration.checksum,reservation_checksum:reservationMigration.checksum};
  let released=0,destroyed=0;
  const connection={query:async()=>[[row]],release:()=>released++,destroy:()=>destroyed++};
  const pool={getConnection:async()=>connection};
  assert.equal(await databaseReady(pool,state),true);
  row.setup_id='another setup';
  assert.equal(await databaseReady(pool,state),false);
  row.setup_id=state.setup_id; row.events_checksum=null;
  assert.equal(await databaseReady(pool,state),false,'M08 event schema is required before ingest');
  row.events_checksum=eventsMigration.checksum; row.control_checksum=null;
  assert.equal(await databaseReady(pool,state),false,'M10/M11 command and alert schema is required');
  row.control_checksum=controlMigration.checksum; row.access_checksum=null;
  assert.equal(await databaseReady(pool,state),false,'M13 account/access schema is required');
  row.access_checksum=accessMigration.checksum; row.reservation_checksum=null;
  assert.equal(await databaseReady(pool,state),false,'M14 slot/reservation schema is required');
  row.reservation_checksum=reservationMigration.checksum; row.checksum=null;
  assert.equal(await databaseReady(pool,state),false);
  connection.query=async()=>{throw new Error('disconnected');};
  assert.equal(await databaseReady(pool,state),false);
  assert.equal(destroyed,1);
  assert.equal(released,8);
});

test('control routes: same-origin JSON only, bounded body, door commands only through a live session', async t => {
  let mqtt=true; const calls=[];
  const store={snapshot:async()=>({}),history:async()=>({}),events:async()=>({}),
    command:async(request,actor)=>{calls.push(['command',request,actor]);if (request.door==='D08') throw Object.assign(new Error('DEVICE_NOT_LIVE'),{code:'DEVICE_NOT_LIVE'});return {command_id:'cmd-1',status:'pending',expires_at:'2026-10-13T05:00:10.000Z'};},
    getCommand:async id=>id==='cmd-1' ? {command_id:'cmd-1',status:'applied'} : null,
    ackAlert:async(id,actor)=>{calls.push(['ack',id,actor]);if (id!==9) return null;return {id:'AL-9',state:'active',acknowledged:true};}};
  const base=await withApp(t,async()=>({database:true,mqtt}),store);
  const post=(path,body,headers={})=>fetchAs('operator',`${base}${path}`,{method:'POST',body,headers:{origin:'http://127.0.0.1:5173','content-type':'application/json',...headers}});
  const created=await post('/api/doors/D07/commands','{"action":"close"}');
  assert.equal(created.status,202);
  assert.deepEqual(await created.json(),{command_id:'cmd-1',status:'pending',expires_at:'2026-10-13T05:00:10.000Z'});
  assert.deepEqual(calls[0],['command',{door:'D07',action:'close',device:'ESP-C01'},'operator']);
  assert.equal((await post('/api/doors/D07/commands','{"action":"close"}',{origin:'http://localhost:5173'})).status,202);
  const expect=async(response,status,code)=>{const r=await response;assert.equal(r.status,status,code);assert.deepEqual(await r.json(),{error:{code}});};
  await expect(post('/api/doors/D07/commands','{"action":"close"}',{origin:'http://evil.example'}),403,'FORBIDDEN_ORIGIN');
  await expect(fetchAs('operator',`${base}/api/doors/D07/commands`,{method:'POST',body:'{"action":"close"}',headers:{'content-type':'application/json'}}),403,'FORBIDDEN_ORIGIN');
  await expect(post('/api/doors/D07/commands','action=close',{'content-type':'application/x-www-form-urlencoded'}),415,'UNSUPPORTED_MEDIA_TYPE');
  await expect(post('/api/doors/D07/commands',JSON.stringify({action:'close',pad:'x'.repeat(600)})),413,'BODY_TOO_LARGE');
  await expect(post('/api/doors/D07/commands','{"action":"unlock"}'),400,'INVALID_COMMAND');
  await expect(post('/api/doors/D01/commands','{"action":"open"}'),409,'NOT_COMMANDABLE');
  await expect(post('/api/doors/D08/commands','{"action":"open"}'),409,'DEVICE_NOT_LIVE');
  await expect(fetchAs('operator',`${base}/api/doors/D07/commands`),405,'METHOD_NOT_ALLOWED');
  mqtt=false;
  await expect(post('/api/doors/D07/commands','{"action":"close"}'),503,'BROKER_UNAVAILABLE');
  assert.equal(calls.filter(c=>c[0]==='command').length,3,'rejected requests never reach the store');
  mqtt=true;
  assert.deepEqual(await (await fetchAs('operator',`${base}/api/commands/cmd-1`)).json(),{command_id:'cmd-1',status:'applied'});
  await expect(fetchAs('operator',`${base}/api/commands/cmd-2`),404,'NOT_FOUND');
  await expect(fetchAs('operator',`${base}/api/commands/bad%20id`),400,'INVALID_REQUEST');
  const acked=await post('/api/alerts/AL-9/ack','{}');
  assert.equal(acked.status,200); assert.deepEqual(await acked.json(),{id:'AL-9',state:'active',acknowledged:true});
  assert.deepEqual(calls.at(-1),['ack',9,'operator']);
  await expect(post('/api/alerts/AL-10/ack','{}'),404,'NOT_FOUND');
  await expect(post('/api/alerts/AL-x/ack','{}'),400,'INVALID_REQUEST');
  await expect(post('/api/alerts/AL-9/ack','{"clear":true}'),400,'INVALID_REQUEST');
});

test('every data route needs a session; roles are enforced by the backend, not the UI', async t => {
  const calls=[];
  const store={snapshot:async()=>({revision:1}),history:async()=>({}),events:async()=>({items:[]}),
    command:async r=>{calls.push(r);return {command_id:'c',status:'pending'};},getCommand:async()=>null,ackAlert:async()=>({id:'AL-1'})};
  const access=accessStub();
  access.login=async(u,p)=>u==='operator' && p==='secret-password' ? {token:TOKENS.operator,user:{username:'operator',role:'operator'},expires_at:'x'} : u==='locked' ? {error:'LOGIN_LOCKED'} : {error:'INVALID_CREDENTIALS'};
  access.logout=async token=>{calls.push(['logout',token]);return true;};
  assert.throws(()=>createApp(async()=>({database:true,mqtt:true}),store),/Access store required/);
  const base=await withApp(t,async()=>({database:true,mqtt:true}),store,access);
  const origin={origin:'http://127.0.0.1:5173','content-type':'application/json'};
  assert.equal((await fetch(`${base}/api/health`)).status,200);
  for (const path of ['/api/snapshot','/api/events','/api/auth/me','/api/access']) {
    const r=await fetch(`${base}${path}`); assert.equal(r.status,401,path); assert.deepEqual(await r.json(),{error:{code:'UNAUTHENTICATED'}});
  }
  assert.equal((await fetch(`${base}/api/snapshot`,{headers:{cookie:'kg_session=forged'}})).status,401);
  assert.equal((await fetchAs('viewer',`${base}/api/snapshot`)).status,200);
  const denied=await fetchAs('viewer',`${base}/api/doors/D07/commands`,{method:'POST',headers:origin,body:'{"action":"open"}'});
  assert.equal(denied.status,403); assert.deepEqual(await denied.json(),{error:{code:'FORBIDDEN_ROLE'}});
  assert.equal((await fetchAs('viewer',`${base}/api/alerts/AL-1/ack`,{method:'POST',headers:origin,body:'{}'})).status,403);
  assert.equal(calls.length,0,'viewer request never reaches the store');
  assert.equal((await fetchAs('viewer',`${base}/api/access`)).status,403);
  assert.equal((await fetchAs('operator',`${base}/api/access`)).status,200);
  assert.equal((await fetchAs('operator',`${base}/api/auth/audit`)).status,403);
  assert.equal((await fetchAs('admin',`${base}/api/auth/audit`)).status,200);
  assert.deepEqual(await (await fetchAs('viewer',`${base}/api/auth/me`)).json(),{user:{username:'viewer',role:'viewer',permissions:['read']},expires_at:'2026-10-13T13:00:00.000Z'});
  const ok=await fetch(`${base}/api/auth/login`,{method:'POST',headers:origin,body:JSON.stringify({username:'operator',password:'secret-password'})});
  assert.equal(ok.status,200);
  assert.match(ok.headers.get('set-cookie'),/^kg_session=o{43}; Path=\/; HttpOnly; SameSite=Strict; Max-Age=28800$/);
  assert.deepEqual((await ok.json()).user,{username:'operator',role:'operator'});
  assert.equal((await fetch(`${base}/api/auth/login`,{method:'POST',headers:origin,body:JSON.stringify({username:'operator',password:'nope'})})).status,401);
  assert.equal((await fetch(`${base}/api/auth/login`,{method:'POST',headers:origin,body:JSON.stringify({username:'locked',password:'x'})})).status,429);
  assert.equal((await fetch(`${base}/api/auth/login`,{method:'POST',headers:origin,body:JSON.stringify({username:'operator',password:'secret-password',role:'admin'})})).status,400);
  assert.equal((await fetch(`${base}/api/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'operator',password:'secret-password'})})).status,403);
  const out=await fetchAs('operator',`${base}/api/auth/logout`,{method:'POST',headers:origin,body:'{}'});
  assert.equal(out.status,200); assert.match(out.headers.get('set-cookie'),/kg_session=; .*Max-Age=0/);
  assert.deepEqual(calls.at(-1),['logout',TOKENS.operator]);
});

test('receiving routes: viewer refused, strict body, rule refusals surface as 409 reason codes', async t => {
  const calls=[];
  const store={snapshot:async()=>({revision:1})};
  const conflict=code=>Object.assign(new Error(code),{code,conflict:true});
  const reservations={list:async()=>({items:[]}),
    admit:async(r,actor)=>{calls.push([r,actor]);if (r.load_kg===4000) throw conflict('NO_SUITABLE_SLOT');if (r.load_kg===999) throw conflict('CAPACITY_LIMIT');
      return {created:r.request_id!=='req-repeat-1',reservation:{id:1,status:'pending'},warning:'NEAR_CAPACITY'};},
    confirm:async id=>{if (id===2) throw conflict('RESERVATION_EXPIRED');return id===1 ? {id:1,status:'confirmed'}:null;},cancel:async()=>({id:1,status:'cancelled'})};
  const base=await withApp(t,async()=>({database:true,mqtt:true}),store,accessStub(),reservations);
  const headers={origin:'http://127.0.0.1:5173','content-type':'application/json'};
  const post=(role,path,body)=>fetchAs(role,`${base}${path}`,{method:'POST',headers,body:typeof body==='string' ? body:JSON.stringify(body)});
  const request={request_id:'req-12345678',temperature_class:'frozen',size_class:1,load_kg:400};
  assert.equal((await fetch(`${base}/api/reservations`)).status,401);
  assert.equal((await fetchAs('viewer',`${base}/api/reservations`)).status,200);
  assert.equal((await post('viewer','/api/admissions',request)).status,403);
  assert.equal((await post('viewer','/api/reservations/1/confirm','{}')).status,403);
  assert.equal(calls.length,0);
  const created=await post('operator','/api/admissions',request);
  assert.equal(created.status,201); assert.equal((await created.json()).warning,'NEAR_CAPACITY');
  assert.equal(calls[0][1],'operator','actor comes from the session, not the body');
  assert.equal((await post('operator','/api/admissions',{...request,request_id:'req-repeat-1'})).status,200,'same request id replays');
  for (const [load,code] of [[4000,'NO_SUITABLE_SLOT'],[999,'CAPACITY_LIMIT']]) {
    const r=await post('operator','/api/admissions',{...request,load_kg:load}); assert.equal(r.status,409); assert.deepEqual(await r.json(),{error:{code}});
  }
  assert.equal((await post('operator','/api/admissions',{...request,requested_by:'admin'})).status,400);
  assert.equal((await post('operator','/api/reservations/1/confirm','{}')).status,200);
  assert.deepEqual(await (await post('operator','/api/reservations/2/confirm','{}')).json(),{error:{code:'RESERVATION_EXPIRED'}});
  assert.equal((await post('operator','/api/reservations/3/confirm','{}')).status,404);
  assert.equal((await post('operator','/api/reservations/0/confirm','{}')).status,400);
  assert.equal((await post('operator','/api/reservations/1/cancel','{"why":1}')).status,400);
});

test('history reports: read for viewers, access log needs access_audit, strict query', async t => {
  const seen=[];
  const store={snapshot:async()=>({}),report:async q=>{seen.push(q);return {kind:q.kind,items:[],next_cursor:null};}};
  const base=await withApp(t,async()=>({database:true,mqtt:true}),store);
  assert.equal((await fetch(`${base}/api/reports/events`)).status,401);
  assert.equal((await fetchAs('viewer',`${base}/api/reports/alerts?zone=C&type=danger`)).status,200);
  assert.deepEqual([seen[0].kind,seen[0].zone,seen[0].type],['alerts','C','danger']);
  assert.equal((await fetchAs('viewer',`${base}/api/reports/access`)).status,403);
  assert.equal((await fetchAs('operator',`${base}/api/reports/access`)).status,200);
  assert.equal((await fetchAs('viewer',`${base}/api/reports/events?zone=Z`)).status,400);
  assert.equal((await fetchAs('viewer',`${base}/api/reports/users`)).status,404);
});
