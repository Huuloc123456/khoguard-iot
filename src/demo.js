const zones = [
  { id: 'C', name: 'Kho lạnh', temperature: -18.4, humidity: 55, range: [-22, -16], people: 2, occupied: 60, capacity: 78, presence: true, beam: false, panic: false },
];

const alerts = [
  { id: 'door', zone: 'C', title: 'Cửa D07 mở quá thời gian', detail: 'Đã mở 42 giây · Ngưỡng cảnh báo 30 giây', level: 'warning', time: '09:41' },
];

export const scenarios = [
  { id: 'arrival', label: 'Ra / vào hợp lệ', description: 'Quét thẻ vào kho lạnh; bộ đếm người tăng và cửa bị chặn đóng.' },
  { id: 'presence', label: 'Phát hiện còn người', description: 'RFID báo 0 người nhưng PIR có tín hiệu; tiếp tục chặn đóng cửa.' },
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

// Demo is explicitly browser-local; the live mode reads validated backend snapshots.
export function createDemo(scenario = 'default') {
  const demo = {
    zones: zones.map(zone => ({ ...zone, range: [...zone.range] })),
    doors: ['D07','D08'].map((id, index) => ({
      id,
      zone: 'C',
      open: index === 0,
      seconds: index === 0 ? 42 : 0,
    })),
    alerts: alerts.map(alert => ({ ...alert, acknowledged: false })),
    events: [
      { time: '09:41:02', title: 'Cửa D07 mở quá thời gian', zone: 'Kho lạnh', type: 'Cảnh báo', detail: 'Mở 42 giây, đã phát cảnh báo tại chỗ.' },
      { time: '09:40:18', title: 'Thẻ RFID được chấp nhận', zone: 'Kho lạnh', type: 'Ra / vào', detail: 'Thẻ DEMO-017 vào khu C qua D07.' },
      { time: '09:36:10', title: 'Cửa D08 đã đóng', zone: 'Kho lạnh', type: 'Cửa', detail: 'Ghi nhận công tắc hành trình mô phỏng.' },
    ],
    scenario,
  };
  const cold = demo.zones.find(zone => zone.id === 'C');
  if (scenario === 'arrival') cold.people += 1;
  if (scenario === 'presence') {
    cold.people = 0;
    demo.alerts.unshift({ id: 'presence', zone: 'C', title: 'Nghi ngờ còn người trong kho', detail: 'PIR có tín hiệu dù RFID đếm 0 người · Chặn đóng cửa', level: 'warning', time: 'Mô phỏng' });
  }
  if (scenario === 'panic') {
    cold.panic = true;
    demo.alerts.unshift({ id: 'panic', zone: 'C', title: 'Nút khẩn cấp đã được kích hoạt', detail: 'D07 mở · Cắt chốt điện từ · Còi và đèn sưởi được bật', level: 'danger', time: 'Mô phỏng' });
  }
  if (scenario === 'full') {
    cold.occupied = 75;
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
