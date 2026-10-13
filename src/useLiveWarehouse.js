import {useEffect,useState} from 'react';
import {acceptSnapshot,snapshotToView,eventsToView} from './live-data.js';

// onUnauthorized: the cookie session ended (401 on REST, or the stream closed with 4401).
export function useLiveWarehouse(enabled,onUnauthorized=()=>{}) {
  const [state,setState]=useState({data:null,status:'loading',error:''});
  useEffect(()=>{
    if (!enabled) return;
    let stopped=false,socket,retry,heartbeat,previous=null,receivedAt=0,events=[],eventsRevision=null,eventsBusy=false,current={status:'loading',error:''};
    const view=snapshot=>({...snapshotToView(snapshot),events});
    const publish=value=>{if(!stopped) {current=value;setState(value);}};
    // Event log is fetched only when the warehouse revision moves; the snapshot stays the source of state.
    async function loadEvents(revision) {
      if(eventsBusy || revision===eventsRevision) return;
      eventsBusy=true;
      try {
        const response=await fetch('/api/events?limit=50',{signal:AbortSignal.timeout(5000),cache:'no-store'});
        if(!response.ok) return;
        events=eventsToView(await response.json());eventsRevision=revision;
        if(current.data) publish({...current,data:{...current.data,events}});
      } catch {} finally {eventsBusy=false;}
    }
    const unavailable=error=>publish({data:previous ? view({...previous,connections:{...previous.connections,broker:'disconnected'},devices:previous.devices.map(d=>({...d,state:d.state==='offline'?'offline':'unknown',freshness:d.last_seen_at?'stale':'unknown'}))}):null,status:'error',error});
    const accept=next=>{
      if(!acceptSnapshot(next,previous)) throw new Error('Dữ liệu backend không đúng hợp đồng hoặc phiên bản cũ.');
      previous=next;receivedAt=Date.now();publish({data:view(next),status:'connected',error:''});void loadEvents(next.revision);
    };
    async function connect() {
      if(stopped) return;
      try {
        const response=await fetch('/api/snapshot',{signal:AbortSignal.timeout(5000),cache:'no-store'});
        if(response.status===401) {stopped=true;onUnauthorized();return;}
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
      socket.onclose=event=>{if(event.code===4401) {stopped=true;onUnauthorized();return;}
        if(!stopped){unavailable('Mất kết nối backend. Đang thử lại…');retry=setTimeout(connect,2000);}};
    }
    publish({data:null,status:'loading',error:''});void connect();
    heartbeat=setInterval(()=>{if(receivedAt && Date.now()-receivedAt>5000){unavailable('Chưa nhận được cập nhật backend.');socket?.close();}},1000);
    return ()=>{stopped=true;clearTimeout(retry);clearInterval(heartbeat);socket?.close();};
  },[enabled,onUnauthorized]);
  return state;
}
