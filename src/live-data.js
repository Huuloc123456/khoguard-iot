import {registry,validateSnapshot} from '../contracts/validate.js';
export const reading=value=>value===null || value===undefined ? '—' : value.toLocaleString('vi-VN');
export const signal=(value,yes,no)=>value===null ? 'Chưa xác định' : value ? yes:no;
export const doorLabel=door=>door.open===null ? 'Chưa xác định' : door.state==='opening' ? 'Đang mở ra' : door.state==='closing' ? 'Đang đóng' : door.open ? 'Mở':'Đóng';
export const zoneStatus=zone=>zone.freshness && zone.freshness!=='fresh' ? (zone.freshness==='stale' ? 'Dữ liệu cũ':'Chưa có dữ liệu') : zone.temperature===null ? 'Mất cảm biến' : zone.panic ? 'Khẩn cấp' : zone.temperature<zone.range[0] || zone.temperature>zone.range[1] ? 'Vượt ngưỡng':'Trong ngưỡng';
export function acceptSnapshot(next,previous) {
  return validateSnapshot(next).ok && (!previous || (next.revision>=previous.revision && Date.parse(next.generated_at)>=Date.parse(previous.generated_at)));
}
export function snapshotToView(snapshot) {
  return {mode:'live',scenario:'live',revision:snapshot.revision,generatedAt:snapshot.generated_at,connections:snapshot.connections,devices:snapshot.devices,
    zones:snapshot.zones.map(zone=>{
      const owner=registry.devices.find(d=>d.zone_id===zone.id && d.environment), device=snapshot.devices.find(d=>d.id===owner.id);
      const doors=snapshot.doors.filter(d=>d.zone===zone.id);
      const any=(field,value)=>doors.some(d=>d[field]===value);
      const all=(field,value)=>doors.every(d=>d[field]===value);
      return {...zone,mode:'live',temperature:zone.environment.temperature_c,humidity:zone.environment.humidity_pct,
        people:zone.occupancy.current_occupants,countVerified:zone.occupancy.count_verified,presence:zone.occupancy.presence,
        beam:any('beam_clear',false) ? true:all('beam_clear',true) ? false:null,
        panic:any('panic_latched',true) ? true:all('panic_latched',false) ? false:null,
        inputsHealthy:all('local_inputs_healthy',true),freshness:device.freshness,source:device.source==='wokwi' ? 'Wokwi':'Node mô phỏng',lastSeen:device.last_seen_at};
    }),doors:snapshot.doors.map(d=>({...d,open:d.state==='unknown' ? null:['open','opening'].includes(d.state),seconds:d.open_seconds})),
    alerts:snapshot.alerts.map(a=>({...a,time:new Date(a.raised_at).toLocaleTimeString('vi-VN')})),events:[]};
}
