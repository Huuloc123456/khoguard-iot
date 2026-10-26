import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import { Pill } from './WarehouseMap.jsx';
import { areaView, admissionText } from './live-data.js';

const CLASSES = [['frozen', 'Đông lạnh −22 đến −16°C (khu C)']];
const SIZES = [[1, 'Nhỏ'], [2, 'Vừa'], [3, 'Lớn']];
const STATUS = { pending: ['Đang giữ', 'info'], confirmed: ['Đã nhập kho', 'success'], cancelled: ['Đã hủy', 'neutral'], expired: ['Hết hạn', 'warning'] };
const TONE = { normal: 'success', warning: 'warning', danger: 'danger' };
const time = at => new Date(at).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Bangkok', hour12: false });

function Area({ title, area, note }) {
  const v = areaView(area);
  return <div className="receiving-area"><span className="summary-label">{title}</span><strong>{v.used}<span> / {v.capacity} vị trí</span></strong>
    <progress className={v.level === 'danger' ? 'capacity-danger' : ''} value={Math.min(v.used, v.capacity)} max={v.capacity} aria-label={title} />
    <span className="summary-caption">{v.occupied} đang chứa + {v.reserved} giữ chỗ · <Pill tone={TONE[v.level]}>{v.percent}</Pill></span><small className="cell-secondary">{note}</small></div>;
}

// Requests go to the backend, which checks capacity and assigns the slot in one transaction.
export function Receiving({ revision, canReserve }) {
  const [page, setPage] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ temperature_class: 'frozen', size_class: 1, load_kg: 400 });
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => { const timer = setInterval(() => setTick(t => t + 1), 5000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    let stopped = false;
    fetch('/api/reservations', { cache: 'no-store', signal: AbortSignal.timeout(5000) })
      .then(async r => { if (!r.ok) throw new Error(); const body = await r.json(); if (!stopped) { setPage(body); setError(''); } })
      .catch(() => { if (!stopped) setError('Không tải được danh sách giữ chỗ.'); });
    return () => { stopped = true; };
  }, [revision, tick]);
  async function call(path, body) {
    setBusy(true);
    try {
      const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
      const json = await r.json().catch(() => ({}));
      setTick(t => t + 1);
      return { ok: r.ok, json };
    } catch { return { ok: false, json: {} }; } finally { setBusy(false); }
  }
  async function submit(event) {
    event.preventDefault();
    const { ok, json } = await call('/api/admissions', { request_id: crypto.randomUUID(), ...form, load_kg: Number(form.load_kg) });
    setMessage(ok ? { tone: json.warning ? 'warning' : 'success', text: json.warning ? admissionText(json.warning) + ` Vị trí ${json.reservation.slot_id}.` : `Đã giữ vị trí ${json.reservation.slot_id} tới ${time(json.reservation.expires_at)}.` }
      : { tone: 'warning', text: admissionText(json.error?.code) });
  }
  async function finish(id, action) {
    const { ok, json } = await call(`/api/reservations/${id}/${action}`, {});
    setMessage(ok ? { tone: 'success', text: action === 'confirm' ? `Đã xác nhận nhập kho vào ${json.reservation.slot_id}.` : 'Đã hủy giữ chỗ, vị trí được trả lại.' } : { tone: 'warning', text: admissionText(json.error?.code) });
  }
  const set = key => e => setForm(f => ({ ...f, [key]: key === 'load_kg' ? e.target.value : key === 'size_class' ? Number(e.target.value) : e.target.value }));
  return <>
    <section className="panel" aria-labelledby="capacity-title"><div className="panel-heading"><div><h2 id="capacity-title">Sức chứa nhận hàng</h2><p>Tính vị trí đang chứa + đang giữ chỗ trên vị trí khả dụng (bỏ vị trí xả đá). Từ 85% cảnh báo, vượt 95% từ chối. Số liệu chứa hàng là dữ liệu demo, chưa nối WMS.</p></div></div>
      {error && <p className="warning-text panel-footnote" role="status">{error}</p>}
      {page && <div className="receiving-areas"><Area title="Kho lạnh C" area={page.storage} note="80 vị trí vật lý, 2 vị trí xả đá, còn 78 vị trí khả dụng. Ngưỡng từ chối trên 95%." /></div>}
    </section>
    <section className="panel" aria-labelledby="admission-title"><div className="panel-heading"><div><h2 id="admission-title">Yêu cầu nhận hàng</h2><p>Mỗi yêu cầu giữ một vị trí trong 15 phút theo đồng hồ backend.</p></div>{!canReserve && <Pill tone="info">Chỉ xem</Pill>}</div>
      <form className="admission-form" onSubmit={submit}>
        <label>Loại hàng<select value={form.temperature_class} onChange={set('temperature_class')} disabled={!canReserve}>{CLASSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label>Kích thước pallet<select value={form.size_class} onChange={set('size_class')} disabled={!canReserve}>{SIZES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label>Tải trọng (kg)<input type="number" min="1" max="5000" step="1" required value={form.load_kg} onChange={set('load_kg')} disabled={!canReserve} /></label>
        <button className="button primary" disabled={!canReserve || busy}><Icon name="box" size={16} />Giữ chỗ</button>
      </form>
      <p className="notice visible admission-result" role="status">{message ? <Pill tone={message.tone}>{message.text}</Pill> : <span className="muted">Backend kiểm tra ngưỡng và vị trí phù hợp trong khu C; giao diện không tự quyết định.</span>}</p>
    </section>
    <section className="panel" aria-labelledby="reservation-title"><div className="panel-heading"><div><h2 id="reservation-title">Giữ chỗ gần đây</h2><p>Mỗi giữ chỗ chỉ có một kết quả: nhập kho, hủy hoặc hết hạn.</p></div></div>
      <div className="table-scroll"><table><thead><tr><th>Mã</th><th>Vị trí</th><th>Hàng</th><th>Trạng thái</th><th>Hết hạn</th><th><span className="sr-only">Thao tác</span></th></tr></thead><tbody>{(page?.items ?? []).map(r => {
        const [label, tone] = STATUS[r.status];
        return <tr key={r.id}><td className="muted">#{r.id}<small className="cell-secondary">{r.requested_by}</small></td><td><strong>{r.slot_id}</strong><small className="cell-secondary">Khu {r.zone_id}</small></td><td>{CLASSES.find(c => c[0] === r.temperature_class)[1].split(' (')[0]}<small className="cell-secondary">{SIZES.find(s => s[0] === r.size_class)[1]} · {r.load_kg} kg</small></td><td><Pill tone={tone}>{label}</Pill></td><td className="muted time-cell">{time(r.expires_at)}</td>
          <td>{r.status === 'pending' && canReserve && <span className="row-actions"><button className="button small" disabled={busy} onClick={() => finish(r.id, 'confirm')}>Nhập kho</button><button className="text-button" disabled={busy} onClick={() => finish(r.id, 'cancel')}>Hủy</button></span>}</td></tr>;
      })}</tbody></table>{page && !page.items.length && <div className="empty-state"><Icon name="box" size={26} /><strong>Chưa có giữ chỗ</strong><p>Tạo yêu cầu nhận hàng để giữ một vị trí.</p></div>}</div></section>
  </>;
}
