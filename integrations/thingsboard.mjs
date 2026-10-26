import { registry, validateSnapshot } from '../contracts/validate.js';

const signal=value=>value===true?'Có':value===false?'Không':'Chưa rõ';
function deviceView(spec,device,zone,doors,available) {
  const fresh=available && device.freshness==='fresh' && device.state==='online';
  const unknown=available ? (device.freshness==='stale'?'Dữ liệu cũ':'Chưa rõ'):'Nguồn không khả dụng';
  const values={source:spec.source,zone:spec.zone_id,source_available:available,state:available?device.state:'unknown',
    freshness:available?device.freshness:'unknown',last_seen_at:device.last_seen_at??'Chưa rõ',
    temperature_display:unknown,humidity_display:unknown,occupants_display:unknown,presence_display:unknown};
  if(fresh && spec.environment) {
    values.temperature_display=Number.isFinite(zone.environment.temperature_c)?`${zone.environment.temperature_c} °C`:'Chưa rõ';
    values.humidity_display=Number.isFinite(zone.environment.humidity_pct)?`${zone.environment.humidity_pct} %`:'Chưa rõ';
  }
  if(fresh && spec.occupancy) {
    values.occupants_display=zone.occupancy.count_verified && Number.isInteger(zone.occupancy.current_occupants)?String(zone.occupancy.current_occupants):'Chưa xác minh';
    values.presence_display=signal(zone.occupancy.presence);
  }
  for(const id of spec.doors) {
    const d=doors.find(d=>d.id===id);
    values[`${id}_state`]=fresh?d.state:unknown;
    values[`${id}_beam_display`]=fresh?signal(d.beam_clear):unknown;
    values[`${id}_panic_display`]=fresh?signal(d.panic_latched):unknown;
    values[`${id}_inputs_healthy`]=fresh && d.local_inputs_healthy;
  }
  return {values,fresh};
}

export function toThingsBoard(snapshot,now=Date.now()) {
  if(!validateSnapshot(snapshot).ok) throw new Error('INVALID_SNAPSHOT');
  const time=Date.parse(snapshot.generated_at);
  if(now-time>10000 || time-now>1000) throw new Error('SNAPSHOT_EXPIRED');
  const available=snapshot.connections.broker==='connected' && snapshot.connections.database==='connected';
  return Object.fromEntries(registry.devices.map(spec=>{
    const device=snapshot.devices.find(d=>d.id===spec.id),zone=snapshot.zones.find(z=>z.id===spec.zone_id);
    const {values,fresh}=deviceView(spec,device,zone,snapshot.doors,available);
    values.active_alerts=snapshot.alerts.filter(a=>a.zone===spec.zone_id && a.state==='active').length;
    const frames=[{ts:time,values}],measurements={};
    if(fresh && spec.environment) for(const key of ['temperature_c','humidity_pct']) if(Number.isFinite(zone.environment[key])) measurements[key]=zone.environment[key];
    if(fresh && spec.occupancy && zone.occupancy.count_verified && Number.isInteger(zone.occupancy.current_occupants)) measurements.current_occupants=zone.occupancy.current_occupants;
    if(Object.keys(measurements).length) frames.push({ts:Date.parse(device.last_seen_at),values:measurements});
    return [spec.id,frames];
  }));
}

export function unavailableTelemetry(now=Date.now()) {
  return Object.fromEntries(registry.devices.map(spec=>{
    const {values}=deviceView(spec,{last_seen_at:null},{},[],false);
    return [spec.id,[{ts:now,values}]];
  }));
}

// A single warehouse device avoids adding a gateway plus five billable Cloud devices.
export function flattenTelemetry(devices) {
  const frames=new Map();
  for(const [id,samples] of Object.entries(devices))for(const {ts,values} of samples) {
    if(!frames.has(ts))frames.set(ts,{});
    for(const [key,value] of Object.entries(values))frames.get(ts)[`${id.replaceAll('-','_')}_${key}`]=value;
  }
  return [...frames].map(([ts,values])=>({ts,values}));
}

export function cloudTarget(value) {
  const allowed=['https://thingsboard.cloud','https://eu.thingsboard.cloud'];
  if(!allowed.includes(value))throw new Error('INVALID_CLOUD_URL');
  return {url:value,mqtt:{host:`mqtt.${new URL(value).hostname}`,port:8883,protocol:'mqtts',rejectUnauthorized:true,minVersion:'TLSv1.2'}};
}

export function telemetryMessages(devices) {
  return flattenTelemetry(devices).flatMap(({ts,values})=>{
    const entries=Object.entries(values),messages=[];
    // Cloud rejected the 103-key warehouse payload; bounded messages also preserve per-sample timestamps.
    for(let i=0;i<entries.length;i+=50)messages.push({ts,values:Object.fromEntries(entries.slice(i,i+50))});
    return messages;
  });
}
