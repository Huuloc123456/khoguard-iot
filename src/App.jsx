import { useState } from 'react';
import Icon from './Icon.jsx';
import { createDemo, getSummary, scenarios } from './demo.js';
import { WarehouseMap, ZoneDetail, Pill } from './WarehouseMap.jsx';
import { DoorTable, EnvironmentTable, EventTable } from './DataTables.jsx';

const navigation = [
  { id: 'overview', label: 'Tổng quan', icon: 'overview', title: 'Tổng quan kho hàng', description: 'Theo dõi vận hành, môi trường và an toàn tại một nơi.' },
  { id: 'map', label: 'Sơ đồ kho', icon: 'map', title: 'Sơ đồ kho hàng', description: 'Quan sát các khu vực và chọn vị trí cần theo dõi.' },
  { id: 'doors', label: 'Giám sát cửa', icon: 'door', title: 'Giám sát cửa', description: 'Theo dõi trạng thái đóng / mở của 12 cửa trên toàn kho.' },
  { id: 'environment', label: 'Môi trường', icon: 'temperature', title: 'Môi trường kho', description: 'Giám sát nhiệt độ, độ ẩm và các ngưỡng bảo quản.' },
  { id: 'activity', label: 'Nhật ký', icon: 'history', title: 'Nhật ký hoạt động', description: 'Tra cứu sự kiện ra / vào, cửa và cảnh báo của phiên mô phỏng.' },
];

function Alerts({ alerts, onAcknowledge, onSelect }) {
  return <section className="panel alerts-panel"><div className="panel-heading"><div><h2>Cảnh báo cần theo dõi</h2><p>Ưu tiên các tình huống ảnh hưởng đến an toàn</p></div><span className="count">{alerts.filter(alert => !alert.acknowledged).length}</span></div><div className="alerts-list">{alerts.map(alert => <div className={`alert-row ${alert.level}`} key={alert.id}><span className="alert-icon"><Icon name="alert" size={19} /></span><div className="alert-content"><button className="alert-title" onClick={() => onSelect(alert.zone)}>{alert.title}</button><p>{alert.detail}</p><span className="alert-time">Khu {alert.zone} · {alert.time}</span></div><button className="button small" disabled={alert.acknowledged} onClick={() => onAcknowledge(alert.id)}>{alert.acknowledged ? <><Icon name="check" size={14} />Đã tiếp nhận</> : 'Tiếp nhận'}</button></div>)}</div><p className="panel-footnote">Tiếp nhận cảnh báo không thay đổi trạng thái cảm biến hoặc liên động cửa.</p></section>;
}

export default function App() {
  const [view, setView] = useState('overview');
  const [selected, setSelected] = useState('C');
  const [demo, setDemo] = useState(() => createDemo());
  const [showSimulation, setShowSimulation] = useState(false);
  const [notice, setNotice] = useState('');
  const summary = getSummary(demo);
  const current = navigation.find(item => item.id === view);
  const zone = demo.zones.find(item => item.id === selected);
  const pending = demo.alerts.filter(alert => !alert.acknowledged).length;

  function navigate(id) {
    setView(id);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function showZone(id) {
    setSelected(id);
    navigate('map');
  }

  function runScenario(id) {
    setDemo(createDemo(id));
    setSelected('C');
    navigate('overview');
    setNotice(id === 'default' ? 'Đã đặt lại dữ liệu mẫu ban đầu.' : scenarios.find(item => item.id === id).description);
  }

  function acknowledge(id) {
    const alert = demo.alerts.find(item => item.id === id);
    if (!alert || alert.acknowledged) return;
    setDemo(previous => ({ ...previous,
      alerts: previous.alerts.map(item => item.id === id ? { ...item, acknowledged: true } : item),
      events: [{ time: new Date().toLocaleTimeString('vi-VN', { timeZone: 'Asia/Bangkok' }), title: `Tiếp nhận: ${alert.title}`, zone: `Khu ${alert.zone}`, type: 'Tiếp nhận', detail: 'Đã ghi nhận; điều kiện cảnh báo vẫn cần kiểm tra.' }, ...previous.events],
    }));
    setNotice(`Đã tiếp nhận cảnh báo tại khu ${alert.zone}.`);
  }

  function exportEvents() {
    const rows = [['Thời gian', 'Sự kiện', 'Khu vực', 'Loại', 'Chi tiết'], ...demo.events.map(event => [event.time, event.title, event.zone, event.type, event.detail])];
    const csv = '\uFEFF' + rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'khoguard-nhat-ky-mo-phong.csv';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice('Đã xuất nhật ký mô phỏng dưới dạng CSV.');
  }

  return <div className="app-shell">
    <a href="#main-content" className="skip-link">Đi đến nội dung chính</a>
    <aside className="sidebar">
      <a className="brand" href="#main-content" onClick={() => navigate('overview')} aria-label="KhoGuard — Tổng quan"><span className="brand-mark"><Icon name="warehouse" size={23} /></span><span>KhoGuard<span className="brand-subtitle">Quản lý kho thông minh</span></span></a>
      <nav aria-label="Điều hướng chính">{navigation.map(item => <button key={item.id} className={`nav-item ${view === item.id ? 'active' : ''}`} aria-current={view === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}><Icon name={item.icon} size={19} /><span>{item.label}</span>{item.id === 'overview' && pending > 0 && <span className="nav-count">{pending}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="source-status"><span className="status-dot" /><span>Mô phỏng cục bộ</span></div><p>MQTT chưa kết nối</p><div className="profile"><span className="avatar">17</span><div><strong>Nhóm 17</strong><span>Đồ án Internet of Things</span></div></div></div>
    </aside>
    <div className="workspace">
      <header className="topbar"><div className="warehouse-label"><Icon name="warehouse" size={19} /><strong>Kho trung tâm</strong><span className="topbar-separator" /><span>{summary.zones} khu vực · {summary.doors} cửa</span></div><div className="topbar-right"><span className="shift-label">Ca ngày <span>06:00–18:00</span></span><Pill tone="info">Dữ liệu giả lập</Pill></div></header>
      <main id="main-content" tabIndex={-1}>
        <div className="page-heading"><div><h1>{current.title}</h1><p>{current.description}</p></div><div className="heading-actions"><button className="button export-button" aria-label="Xuất nhật ký" title="Xuất nhật ký CSV" onClick={exportEvents}><Icon name="download" size={17} /><span className="button-label">Xuất nhật ký</span></button><button className={`button primary ${showSimulation ? 'pressed' : ''}`} aria-expanded={showSimulation} aria-controls="simulation-panel" onClick={() => setShowSimulation(!showSimulation)}><Icon name="play" size={16} />Mô phỏng</button></div></div>
        {showSimulation && <section id="simulation-panel" className="simulation-panel" aria-labelledby="simulation-title"><div className="simulation-heading"><div><h2 id="simulation-title">Kịch bản mô phỏng</h2><p>Mỗi kịch bản bắt đầu từ dữ liệu mẫu. Thay đổi chỉ áp dụng cho phiên này.</p></div><button className="text-button" onClick={() => runScenario('default')}><Icon name="refresh" size={16} />Đặt lại</button></div><div className="scenario-buttons">{scenarios.map(item => <button key={item.id} className={`button ${demo.scenario === item.id ? 'scenario-active' : ''}`} aria-pressed={demo.scenario === item.id} onClick={() => runScenario(item.id)}>{item.id === 'panic' && <Icon name="alert" size={15} />}{item.label}</button>)}</div></section>}
        <p className={`notice ${notice ? 'visible' : ''}`} role="status">{notice}</p>
        <div className="summary-strip" aria-label="Tóm tắt trạng thái kho">
          <div className="summary-item"><span className="summary-label"><Icon name="door" size={17} />Cửa giám sát</span><div><strong>{summary.doors}<span>cửa</span></strong><span className="summary-caption">{summary.doors - summary.openDoors} đóng · {summary.openDoors} mở</span></div></div>
          <div className="summary-item"><span className="summary-label"><Icon name="people" size={17} />Người trong kho</span><div><strong>{summary.people}<span>người</span></strong><span className="summary-caption">Trong {summary.zones} khu vực</span></div></div>
          <div className="summary-item"><span className="summary-label"><Icon name="box" size={17} />Sức chứa sử dụng</span><div><strong className={summary.utilization >= 95 ? 'danger-text' : ''}>{summary.utilization}<span>%</span></strong><span className="summary-caption">{summary.occupied} / {summary.capacity} vị trí</span></div></div>
          <div className="summary-item"><span className="summary-label"><Icon name="alert" size={17} />Cần tiếp nhận</span><div><strong className={pending ? 'warning-text' : ''}>{pending}<span>cảnh báo</span></strong><span className="summary-caption">{pending ? 'Cần kiểm tra tại khu vực' : 'Đã tiếp nhận tất cả'}</span></div></div>
        </div>
        {(view === 'overview' || view === 'map') && <div className="map-and-detail"><WarehouseMap demo={demo} selected={selected} onSelect={setSelected} /><ZoneDetail zone={zone} doors={demo.doors} alerts={demo.alerts} /></div>}
        {view === 'overview' && <><Alerts alerts={demo.alerts} onAcknowledge={acknowledge} onSelect={showZone} /><EventTable events={demo.events} compact onViewAll={() => navigate('activity')} /></>}
        {view === 'map' && <EnvironmentTable zones={demo.zones} onSelect={setSelected} />}
        {view === 'doors' && <DoorTable demo={demo} onSelect={showZone} />}
        {view === 'environment' && <EnvironmentTable zones={demo.zones} onSelect={showZone} />}
        {view === 'activity' && <EventTable events={demo.events} />}
        <footer className="page-footer"><span>KhoGuard · Bản giao diện mô phỏng</span><span><Icon name="flask" size={14} />Dữ liệu mẫu, chưa kết nối thiết bị</span></footer>
      </main>
    </div>
  </div>;
}
