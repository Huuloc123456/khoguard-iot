const zones = [
  { id: 'A', name: 'Kho thường', temperature: 24.6, humidity: 62, range: [18, 30], people: 4, occupied: 84, capacity: 100, presence: true, beam: false, panic: false },
  { id: 'B', name: 'Kho mát', temperature: 9.2, humidity: 58, range: [2, 8], people: 0, occupied: 64, capacity: 80, presence: false, beam: false, panic: false },
  { id: 'C', name: 'Kho lạnh', temperature: -18.4, humidity: 55, range: [-22, -16], people: 2, occupied: 60, capacity: 80, presence: true, beam: false, panic: false },
  { id: 'D', name: 'Khu đệm', temperature: 22.1, humidity: 60, range: [18, 28], people: 1, occupied: 32, capacity: 48, presence: true, beam: false, panic: false },
];

const alerts = [
  { id: 'door', zone: 'C', title: 'Cửa D07 mở quá thời gian', detail: 'Đã mở 42 giây · Ngưỡng cảnh báo 30 giây', level: 'warning', time: '09:41' },
  { id: 'temperature', zone: 'B', title: 'Nhiệt độ kho mát vượt ngưỡng', detail: '9,2°C · Khoảng cho phép 2–8°C', level: 'warning', time: '09:38' },
];

export const scenarios = [
  { id: 'arrival', label: 'Ra / vào hợp lệ', description: 'Quét thẻ vào kho lạnh; bộ đếm người tăng và cửa bị chặn đóng.' },
  { id: 'presence', label: 'Phát hiện còn người', description: 'RFID báo 0 người nhưng mmWave có tín hiệu; tiếp tục chặn đóng cửa.' },
  { id: 'panic', label: 'Nút khẩn cấp', description: 'Giả lập mở cửa D07, cắt chốt và phát cảnh báo khẩn cấp.' },
  { id: 'full', label: 'Kho đạt 95%', description: 'Sức chứa toàn kho đạt ngưỡng đỏ; hiển thị từ chối nhập thêm.' },
];

export function canCloseDoor(zone) {
  return zone.people === 0 && zone.presence === false && zone.beam === false && zone.panic === false
    && (zone.mode!=='live' || (zone.freshness==='fresh' && zone.countVerified && zone.inputsHealthy));
}

export function isTemperatureWarning(zone) {
  return zone.temperature!==null && (zone.temperature < zone.range[0] || zone.temperature > zone.range[1]);
}

// shortcut: browser-local synthetic snapshots; replace with validated telemetry when MQTT is integrated.
export function createDemo(scenario = 'default') {
  const demo = {
    zones: zones.map(zone => ({ ...zone, range: [...zone.range] })),
    doors: Array.from({ length: 12 }, (_, index) => ({
      id: `D${String(index + 1).padStart(2, '0')}`,
      zone: ['A', 'B', 'C', 'D'][Math.floor(index / 3)],
      open: index === 1 || index === 6,
      seconds: index === 6 ? 42 : index === 1 ? 12 : 0,
    })),
    alerts: alerts.map(alert => ({ ...alert, acknowledged: false })),
    events: [
      { time: '09:41:02', title: 'Cửa D07 mở quá thời gian', zone: 'Kho lạnh', type: 'Cảnh báo', detail: 'Mở 42 giây, đã phát cảnh báo tại chỗ.' },
      { time: '09:40:18', title: 'Thẻ RFID được chấp nhận', zone: 'Kho thường', type: 'Ra / vào', detail: 'Nhân viên NV-017 vào khu A.' },
      { time: '09:38:45', title: 'Nhiệt độ vượt ngưỡng', zone: 'Kho mát', type: 'Cảnh báo', detail: 'Nhiệt độ 9,2°C; ngưỡng tối đa 8°C.' },
      { time: '09:36:10', title: 'Cửa D09 đã đóng', zone: 'Kho lạnh', type: 'Cửa', detail: 'Ghi nhận trạng thái cảm biến từ.' },
    ],
    scenario,
  };
  const cold = demo.zones.find(zone => zone.id === 'C');
  if (scenario === 'arrival') cold.people += 1;
  if (scenario === 'presence') {
    cold.people = 0;
    demo.alerts.unshift({ id: 'presence', zone: 'C', title: 'Nghi ngờ còn người trong kho', detail: 'mmWave có tín hiệu dù RFID đếm 0 người · Chặn đóng cửa', level: 'warning', time: 'Mô phỏng' });
  }
  if (scenario === 'panic') {
    cold.panic = true;
    demo.alerts.unshift({ id: 'panic', zone: 'C', title: 'Nút khẩn cấp đã được kích hoạt', detail: 'D07 mở · Cắt chốt điện từ · Còi và đèn sưởi được bật', level: 'danger', time: 'Mô phỏng' });
  }
  if (scenario === 'full') {
    demo.zones.forEach((zone, index) => { zone.occupied = [100, 76, 80, 37][index]; });
    demo.alerts.unshift({ id: 'capacity', zone: 'C', title: 'Tạm dừng tiếp nhận hàng', detail: 'Toàn kho đạt ngưỡng 95% · Cần giải phóng vị trí trước khi nhập', level: 'danger', time: 'Mô phỏng' });
  }
  const chosen = scenarios.find(item => item.id === scenario);
  if (chosen) demo.events.unshift({ time: 'Mô phỏng', title: chosen.label, zone: scenario === 'full' ? 'Toàn kho' : 'Kho lạnh', type: 'Mô phỏng', detail: chosen.description });
  return demo;
}

export function getSummary(demo) {
  const occupied = demo.zones.some(z=>z.occupied===null) ? null:demo.zones.reduce((sum, zone) => sum + zone.occupied, 0);
  const capacity = demo.zones.reduce((sum, zone) => sum + zone.capacity, 0);
  return {
    zones: demo.zones.length,
    doors: demo.doors.length,
    openDoors: demo.doors.filter(door => door.open).length,
    people: demo.zones.some(z=>z.people===null || (z.mode==='live' && (!z.countVerified || z.freshness!=='fresh'))) ? null:demo.zones.reduce((sum, zone) => sum + zone.people, 0),
    occupied,
    capacity,
    utilization: occupied===null ? null:Math.round(occupied / capacity * 100),
  };
}
