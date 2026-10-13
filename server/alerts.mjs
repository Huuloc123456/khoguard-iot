import { registry } from '../contracts/validate.js';

export const TEMPERATURE_HYSTERESIS_C = 0.5;
// A condition that returns within this window reopens the same alert instead of adding a row.
export const REOPEN_WINDOW_MS = 60000;
const keyOf = (zone,door,code) => `${zone}|${door ?? '-'}|${code}`;
const alert = (zone,door,code,level,title,detail) => ({key:keyOf(zone,door,code),zone,door_id:door ?? null,code,level,title,detail});

// Desired alerts for one device, from what it reported; the edge owns timers, the backend only mirrors them.
export function desiredAlerts(message,zone,activeKeys) {
  const p=message.payload, device=registry.devices.find(d=>d.id===message.device_id), out=[];
  const z=p.zone_id;
  for (const a of p.alarms ?? []) {
    if (a.code==='TRAPPED_PERSON') out.push(alert(z,null,'TRAPPED_PERSON','danger',`Nghi có người mắc kẹt khu ${z}`,'Có hiện diện liên tục khi cả hai cửa đóng hơn 5 phút; đèn, còi và sưởi tại chỗ đã bật.'));
    else {
      const critical=a.code==='DOOR_OPEN_CRITICAL';
      out.push(alert(z,a.door_id,'DOOR_OPEN',critical ? 'danger':'warning',`Cửa ${a.door_id} mở ${critical ? 'quá 60 giây':'từ 30 giây'}`,
        critical ? 'Đã tăng mức: còi tại chỗ đang bật. Kiểm tra và đóng cửa khi an toàn.' : 'Đèn cảnh báo tại chỗ đang bật. Đóng cửa khi không còn người qua lại.'));
    }
  }
  for (const d of p.doors ?? []) {
    if (d.panic_latched===true) out.push(alert(z,d.door_id,'PANIC_ACTIVE','danger',`Khẩn cấp tại cửa ${d.door_id}`,'Nút khẩn cấp đã chốt: cửa được nhả khóa/mở. Tiếp nhận không đặt lại; cần lệnh đặt lại riêng khi nút đã nhả.'));
    if (device?.source==='wokwi' && d.local_inputs_healthy===false) out.push(alert(z,d.door_id,'LOCAL_INPUT_FAILURE','warning',`Tín hiệu cửa ${d.door_id} chưa xác định`,'Một hoặc nhiều input cửa/rèm quang/panic chưa ổn định; cổng đóng sẽ chặn.'));
  }
  const o=p.occupancy;
  if (o?.count_verified && o.current_occupants===0 && o.presence===true)
    out.push(alert(z,null,'PRESENCE_MISMATCH','warning',`RFID báo 0 người nhưng mmWave còn tín hiệu ở khu ${z}`,'Không đóng cửa; kiểm tra trực tiếp. Hệ thống không tự sửa số người.'));
  if (device?.environment && p.environment) {
    const t=p.environment.temperature_c, key=keyOf(z,null,'TEMPERATURE_OUT_OF_RANGE');
    if (t===null) out.push(alert(z,null,'SENSOR_MISSING','warning',`Mất số đo nhiệt độ khu ${z}`,'Thiết bị đang gửi nhưng cảm biến không có giá trị; không coi là 0 °C.'));
    else {
      const outside=t<zone.temperature_min || t>zone.temperature_max;
      const settled=t>=zone.temperature_min+TEMPERATURE_HYSTERESIS_C && t<=zone.temperature_max-TEMPERATURE_HYSTERESIS_C;
      if (outside || (activeKeys.has(key) && !settled))
        out.push(alert(z,null,'TEMPERATURE_OUT_OF_RANGE','warning',`Nhiệt độ khu ${z} ngoài ngưỡng`,`${t.toLocaleString('vi-VN')} °C, cho phép ${zone.temperature_min} đến ${zone.temperature_max} °C; tự hết khi về trong ngưỡng ±${TEMPERATURE_HYSTERESIS_C} °C.`));
    }
  }
  return out;
}

export const offlineAlert = (deviceId,zoneId) => alert(zoneId,null,`DEVICE_OFFLINE_${deviceId.replaceAll('-','_')}`,'warning',`${deviceId} mất kết nối`,'Last Will offline; giá trị cuối giữ để tra cứu, không coi là an toàn. Quy tắc tại thiết bị vẫn chạy.');

// rows: this device's alerts (latest row per key); want: desiredAlerts output. Returns DB operations.
export function planAlerts(rows,want,now) {
  const ops=[], byKey=new Map(rows.map(r=>[r.key,r]));
  for (const w of want) {
    const row=byKey.get(w.key);
    if (row?.state==='active') {if (row.level!==w.level) ops.push({op:'update',id:row.id,...w});}
    else if (row?.state==='resolved' && now-new Date(row.resolved_at).getTime()<REOPEN_WINDOW_MS) ops.push({op:'reopen',id:row.id,...w});
    else ops.push({op:'raise',...w});
  }
  const wanted=new Set(want.map(w=>w.key));
  for (const row of rows) if (row.state==='active' && !wanted.has(row.key)) ops.push({op:'resolve',id:row.id});
  return ops;
}
