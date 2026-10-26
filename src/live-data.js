import {registry,validateSnapshot} from '../contracts/validate.js';
const clock=at=>new Date(at).toLocaleTimeString('vi-VN',{timeZone:'Asia/Bangkok',hour12:false});
export const reading=value=>value===null || value===undefined ? '—' : value.toLocaleString('vi-VN');
export const signal=(value,yes,no)=>value===null ? 'Chưa xác định' : value ? yes:no;
export const doorLabel=door=>door.open===null ? 'Chưa xác định' : door.state==='opening' ? 'Đang mở ra' : door.state==='closing' ? 'Đang đóng' : door.open ? 'Mở':'Đóng';
export const zoneStatus=zone=>zone.freshness && zone.freshness!=='fresh' ? (zone.freshness==='stale' ? 'Dữ liệu cũ':'Chưa có dữ liệu') : zone.temperature===null ? 'Mất cảm biến' : zone.panic ? 'Khẩn cấp' : zone.temperature<zone.range[0] || zone.temperature>zone.range[1] ? 'Vượt ngưỡng':'Trong ngưỡng';
export const lockLabel=door=>door.locked===null || door.locked===undefined ? 'Chưa xác định' : door.locked ? 'Đã khóa':'Không khóa';
// Acknowledged or resolved alerts no longer need attention; acknowledgement never resolves the condition.
export const needsAttention=alert=>alert.state!=='resolved' && !alert.acknowledged;
export const REASONS={OCCUPIED:'RFID còn người trong kho',PRESENCE_DETECTED:'PIR còn phát hiện người trong kho',BEAM_BLOCKED:'cảm biến vật cản siêu âm đang bị chắn',
  PANIC_ACTIVE:'nút khẩn cấp đang chốt hoặc chưa nhả',INPUT_UNKNOWN:'tín hiệu cửa/cảm biến chưa xác định hoặc số người chưa xác minh',
  INTERLOCK_ACTIVE:'liên động hai cửa, cửa còn lại chưa đóng',STALE_DATA:'dữ liệu đã cũ',REVISION_MISMATCH:'trạng thái thiết bị vừa thay đổi, hãy xem lại rồi gửi lại',
  COMMAND_EXPIRED:'lệnh hết hạn hoặc thiết bị đã khởi động/kết nối lại',NOT_AUTHORIZED:'không có quyền',LOCAL_INPUT_FAILURE:'lỗi input tại chỗ',NOT_SENT:'broker không nhận lệnh, thiết bị chưa nhận được'};
const REQUEST_ERRORS={DEVICE_NOT_LIVE:'ESP-C01 chưa trực tuyến hoặc dữ liệu đã cũ; không gửi lệnh.',BROKER_UNAVAILABLE:'Backend mất kết nối MQTT; không gửi lệnh.',
  FORBIDDEN_ORIGIN:'Trang không được phép gửi lệnh.',FORBIDDEN_ROLE:'Tài khoản này chỉ được xem, không gửi lệnh.',UNAUTHENTICATED:'Phiên đăng nhập đã hết; hãy đăng nhập lại.',NOT_COMMANDABLE:'Cửa này thuộc thiết bị mô phỏng, không có bộ điều khiển.'};
export function commandText(c) {
  if (c.error) return REQUEST_ERRORS[c.error] ?? 'Không gửi được lệnh; backend chưa sẵn sàng.';
  const reason=REASONS[c.reason] ?? c.reason ?? '';
  if (c.status==='pending') return 'Đang chờ ESP-C01 xác nhận…';
  if (c.status==='applied') return 'Đã áp dụng tại thiết bị; trạng thái cửa cập nhật theo telemetry.';
  if (c.status==='rejected') return `Bị từ chối: ${reason}`;
  return `Hết hạn: ${reason}${c.late_ack ? ` (phản hồi muộn: ${c.late_ack})`:''}`;
}
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
    }),doors:snapshot.doors.map(d=>{
      const owner=registry.devices.find(device=>device.doors.includes(d.id));
      return {...d,deviceId:owner.id,source:owner.source==='wokwi' ? 'Wokwi':'Node mô phỏng',open:d.state==='unknown' ? null:['open','opening'].includes(d.state),seconds:d.open_seconds};
    }),
    alerts:snapshot.alerts.map(a=>({...a,time:clock(a.raised_at),resolvedTime:a.resolved_at ? clock(a.resolved_at):null})),events:[]};
}
const source=id=>registry.devices.find(d=>d.id===id)?.source==='wokwi' ? 'Wokwi':'Node mô phỏng';
function eventRow(e) {
  const where=`${e.device_id} · ${source(e.device_id)}`;
  if(e.event_type==='rfid') {
    const way=e.direction==='in' ? 'vào':'ra';
    const [title,detail]={accepted:[`Thẻ ${e.card_id} ${way} cửa ${e.door_id}`,`Số người cập nhật tại thiết bị · ${where}`],
      duplicate:[`Thẻ ${e.card_id} đọc lặp (${way}) tại ${e.door_id}`,`Không tính thêm người · ${where}`],
      unauthorized:[`Thẻ ${e.card_id} bị từ chối tại ${e.door_id}`,`Không có trong danh sách cho phép; không chặn thoát hiểm · ${where}`]}[e.result];
    return {title,detail,type:'Ra / vào'};
  }
  if(e.event_type==='panic') return {title:`Nút khẩn cấp cửa ${e.door_id}`,detail:`Đã chốt tại thiết bị · ${where}`,type:'Cảnh báo'};
  if(e.event_type==='door') return {title:`Cửa ${e.door_id} ${e.state==='open'?'mở':e.state==='closed'?'đóng':'chưa xác định'}`,detail:where,type:'Cửa'};
  return {title:`Lệnh cửa ${e.door_id} bị từ chối`,detail:`${e.reason ?? ''} · ${where}`,type:'Cửa'};
}
export function eventsToView(page) {
  const gaps=page.gaps.map(g=>({at:g.detected_at,time:clock(g.detected_at),title:`Mất ${g.to_seq-g.from_seq+1} sự kiện từ ${g.device_id}`,
    zone:`Khu ${registry.devices.find(d=>d.id===g.device_id)?.zone_id ?? '?'}`,type:'Cảnh báo',detail:`Sequence ${g.from_seq}–${g.to_seq} không tới backend; nhật ký không đầy đủ`}));
  const items=page.items.map(e=>({at:e.received_at,time:clock(e.received_at),zone:`Khu ${e.zone}`,...eventRow(e)}));
  // Gaps sit at the time they were detected, so repeated runs do not bury the newest events.
  return [...gaps,...items].sort((x,y)=>Date.parse(y.at)-Date.parse(x.at)).map(({at,...row})=>row);
}
// UI only hides what the role cannot do; the backend still refuses it (403).
export const can=(user,permission)=>Boolean(user?.permissions?.includes(permission));
const DECISIONS={in_shift:['Đúng ca','success',''],out_of_shift:['Ngoài ca','warning','Vẫn mở cửa, vẫn tính người; chỉ ghi nhận để kiểm tra.'],
  exit:['Ra','neutral','Ra luôn được phép, không xét ca.'],duplicate:['Đọc lặp','neutral','Thiết bị không tính thêm người.'],
  unknown_card:['Thẻ chưa đăng ký ca','warning','Thiết bị đã cho vào; cần kiểm tra danh sách thẻ.'],revoked_card:['Thẻ đã thu hồi','warning','Thiết bị đã cho vào; cần cập nhật danh sách tại thiết bị.'],
  edge_rejected:['Thiết bị từ chối','warning','Không có trong danh sách tại thiết bị; không chặn thoát hiểm.']};
export function accessToView(page) {
  return page.items.map(r=>{
    const [label,tone,note]=DECISIONS[r.decision] ?? [r.decision,'neutral',''];
    const [, m, d]=r.shift_date.split('-');
    return {id:r.id,time:clock(r.at),card:r.card_id,holder:r.holder ?? 'Chưa đăng ký',door:r.door_id,way:r.direction==='in'?'Vào':'Ra',
      shift:`${r.shift_code==='DAY'?'Ca ngày':'Ca đêm'} ${d}/${m}`,label,tone,note};
  });
}
// Receiving (M14): the backend decides; this only describes. Percent is truncated to one decimal so 94.99% never shows as 95%.
export function areaView({capacity,occupied,reserved}) {
  const used=occupied+reserved;
  const level=capacity<=0 || used*100>=95*capacity ? 'danger' : used*100>=85*capacity ? 'warning' : 'normal';
  const tenths=capacity>0 ? Math.floor(used*1000/capacity) : 0;
  return {capacity,occupied,reserved,used,level,percent:`${(tenths/10).toLocaleString('vi-VN',{minimumFractionDigits:1,maximumFractionDigits:1})}%`};
}
const ADMISSION_TEXT={CAPACITY_LIMIT:'Từ chối: kho lưu trữ sẽ vượt ngưỡng 95% (tính cả hàng đang giữ chỗ).',
  NO_SUITABLE_SLOT:'Từ chối: không còn vị trí phù hợp nhiệt độ, kích thước và tải trọng.',STAGING_BLOCKED:'Từ chối: khu đệm đang ùn tắc (≥95%), tạm dừng nhận hàng.',
  RESERVATION_EXPIRED:'Giữ chỗ đã hết hạn sau 15 phút; vị trí đã được trả lại.',RESERVATION_FINAL:'Giữ chỗ đã kết thúc trước đó; không đổi được nữa.',
  REQUEST_ID_REUSED:'Mã yêu cầu đã dùng cho yêu cầu khác.',INVALID_ADMISSION:'Thông tin hàng không hợp lệ.',FORBIDDEN_ROLE:'Tài khoản chỉ xem không được giữ chỗ.',
  UNAUTHENTICATED:'Phiên đăng nhập đã hết; hãy đăng nhập lại.',NEAR_CAPACITY:'Đã giữ chỗ. Kho lưu trữ từ 85% trở lên, cần theo dõi.'};
export const admissionText=code=>ADMISSION_TEXT[code] ?? 'Backend chưa sẵn sàng; chưa giữ chỗ.';
