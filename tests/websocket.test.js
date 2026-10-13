import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createServer} from 'node:http';
import WebSocket from 'ws';
import {attachSnapshots} from '../server/websocket.mjs';
test('WebSocket delivers full snapshots/resync; rejects foreign origin and mutation payloads',async t=>{
  const app=createServer(), snapshot={revision:3};let database=true;
  const token='t'.repeat(43);let valid=true;
  const access={session:async value=>valid && value===token ? {username:'viewer',role:'viewer',expires_at:new Date(Date.now()+3600000).toISOString()} : null};
  assert.throws(()=>attachSnapshots(createServer(),async()=>({}),{}),/Access store required/);
  const stop=attachSnapshots(app,async()=>({database,mqtt:true}),{snapshot:async()=>snapshot},access);
  app.listen(0,'127.0.0.1');await once(app,'listening');
  const url=`ws://127.0.0.1:${app.address().port}/ws`;
  const ws=new WebSocket(url,{origin:'http://127.0.0.1:5173',headers:{cookie:`kg_session=${token}`}});
  t.after(async()=>{ws.terminate();await stop();await new Promise(resolve=>app.close(resolve));});
  const [frame]=await once(ws,'message');assert.deepEqual(JSON.parse(frame),{type:'snapshot',data:snapshot});
  const next=once(ws,'message');snapshot.revision=6;ws.send(JSON.stringify({type:'resync'}));
  assert.equal(JSON.parse((await next)[0]).data.revision,6);
  const closed=once(ws,'close');ws.send('{"type":"command"}');assert.equal((await closed)[0],1008);
  const denied=new WebSocket(url,{origin:'http://attacker.example',headers:{cookie:`kg_session=${token}`}});denied.on('error',()=>{});
  const [request,response]=await once(denied,'unexpected-response');assert.equal(response.statusCode,403);request.destroy();denied.terminate();
  for (const cookie of [undefined,'kg_session=forged',`kg_session=${'x'.repeat(43)}`]) {
    const anonymous=new WebSocket(url,{origin:'http://127.0.0.1:5173',headers:cookie ? {cookie}:{}});anonymous.on('error',()=>{});
    const [req2,res2]=await once(anonymous,'unexpected-response');assert.equal(res2.statusCode,401,String(cookie));req2.destroy();anonymous.terminate();
  }
});
