import {WebSocketServer,WebSocket} from 'ws';
import {sessionToken} from './auth.mjs';
import {LOCAL_ORIGINS} from './http.mjs';
export function attachSnapshots(server,readiness,store,access) {
  if(!access) throw new Error('Access store required for snapshots');
  const ws=new WebSocketServer({noServer:true,maxPayload:1024,perMessageDeflate:false});
  let busy=false,stopped=false;
  const origins=new Set(LOCAL_ORIGINS);
  server.on('upgrade',(request,socket,head)=>{
    const host=request.headers.host;
    if(stopped || request.url!=='/ws' || !origins.has(request.headers.origin) || ![`127.0.0.1:${socket.localPort}`,`localhost:${socket.localPort}`].includes(host) || ws.clients.size>=20) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;
    }
    // M13: the snapshot stream carries the same data as /api/snapshot, so it needs the same session cookie.
    const token=sessionToken(request.headers.cookie);
    access.session(token).then(user=>{
      if(!user || stopped) {socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');return;}
      ws.handleUpgrade(request,socket,head,client=>{client.token=token;client.expiresAt=Date.parse(user.expires_at);ws.emit('connection',client);});
    },()=>socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n'));
  });
  // Logout, password rotation or expiry closes an open stream within 5 s.
  async function recheck() {
    for(const client of ws.clients) {
      const user=Date.now()<client.expiresAt ? await access.session(client.token).catch(()=>undefined) : null;
      if(user===null) client.close(4401,'Session ended');
    }
  }
  const sessions=setInterval(()=>void recheck(),5000);sessions.unref();
  async function broadcast() {
    if(busy || stopped || !ws.clients.size) return;
    busy=true;
    let frame;
    try {
      const dependencies=await readiness();
      if(!dependencies.database) throw new Error('DATABASE_UNAVAILABLE');
      frame={type:'snapshot',data:await store.snapshot(dependencies)};
    } catch {frame={type:'unavailable',error:{code:'DATA_UNAVAILABLE'}};}
    const text=JSON.stringify(frame);
    for(const client of ws.clients) {
      if(client.bufferedAmount>262144) client.close(1013,'Client too slow');
      else if(client.readyState===WebSocket.OPEN) client.send(text);
    }
    busy=false;
  }
  ws.on('connection',client=>{
    client.on('error',()=>{});let lastResync=0;
    client.on('message',(raw,binary)=>{
      if(binary || raw.toString()!=='{"type":"resync"}') {client.close(1008,'Unsupported message');return;}
      if(Date.now()-lastResync<1000) return;
      lastResync=Date.now();void broadcast();
    });
    void broadcast();
  });
  const timer=setInterval(()=>void broadcast(),1000);timer.unref();
  return async()=>{stopped=true;clearInterval(timer);clearInterval(sessions);for(const client of ws.clients) client.terminate();await new Promise(resolve=>ws.close(resolve));};
}
