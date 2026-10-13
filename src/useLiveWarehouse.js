import {useEffect,useState} from 'react';
import {acceptSnapshot,snapshotToView} from './live-data.js';

export function useLiveWarehouse(enabled) {
  const [state,setState]=useState({data:null,status:'loading',error:''});
  useEffect(()=>{
    if (!enabled) return;
    let stopped=false,socket,retry,heartbeat,previous=null,receivedAt=0;
    const publish=value=>{if(!stopped) setState(value);};
    const unavailable=error=>publish({data:previous ? snapshotToView({...previous,connections:{...previous.connections,broker:'disconnected'},devices:previous.devices.map(d=>({...d,state:d.state==='offline'?'offline':'unknown',freshness:d.last_seen_at?'stale':'unknown'}))}):null,status:'error',error});
    const accept=next=>{
      if(!acceptSnapshot(next,previous)) throw new Error('Dữ liệu backend không đúng hợp đồng hoặc phiên bản cũ.');
      previous=next;receivedAt=Date.now();publish({data:snapshotToView(next),status:'connected',error:''});
    };
    async function connect() {
      if(stopped) return;
      try {
        const response=await fetch('/api/snapshot',{signal:AbortSignal.timeout(5000),cache:'no-store'});
        if(!response.ok) throw new Error('Backend hoặc MySQL chưa sẵn sàng.');
        accept(await response.json());
      } catch(error) {unavailable(error.message);}
      if(stopped) return;
      socket=new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/ws`);
      socket.onopen=()=>socket.send(JSON.stringify({type:'resync'}));
      socket.onmessage=event=>{
        try {const frame=JSON.parse(event.data);if(frame.type!=='snapshot') throw new Error('Dữ liệu backend tạm thời không khả dụng.');accept(frame.data);}
        catch(error) {unavailable(error.message);socket.close();}
      };
      socket.onerror=()=>unavailable('Không kết nối được backend. Đang thử lại…');
      socket.onclose=()=>{if(!stopped){unavailable('Mất kết nối backend. Đang thử lại…');retry=setTimeout(connect,2000);}};
    }
    publish({data:null,status:'loading',error:''});void connect();
    heartbeat=setInterval(()=>{if(receivedAt && Date.now()-receivedAt>5000){unavailable('Chưa nhận được cập nhật backend.');socket?.close();}},1000);
    return ()=>{stopped=true;clearTimeout(retry);clearInterval(heartbeat);socket?.close();};
  },[enabled]);
  return state;
}
