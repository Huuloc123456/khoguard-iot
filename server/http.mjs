import { createServer } from 'node:http';

export function createApp(readiness) {
  const server = createServer({ maxHeaderSize:8192, requestTimeout:5000, headersTimeout:5000, keepAliveTimeout:1000 }, async (req,res) => {
    const send = (status,body,headers={}) => {
      res.writeHead(status, { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store',
        'x-content-type-options':'nosniff', 'x-frame-options':'DENY', 'content-security-policy':"default-src 'none'", ...headers });
      res.end(JSON.stringify(body));
    };
    const error = (status,code) => send(status,{error:{code}},{connection:'close'});
    if (![ `127.0.0.1:${req.socket.localPort}`, `localhost:${req.socket.localPort}` ].includes(req.headers.host)) return error(400,'INVALID_HOST');
    if (req.url.includes('?') || req.url.includes('#')) return error(400,'INVALID_REQUEST');
    if (!['/api/health','/api/ready'].includes(req.url)) return error(404,'NOT_FOUND');
    if (req.method !== 'GET') return send(405,{error:{code:'METHOD_NOT_ALLOWED'}},{allow:'GET',connection:'close'});
    if (req.headers['transfer-encoding'] || (req.headers['content-length'] && req.headers['content-length'] !== '0')) return error(400,'UNEXPECTED_BODY');
    if (req.url === '/api/health') return send(200,{status:'ok',service:'khoguard-backend'});
    let dependencies;
    try { dependencies = await readiness(); }
    catch { dependencies = {database:false,mqtt:false}; }
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
