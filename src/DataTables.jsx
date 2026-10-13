import {reading,doorLabel,zoneStatus} from './live-data.js';
import { useState } from 'react';
import Icon from './Icon.jsx';
import { Pill } from './WarehouseMap.jsx';
import { canCloseDoor, isTemperatureWarning } from './demo.js';

export function DoorTable({ demo, onSelect }) {
  const [query, setQuery] = useState('');
  const [zoneFilter, setZoneFilter] = useState('all');
  const doors = demo.doors.filter(door => (zoneFilter === 'all' || door.zone === zoneFilter) && door.id.toLowerCase().includes(query.trim().toLowerCase()));
  return <section className="panel"><div className="table-toolbar"><h2>Trạng thái cửa <span className="count">{demo.doors.length}</span></h2><div className="table-filters"><label className="search-field"><Icon name="search" size={17} /><input aria-label="Tìm mã cửa" placeholder="Tìm cửa, ví dụ D07" value={query} onChange={event => setQuery(event.target.value)} /></label><select aria-label="Lọc cửa theo khu vực" value={zoneFilter} onChange={event => setZoneFilter(event.target.value)}><option value="all">Tất cả khu vực</option>{demo.zones.map(zone => <option key={zone.id} value={zone.id}>{zone.name}</option>)}</select></div></div>
    <div className="table-scroll"><table><thead><tr><th>Cửa</th><th>Khu vực</th><th>Trạng thái</th><th>Thời gian mở</th><th>Liên động kho lạnh</th><th><span className="sr-only">Thao tác</span></th></tr></thead><tbody>{doors.map(door => {
      const zone = demo.zones.find(item => item.id === door.zone);
      return <tr key={door.id}><td><strong className="door-id"><Icon name="door" size={17} />{door.id}</strong></td><td>{zone.name}<small className="cell-secondary">Khu {zone.id}{zone.source&&` · ${zone.source}`}</small></td><td><Pill tone={door.seconds > 30 ? 'warning' : door.open ? 'info' : 'success'}>{doorLabel(door)}</Pill></td><td>{door.open ? door.seconds===null?'—':`${door.seconds} giây` : '—'}</td><td>{zone.id === 'C' ? <span className={!canCloseDoor(zone) ? 'warning-text' : 'success-text'}>{canCloseDoor(zone) ? 'Cho phép đóng' : 'Chặn đóng'}</span> : '—'}</td><td><button className="text-button" aria-label={`Xem chi tiết cửa ${door.id}`} onClick={() => onSelect(zone.id)}>Chi tiết <Icon name="chevron" size={15} /></button></td></tr>;
    })}</tbody></table>{!doors.length && <div className="empty-state"><Icon name="search" size={26} /><strong>Không tìm thấy cửa phù hợp</strong><p>Thử mã cửa khác hoặc chọn tất cả khu vực.</p></div>}</div>
  </section>;
}

export function EnvironmentTable({ zones, onSelect }) {
  return <section className="panel"><div className="panel-heading"><div><h2>Thông số môi trường</h2><p>Đối chiếu nhiệt độ theo ngưỡng của từng khu vực</p></div><Pill>{zones[0]?.mode==='live'?'Wokwi / Node mô phỏng':'Demo giao diện'}</Pill></div><div className="table-scroll"><table><thead><tr><th>Khu vực</th><th>Nhiệt độ</th><th>Độ ẩm</th><th>Khoảng cho phép</th><th>Trạng thái</th><th><span className="sr-only">Thao tác</span></th></tr></thead><tbody>{zones.map(zone => <tr key={zone.id}><td><strong>{zone.name}</strong><small className="cell-secondary">Khu {zone.id}{zone.source&&` · ${zone.source}`}</small></td><td className={isTemperatureWarning(zone) ? 'warning-text' : ''}><strong>{reading(zone.temperature)}°C</strong></td><td>{reading(zone.humidity)}%</td><td>{zone.range[0]} đến {zone.range[1]}°C</td><td><Pill tone={isTemperatureWarning(zone) ? 'warning' : 'success'}>{zone.mode==='live'?zoneStatus(zone):isTemperatureWarning(zone) ? 'Vượt ngưỡng' : 'Ổn định'}</Pill></td><td><button className="text-button" aria-label={`Xem môi trường ${zone.name}`} onClick={() => onSelect(zone.id)}>Chi tiết <Icon name="chevron" size={15} /></button></td></tr>)}</tbody></table></div></section>;
}

export function EventTable({ events, compact = false, onViewAll }) {
  const [filter, setFilter] = useState('all');
  const filtered = events.filter(event => filter === 'all' || event.type === filter);
  const shown = compact ? events.slice(0, 4) : filtered;
  return <section className="panel"><div className="panel-heading"><div><h2>{compact ? 'Hoạt động gần đây' : 'Nhật ký hoạt động'}</h2>{!compact && <p>Nhật ký của phiên mô phỏng hiện tại</p>}</div>{compact ? <button className="text-button" onClick={onViewAll}>Xem tất cả <Icon name="arrow" size={16} /></button> : <select aria-label="Lọc loại sự kiện" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">Tất cả sự kiện</option>{['Cảnh báo', 'Ra / vào', 'Cửa', 'Mô phỏng', 'Tiếp nhận'].map(type => <option key={type}>{type}</option>)}</select>}</div><div className="table-scroll"><table><thead><tr><th>Thời gian</th><th>Sự kiện</th><th>Khu vực</th><th>Loại</th></tr></thead><tbody>{shown.map((event, index) => <tr key={`${event.time}-${index}`}><td className="muted time-cell">{event.time}</td><td><strong>{event.title}</strong>{!compact && <small className="cell-secondary">{event.detail}</small>}</td><td>{event.zone}</td><td><Pill tone={event.type === 'Cảnh báo' ? 'warning' : event.type === 'Mô phỏng' ? 'info' : 'neutral'}>{event.type}</Pill></td></tr>)}</tbody></table>{!shown.length && <div className="empty-state"><Icon name="history" size={26} /><strong>Chưa có sự kiện loại này</strong><p>Chọn bộ lọc khác hoặc chạy một kịch bản mô phỏng.</p></div>}</div></section>;
}
