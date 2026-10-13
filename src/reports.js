// History views (M15): which stored fields are shown/exported per dataset. Columns are a whitelist; nothing secret is fetched.
const stamp = at => at ? new Date(at).toLocaleString('vi-VN', { timeZone: 'Asia/Bangkok', hour12: false, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace(',', '').replace(/^(\d{2}:\d{2}:\d{2}) (.*)$/, '$2 $1') : '';
const way = d => d === 'in' ? 'vào' : d === 'out' ? 'ra' : '';
export const REPORT_LABELS = { events: 'Sự kiện thiết bị', alerts: 'Cảnh báo', commands: 'Lệnh cửa', reservations: 'Giữ chỗ', access: 'Ra vào theo ca' };
export const REPORT_TYPES = {
  events: [['rfid', 'RFID'], ['panic', 'Khẩn cấp'], ['door', 'Cửa'], ['command_rejected', 'Lệnh bị từ chối']],
  alerts: [['info', 'Thông tin'], ['warning', 'Cảnh báo'], ['danger', 'Nguy hiểm']],
  commands: [['pending', 'Chờ'], ['applied', 'Đã áp dụng'], ['rejected', 'Bị từ chối'], ['expired', 'Hết hạn']],
  reservations: [['pending', 'Đang giữ'], ['confirmed', 'Đã nhập kho'], ['cancelled', 'Đã hủy'], ['expired', 'Hết hạn']],
  access: [['in_shift', 'Đúng ca'], ['out_of_shift', 'Ngoài ca'], ['exit', 'Ra'], ['duplicate', 'Đọc lặp'], ['unknown_card', 'Thẻ chưa đăng ký ca'], ['revoked_card', 'Thẻ đã thu hồi'], ['edge_rejected', 'Thiết bị từ chối']],
};
const label = (kind, value) => REPORT_TYPES[kind].find(t => t[0] === value)?.[1] ?? value ?? '';
const common = [{ key: 'id', label: 'Mã' }, { key: 'time', label: 'Thời gian (giờ Việt Nam)' }, { key: 'zone', label: 'Khu' }];
export const REPORT_COLUMNS = {
  events: [...common, { key: 'device', label: 'Thiết bị' }, { key: 'door', label: 'Cửa' }, { key: 'type', label: 'Loại' }, { key: 'summary', label: 'Nội dung' }],
  alerts: [...common, { key: 'door', label: 'Cửa' }, { key: 'type', label: 'Mức' }, { key: 'summary', label: 'Cảnh báo' }, { key: 'state', label: 'Trạng thái' }, { key: 'occurrences', label: 'Số lần' }, { key: 'ack', label: 'Tiếp nhận' }, { key: 'resolved', label: 'Hết lúc' }],
  commands: [...common, { key: 'door', label: 'Cửa' }, { key: 'summary', label: 'Lệnh' }, { key: 'type', label: 'Kết quả' }, { key: 'reason', label: 'Lý do' }, { key: 'actor', label: 'Người gửi' }],
  reservations: [...common, { key: 'slot', label: 'Vị trí' }, { key: 'summary', label: 'Hàng' }, { key: 'type', label: 'Trạng thái' }, { key: 'actor', label: 'Người tạo' }, { key: 'finished', label: 'Kết thúc' }],
  access: [...common, { key: 'door', label: 'Cửa' }, { key: 'summary', label: 'Thẻ' }, { key: 'shift', label: 'Ca' }, { key: 'type', label: 'Đánh giá' }],
};
const ACTIONS = { open: 'Mở cửa', close: 'Đóng cửa', reset_panic: 'Đặt lại khẩn cấp' };
const CLASSES = { ambient: 'Thường', chilled: 'Mát', frozen: 'Lạnh' };
const SIZES = { 1: 'nhỏ', 2: 'vừa', 3: 'lớn' };
function eventSummary(e) {
  if (e.event_type === 'rfid') return `Thẻ ${e.card_id} ${way(e.direction)} ${e.door_id} (${{ accepted: 'hợp lệ', duplicate: 'đọc lặp', unauthorized: 'bị từ chối' }[e.result] ?? e.result})`;
  if (e.event_type === 'door') return `Cửa ${e.door_id} ${{ open: 'mở', closed: 'đóng' }[e.state] ?? 'chưa xác định'}`;
  if (e.event_type === 'panic') return `Nút khẩn cấp ${e.door_id}`;
  return `Lệnh ${e.door_id} bị từ chối ${e.reason ?? ''}`.trim();
}
export function reportRows(kind, items) {
  return items.map(r => {
    const base = { id: r.id, zone: r.zone ?? r.zone_id ?? '' };
    if (kind === 'events') return { ...base, time: stamp(r.received_at), device: r.device_id, door: r.door_id, type: label(kind, r.event_type), summary: eventSummary(r) };
    if (kind === 'alerts') return { ...base, time: stamp(r.raised_at), door: r.door_id ?? '', type: label(kind, r.level), summary: r.title, state: r.state === 'active' ? 'Đang có' : 'Đã hết', occurrences: r.occurrences, ack: r.acknowledged_at ? `${r.acknowledged_by} ${stamp(r.acknowledged_at)}` : '', resolved: stamp(r.resolved_at) };
    if (kind === 'commands') return { ...base, time: stamp(r.created_at), door: r.door_id, summary: ACTIONS[r.action] ?? r.action, type: label(kind, r.status), reason: r.reason ?? '', actor: r.requested_by };
    if (kind === 'reservations') return { ...base, time: stamp(r.created_at), slot: r.slot_id, summary: `${CLASSES[r.temperature_class]} · ${SIZES[r.size_class]} · ${r.load_kg} kg`, type: label(kind, r.status), actor: r.requested_by, finished: r.finished_at ? `${stamp(r.finished_at)} ${r.finished_by ?? ''}`.trim() : '' };
    return { ...base, time: stamp(r.at), door: r.door_id, summary: `${r.card_id} ${way(r.direction)}${r.holder ? ` · ${r.holder}` : ''}`, shift: `${r.shift_code === 'DAY' ? 'Ca ngày' : 'Ca đêm'} ${r.shift_date}`, type: label(kind, r.decision) };
  });
}
