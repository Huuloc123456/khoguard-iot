import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { Pill } from './WarehouseMap.jsx';
import { commandText, doorLabel, lockLabel } from './live-data.js';

const ACTIONS = [['open', 'Mở cửa'], ['close', 'Đóng cửa'], ['reset_panic', 'Đặt lại khẩn cấp']];
const tone = c => c?.error || c?.status === 'rejected' || c?.status === 'expired' ? 'warning' : c?.status === 'applied' ? 'success' : 'info';

// Sends a request to the edge; the door icon/state only changes when ESP-C01 reports it in telemetry.
export function DoorControls({ doors, online, canCommand = true }) {
  const [commands, setCommands] = useState({});
  const timers = useRef(new Set());
  useEffect(() => () => { for (const timer of timers.current) clearTimeout(timer); }, []);
  const set = (door, value) => setCommands(previous => ({ ...previous, [door]: value }));
  function poll(door, action, id, started) {
    const timer = setTimeout(async () => {
      timers.current.delete(timer);
      try {
        const response = await fetch(`/api/commands/${id}`, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
        if (response.ok) { const value = await response.json(); set(door, { action, ...value }); if (value.status !== 'pending') return; }
      } catch {}
      if (Date.now() - started < 20000) poll(door, action, id, started);
    }, 500);
    timers.current.add(timer);
  }
  async function send(door, action) {
    set(door, { action, status: 'pending' });
    try {
      const response = await fetch(`/api/doors/${door}/commands`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }), signal: AbortSignal.timeout(5000) });
      const body = await response.json().catch(() => ({}));
      if (response.status !== 202) return set(door, { action, error: body.error?.code ?? 'UNAVAILABLE' });
      set(door, { action, ...body });
      if (body.status === 'pending') poll(door, action, body.command_id, Date.now());
    } catch { set(door, { action, error: 'UNAVAILABLE' }); }
  }
  return <section className="panel door-controls" aria-labelledby="door-controls-title"><div className="panel-heading"><div><h2 id="door-controls-title">Điều khiển cửa khu C</h2><p>Gửi yêu cầu tới ESP-C01 (Wokwi). Thiết bị tự kiểm tra an toàn và có thể từ chối.</p></div><div className="heading-actions">{!canCommand && <Pill tone="info">Chỉ xem</Pill>}<Pill tone={online ? 'success' : 'warning'}>{online ? 'ESP-C01 trực tuyến' : 'ESP-C01 chưa sẵn sàng'}</Pill></div></div>
    <div className="door-control-list">{doors.map(door => {
      const command = commands[door.id], busy = command?.status === 'pending' && !command.error;
      return <div className="door-control" key={door.id}><div className="door-control-state"><strong className="door-id"><Icon name="door" size={17} />{door.id}</strong><span>{doorLabel(door)} · <Icon name="lock" size={13} /> {lockLabel(door)}{door.panic_latched ? ' · Khẩn cấp đang chốt' : ''}</span></div>
        <div className="door-control-actions">{ACTIONS.map(([action, label]) => <button key={action} className="button small" disabled={busy || !online || !canCommand} onClick={() => send(door.id, action)}>{label}</button>)}</div>
        <p className="door-control-status" role="status" aria-live="polite">{command ? <Pill tone={tone(command)}>{ACTIONS.find(a => a[0] === command.action)[1]}: {commandText(command)}</Pill> : <span className="muted">Chưa gửi lệnh.</span>}</p></div>;
    })}</div>
    <p className="panel-footnote">Backend đánh dấu lệnh hết hạn nếu chưa có phản hồi sau 10 giây (chờ thêm tối đa 2 giây). Thiết bị kiểm tra phiên và trạng thái hiện tại; nút khẩn cấp và liên động chạy tại thiết bị, không phụ thuộc backend.</p></section>;
}
