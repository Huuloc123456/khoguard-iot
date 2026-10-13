import { createServer, connect } from 'node:net';
import { once } from 'node:events';

// Fault fixture: only clients using this ephemeral loopback port are disconnected.
export async function gate(targetPort) {
  let blocked=false;
  const sockets=new Set();
  const server=createServer(incoming=>{
    if (blocked) return incoming.destroy();
    const outgoing=connect(targetPort,'127.0.0.1');
    for (const socket of [incoming,outgoing]) {
      sockets.add(socket);
      socket.on('error',()=>{incoming.destroy();outgoing.destroy();});
      socket.on('close',()=>{sockets.delete(socket);incoming.destroy();outgoing.destroy();});
    }
    incoming.pipe(outgoing).pipe(incoming);
  });
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  const setBlocked=value=>{blocked=value;if (value) for (const socket of sockets) socket.destroy();};
  return {port:server.address().port,setBlocked,stop:async()=>{setBlocked(true);await new Promise(resolve=>server.close(resolve));}};
}
