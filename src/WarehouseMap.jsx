import {reading,signal,doorLabel,zoneStatus} from './live-data.js';
import Icon from './Icon.jsx';
import { canCloseDoor, isTemperatureWarning } from './demo.js';

export function Pill({ tone = 'neutral', children }) {
  return <span className={`pill ${tone}`}><span className="status-dot" />{children}</span>;
}

export function WarehouseMap({ demo, selected, onSelect }) {
  return <section className="panel map-panel" aria-labelledby="map-title">
    <div className="panel-heading"><div><h2 id="map-title">Sơ đồ toàn kho</h2><p>Chọn khu vực để xem chi tiết</p></div><span className="muted">{demo.zones.length} khu vực</span></div>
    <div className="warehouse-plan">
      {demo.zones.map(zone => {
        const warning = demo.alerts.some(alert => alert.zone === zone.id);
        const zoneDoors = demo.doors.filter(door => door.zone === zone.id);
        return <button key={zone.id} className={`zone zone-${zone.id} ${selected === zone.id ? 'selected' : ''}`} aria-pressed={selected === zone.id} onClick={() => onSelect(zone.id)}>
          <span className="zone-heading"><span className="zone-name"><span className="zone-letter">{zone.id}</span>{zone.name}</span><Icon name={zone.id === 'C' ? 'temperature' : 'warehouse'} size={18} /></span>
          <span className={`zone-temperature ${isTemperatureWarning(zone) ? 'warning-text' : ''}`}>{reading(zone.temperature)}°C <span className={warning ? 'warning-text' : ''}>· {zone.mode==='live' ? zoneStatus(zone) : zone.panic ? 'Khẩn cấp' : isTemperatureWarning(zone) ? 'Vượt ngưỡng' : warning ? 'Cần kiểm tra' : 'Ổn định'}</span></span>
          <span className="shelves" aria-hidden="true">{Array.from({ length: 8 }, (_, index) => <span className="shelf" key={index}><i /><i /><i /></span>)}</span>
          <span className="zone-meta"><span><Icon name="people" size={14} />{reading(zone.people)} người</span><span>{reading(zone.occupied)}/{zone.capacity} vị trí</span></span>
          <span className="zone-doors">{zoneDoors.map(door => <span key={door.id} className={`map-door ${door.open ? 'open' : ''} ${door.seconds > 30 ? 'late' : ''}`}><Icon name="door" size={12} />{door.id}<span className="door-state">{doorLabel(door)}</span></span>)}</span>
        </button>;
      })}
      <div className="aisle"><span /><Icon name="arrow" size={14} /><span>LỐI ĐI CHÍNH</span><Icon name="arrow" size={14} /><span /></div>
    </div>
    <div className="map-legend"><span><i className="legend-dot closed" />Cửa đóng</span><span><i className="legend-dot open" />Cửa mở</span><span><i className="legend-dot warning" />Cần chú ý</span><span className="map-note">Sơ đồ minh họa</span></div>
  </section>;
}

export function ZoneDetail({ zone, doors, alerts }) {
  const isCold = zone.id === 'C';
  const blocked = !canCloseDoor(zone);
  const warning = alerts.some(alert => alert.zone === zone.id);
  return <section className="panel detail-panel" aria-labelledby="detail-title">
    <div className="panel-heading"><div><h2 id="detail-title">Chi tiết khu vực</h2><p>Khu {zone.id} · {zone.name}</p></div><span className="detail-zone-id">{zone.id}</span></div>
    <div className="detail-body">{zone.mode==='live'&&<p className="source-detail">{zone.source} · {zoneStatus(zone)} · {zone.countVerified?'Count đã xác minh':'Count chưa xác minh'}</p>}
      <div className="detail-status"><Icon name="warehouse" size={22} /><strong>{zone.name}</strong><Pill tone={zone.panic ? 'danger' : warning ? 'warning' : 'success'}>{zone.mode==='live' ? zoneStatus(zone) : zone.panic ? 'Khẩn cấp' : warning ? 'Cảnh báo' : 'Ổn định'}</Pill></div>
      <dl className="readings"><div><dt>Nhiệt độ</dt><dd className={isTemperatureWarning(zone) ? 'warning-text' : ''}>{reading(zone.temperature)}<small>°C</small></dd></div><div><dt>Độ ẩm</dt><dd>{reading(zone.humidity)}<small>%</small></dd></div></dl>
      <dl className="detail-list"><div><dt>Người bên trong</dt><dd>{reading(zone.people)} người</dd></div><div><dt>Cửa đang mở</dt><dd>{doors.filter(door => door.zone === zone.id && door.open).length} / {doors.filter(door => door.zone === zone.id).length} cửa</dd></div><div><dt>Khoảng nhiệt độ</dt><dd>{zone.range[0]} đến {zone.range[1]}°C</dd></div></dl>
      <div className="storage-heading"><span>Sức chứa khu vực</span><strong>{zone.occupied===null?'—':Math.round(zone.occupied / zone.capacity * 100)}%</strong></div>
      {zone.occupied!==null&&<progress className={zone.occupied / zone.capacity >= .95 ? 'capacity-danger' : ''} value={reading(zone.occupied)} max={zone.capacity} aria-label={`Sức chứa ${zone.name}`} />}
      <p className="capacity-caption">{reading(zone.occupied)} / {zone.capacity} vị trí đã sử dụng</p>
      {isCold && <div className="safety-section"><h3>Liên động an toàn</h3><div className="signal-row"><span>Bộ đếm RFID</span><strong>{reading(zone.people)} người</strong></div><div className="signal-row"><span>Cảm biến mmWave</span><strong>{signal(zone.presence,'Có tín hiệu','Không có tín hiệu')}</strong></div><div className="signal-row"><span>Rèm quang</span><strong>{signal(zone.beam,'Có vật cản','Thông thoáng')}</strong></div><div className={`safety-message ${zone.panic ? 'danger' : blocked ? 'warning' : 'success'}`} role="status"><Icon name={blocked ? 'lock' : 'check'} size={17} /><div><strong>{zone.panic ? 'Chế độ khẩn cấp' : blocked ? 'Chặn đóng cửa' : zone.mode==='live'?'Đủ tín hiệu để xét đóng':'Cho phép đóng cửa'}</strong><p>{zone.panic ? 'Cắt chốt, mở cửa và bật cảnh báo giả lập.' : blocked ? zone.mode==='live'?'Còn người, tín hiệu chưa xác minh hoặc dữ liệu cũ.':'Còn người hoặc tín hiệu hiện diện bên trong.' : 'Bộ đếm và các cảm biến đều đã thông thoáng.'}</p></div></div></div>}
    </div>
  </section>;
}
