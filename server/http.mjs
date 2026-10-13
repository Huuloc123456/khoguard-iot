import { createServer } from 'node:http';
import { parseHistoryQuery } from './telemetry.mjs';
import { parseEventsQuery } from './events.mjs';
import { parseCommandRequest } from './commands.mjs';
import { parseAdmission } from './admission.mjs';
import { parseReportQuery } from './reports.mjs';
import { allowed, permissionsOf, sessionToken, sessionCookie, clearedCookie } from './auth.mjs';

// Defence in depth with the SameSite=Strict session cookie: every POST must come from the local dashboard origin.
export const LOCAL_ORIGINS = ['http://127.0.0.1:5173','http://localhost:5173','http://127.0.0.1:4173','http://localhost:4173'];
const MAX_BODY = 512;
const fail = (status,code) => { throw Object.assign(new Error(code),{status,code}); };
function readBody(req) {
  return new Promise((resolve,reject)=>{
    let size=0; const chunks=[];
    req.on('data',chunk=>{size+=chunk.length; if (size>MAX_BODY) {reject(Object.assign(new Error('BODY_TOO_LARGE'),{status:413,code:'BODY_TOO_LARGE'}));req.destroy();} else chunks.push(chunk);});
    req.on('end',()=>resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error',reject);
  });
}
const jsonObject = (raw,keys) => {
  let body;
  try {body=JSON.parse(raw);} catch {fail(400,'INVALID_REQUEST');}
  if (!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).sort().join()!==[...keys].sort().join()) fail(400,'INVALID_REQUEST');
  return body;
};
const reportQuery = (kind,params) => { try {return parseReportQuery(kind,params);} catch {fail(400,'INVALID_QUERY');} };
const alertId = id => { const m=/^AL-([1-9]\d{0,15})$/.exec(id); if (!m || !Number.isSafeInteger(Number(m[1]))) fail(400,'INVALID_REQUEST'); return Number(m[1]); };

// auth: 'public' needs nothing; otherwise a live session whose role has `permission`.
const ROUTES = [
  {method:'GET',path:'/api/health',auth:'public',run:()=>[200,{status:'ok',service:'khoguard-backend'}]},
  {method:'GET',path:'/api/ready',auth:'public',ready:true},
  {method:'POST',path:'/api/auth/login',auth:'public',db:true,run:async({body,access})=>{
    const {username,password}=jsonObject(body,['username','password']);
    const result=await access.login(username,password);
    if (result.error==='LOGIN_LOCKED') fail(429,'LOGIN_LOCKED');
    if (result.error) fail(401,'INVALID_CREDENTIALS');
    return [200,{user:result.user,expires_at:result.expires_at},{'set-cookie':sessionCookie(result.token)}];
  }},
  {method:'POST',path:'/api/auth/logout',auth:'public',db:true,run:async({req,access})=>{
    await access.logout(sessionToken(req.headers.cookie));
    return [200,{ok:true},{'set-cookie':clearedCookie()}];
  }},
  {method:'GET',path:'/api/auth/me',permission:'read',run:({user})=>[200,{user:{username:user.username,role:user.role,permissions:permissionsOf(user.role)},expires_at:user.expires_at}]},
  {method:'GET',path:'/api/auth/audit',permission:'auth_audit',db:true,run:async({access})=>[200,await access.authAudit()]},
  {method:'GET',path:'/api/access',permission:'access_audit',db:true,run:async({access})=>[200,await access.accessAudit()]},
  {method:'GET',path:'/api/snapshot',permission:'read',db:true,run:async({store,dependencies})=>[200,await store.snapshot(dependencies)]},
  {method:'GET',path:'/api/telemetry',permission:'read',db:true,query:parseHistoryQuery,run:async({store,query})=>[200,await store.history(query)]},
  {method:'GET',path:'/api/events',permission:'read',db:true,query:parseEventsQuery,run:async({store,query})=>[200,await store.events(query)]},
  {method:'POST',path:/^\/api\/doors\/(D\d{2})\/commands$/,permission:'command',db:true,mqtt:true,run:async({store,params,body,user})=>{
    let request;
    try {request=parseCommandRequest(params[0],body);} catch(e) {fail(e.code==='NOT_COMMANDABLE' ? 409:400,e.code==='NOT_COMMANDABLE' ? 'NOT_COMMANDABLE':'INVALID_COMMAND');}
    return [202,await store.command(request,user.username)];
  }},
  {method:'GET',path:/^\/api\/commands\/([^/]{1,100})$/,permission:'read',db:true,run:async({store,params})=>{
    if (!/^[A-Za-z0-9:_-]{1,64}$/.test(params[0])) fail(400,'INVALID_REQUEST');
    const result=await store.getCommand(params[0]); if (!result) fail(404,'NOT_FOUND'); return [200,result];
  }},
  {method:'POST',path:/^\/api\/alerts\/([^/]{1,40})\/ack$/,permission:'ack_alert',db:true,run:async({store,params,body,user})=>{
    const id=alertId(params[0]); jsonObject(body,[]);
    const result=await store.ackAlert(id,user.username); if (!result) fail(404,'NOT_FOUND'); return [200,result];
  }},
  // M15 history; the access log keeps its stricter permission.
  {method:'GET',path:/^\/api\/reports\/(events|alerts|commands|reservations)$/,permission:'read',db:true,query:p=>p,run:async({store,params,query})=>[200,await store.report(reportQuery(params[0],query))]},
  {method:'GET',path:/^\/api\/reports\/(access)$/,permission:'access_audit',db:true,query:p=>p,run:async({store,params,query})=>[200,await store.report(reportQuery(params[0],query))]},
  {method:'GET',path:'/api/reservations',permission:'read',db:true,reservations:true,run:async({reservations})=>[200,await reservations.list()]},
  {method:'POST',path:'/api/admissions',permission:'reserve',db:true,reservations:true,run:async({reservations,body,user})=>{
    let request;
    try {request=parseAdmission(body);} catch {fail(400,'INVALID_ADMISSION');}
    const result=await reservations.admit(request,user.username);
    return [result.created ? 201:200,{reservation:result.reservation,warning:result.warning ?? null}];
  }},
  {method:'POST',path:/^\/api\/reservations\/([^/]{1,24})\/(confirm|cancel)$/,permission:'reserve',db:true,reservations:true,run:async({reservations,params,body,user})=>{
    if (!/^[1-9]\d{0,15}$/.test(params[0]) || !Number.isSafeInteger(Number(params[0]))) fail(400,'INVALID_REQUEST');
    jsonObject(body,[]);
    const result=await reservations[params[1]](Number(params[0]),user.username);
    if (!result) fail(404,'NOT_FOUND');
    return [200,{reservation:result}];
  }},
];
const match = (route,path) => typeof route.path==='string' ? (route.path===path ? [] : null) : route.path.exec(path)?.slice(1) ?? null;

export function createApp(readiness,store,access,reservations) {
  // Fail closed: a data store without the access layer would expose every route without login.
  if (store && !access) throw new Error('Access store required with data routes');
  const routes = (store ? ROUTES : ROUTES.filter(r=>r.auth==='public' && !r.db)).filter(r=>!r.reservations || reservations);
  const server = createServer({ maxHeaderSize:8192, requestTimeout:5000, headersTimeout:5000, keepAliveTimeout:1000 }, async (req,res) => {
    const send = (status,body,headers={}) => {
      res.writeHead(status, { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store',
        'x-content-type-options':'nosniff', 'x-frame-options':'DENY', 'content-security-policy':"default-src 'none'", ...headers });
      res.end(JSON.stringify(body));
    };
    const error = (status,code,headers={}) => send(status,{error:{code}},{connection:'close',...headers});
    if (![ `127.0.0.1:${req.socket.localPort}`, `localhost:${req.socket.localPort}` ].includes(req.headers.host)) return error(400,'INVALID_HOST');
    if (req.url.length>2048 || !req.url.startsWith('/') || req.url.startsWith('//') || req.url.includes('#')) return error(400,'INVALID_REQUEST');
    const url=new URL(req.url,'http://127.0.0.1');
    const candidates=routes.map(route=>({route,params:match(route,url.pathname)})).filter(c=>c.params);
    if (!candidates.length) return error(404,'NOT_FOUND');
    const hit=candidates.find(c=>c.route.method===req.method);
    if (!hit) return error(405,'METHOD_NOT_ALLOWED',{allow:candidates.map(c=>c.route.method).join(', ')});
    const {route,params}=hit;
    let user=null;
    try {
      if (url.search && !route.query) fail(400,'INVALID_REQUEST');
      let body='';
      if (req.method==='POST') {
        // Browsers always send Origin on POST from a page; a missing Origin is refused too (no CSRF via forms/tools).
        if (!LOCAL_ORIGINS.includes(req.headers.origin)) fail(403,'FORBIDDEN_ORIGIN');
        if (!/^application\/json(\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type'] ?? '')) fail(415,'UNSUPPORTED_MEDIA_TYPE');
        if (Number(req.headers['content-length'] ?? 0)>MAX_BODY) fail(413,'BODY_TOO_LARGE');
        body=await readBody(req);
      } else if (req.headers['transfer-encoding'] || (req.headers['content-length'] && req.headers['content-length'] !== '0')) fail(400,'UNEXPECTED_BODY');
      let query;
      if (route.query) {try {query=route.query(url.searchParams);} catch {fail(400,'INVALID_QUERY');}}
      let dependencies={database:false,mqtt:false};
      if (route.ready || route.db || route.auth!=='public') {try {dependencies=await readiness();} catch {}}
      if (route.ready) {
        const ready=dependencies.database===true && dependencies.mqtt===true;
        return send(ready ? 200:503,{status:ready ? 'ready':'not_ready',dependencies:{database:dependencies.database===true ? 'ready':'unavailable',mqtt:dependencies.mqtt===true ? 'connected':'disconnected'}});
      }
      if ((route.db || route.auth!=='public') && dependencies.database!==true) fail(503,'DATA_UNAVAILABLE');
      if (route.auth!=='public') {
        user=await access.session(sessionToken(req.headers.cookie));
        if (!user) fail(401,'UNAUTHENTICATED');
        if (!allowed(user.role,route.permission)) {void access.denied(user,`${req.method} ${url.pathname}`);fail(403,'FORBIDDEN_ROLE');}
      }
      if (route.mqtt && dependencies.mqtt!==true) fail(503,'BROKER_UNAVAILABLE');
      const [status,result,headers={}]=await route.run({req,body,params,query,user,dependencies,store,access,reservations});
      return send(status,result,headers);
    } catch(e) {
      if (e.status) return error(e.status,e.code,e.status===401 ? {'set-cookie':clearedCookie()} : {});
      if (e.code==='DEVICE_NOT_LIVE') return error(409,'DEVICE_NOT_LIVE');
      if (e.code && /^[A-Z_]+$/.test(e.code) && e.conflict) return error(409,e.code);
      return error(503,'DATA_UNAVAILABLE');
    }
  });
  server.setTimeout(10000, socket=>socket.destroy());
  server.maxRequestsPerSocket = 100;
  return server;
}
