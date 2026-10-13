import { createServer } from 'node:http';
import { parseHistoryQuery } from './telemetry.mjs';

export function createApp(readiness,store) {
  const server = createServer({ maxHeaderSize:8192, requestTimeout:5000, headersTimeout:5000, keepAliveTimeout:1000 }, async (req,res) => {
    const send = (status,body,headers={}) => {
      res.writeHead(status, { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store',
        'x-content-type-options':'nosniff', 'x-frame-options':'DENY', 'content-security-policy':"default-src 'none'", ...headers });
      res.end(JSON.stringify(body));
    };
    const error = (status,code) => send(status,{error:{code}},{connection:'close'});
    if (![ `127.0.0.1:${req.socket.localPort}`, `localhost:${req.socket.localPort}` ].includes(req.headers.host)) return error(400,'INVALID_HOST');
    if (req.url.length>2048 || !req.url.startsWith('/') || req.url.startsWith('//') || req.url.includes('#')) return error(400,'INVALID_REQUEST');
    const url=new URL(req.url,'http://127.0.0.1');
    if (url.pathname!=='/api/telemetry' && url.search) return error(400,'INVALID_REQUEST');
    const routes=store ? ['/api/health','/api/ready','/api/snapshot','/api/telemetry'] : ['/api/health','/api/ready'];
    if (!routes.includes(url.pathname)) return error(404,'NOT_FOUND');
    if (req.method !== 'GET') return send(405,{error:{code:'METHOD_NOT_ALLOWED'}},{allow:'GET',connection:'close'});
    if (req.headers['transfer-encoding'] || (req.headers['content-length'] && req.headers['content-length'] !== '0')) return error(400,'UNEXPECTED_BODY');
    if (url.pathname === '/api/health') return send(200,{status:'ok',service:'khoguard-backend'});
    let query;
    if (url.pathname==='/api/telemetry') {
      try {query=parseHistoryQuery(url.searchParams);} catch {return error(400,'INVALID_QUERY');}
    }
    let dependencies;
    try { dependencies = await readiness(); }
    catch { dependencies = {database:false,mqtt:false}; }
    if (['/api/snapshot','/api/telemetry'].includes(url.pathname)) {
      if (dependencies.database!==true) return error(503,'DATA_UNAVAILABLE');
      try {return send(200,url.pathname==='/api/snapshot' ? await store.snapshot(dependencies) : await store.history(query));}
      catch {return error(503,'DATA_UNAVAILABLE');}
    }
    const ready = dependencies.database === true && dependencies.mqtt === true;
    send(ready ? 200 : 503,{status:ready ? 'ready' : 'not_ready', dependencies:{
      database:dependencies.database === true ? 'ready' : 'unavailable',
      mqtt:dependencies.mqtt === true ? 'connected' : 'disconnected',
    }});
  });
  server.setTimeout(10000, socket=>socket.destroy());
  server.maxRequestsPerSocket = 100;
  return server;
}
