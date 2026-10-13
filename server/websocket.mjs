import {WebSocketServer,WebSocket} from 'ws';
export function attachSnapshots(server,readiness,store) {
  const ws=new WebSocketServer({noServer:true,maxPayload:1024,perMessageDeflate:false});
  let busy=false,stopped=false;
  const origins=new Set(['http://127.0.0.1:5173','http://localhost:5173']);
  server.on('upgrade',(request,socket,head)=>{
    const host=request.headers.host;
    if(stopped || request.url!=='/ws' || !origins.has(request.headers.origin) || ![`127.0.0.1:${socket.localPort}`,`localhost:${socket.localPort}`].includes(host) || ws.clients.size>=20) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;
    }
    ws.handleUpgrade(request,socket,head,client=>ws.emit('connection',client));
  });
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
  return async()=>{stopped=true;clearInterval(timer);for(const client of ws.clients) client.terminate();await new Promise(resolve=>ws.close(resolve));};
}
