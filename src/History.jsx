import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import { downloadCsv } from './csv.js';
import { REPORT_COLUMNS, REPORT_LABELS, REPORT_TYPES, reportRows } from './reports.js';

const VN = 7 * 3600000;
const localInput = ms => new Date(ms + VN).toISOString().slice(0, 16);
const toIso = value => `${value}:00+07:00`;
const MAX_EXPORT_PAGES = 10;

// Filters are sent to the backend; the table shows exactly what MySQL returned for them.
export function History({ canAccess }) {
  const kinds = Object.keys(REPORT_LABELS).filter(k => k !== 'access' || canAccess);
  const [filter, setFilter] = useState(() => ({ kind: 'events', from: localInput(Date.now() - 24 * 3600000), to: localInput(Date.now() + 60000), zone: '', type: '' }));
  const [applied, setApplied] = useState(filter);
  const [page, setPage] = useState({ items: [], next: null, status: 'loading', error: '' });
  const [note, setNote] = useState('');
  const params = (f, cursor, limit = 100) => {
    const p = new URLSearchParams({ from: toIso(f.from), to: toIso(f.to), limit: String(limit) });
    if (f.zone) p.set('zone', f.zone); if (f.type) p.set('type', f.type); if (cursor) p.set('cursor', String(cursor));
    return `/api/reports/${f.kind}?${p}`;
  };
  async function load(f, cursor, limit) {
    const r = await fetch(params(f, cursor, limit), { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(r.status === 400 ? 'Bộ lọc không hợp lệ (khoảng thời gian tối đa 31 ngày, từ < đến).' : 'Không tải được lịch sử từ backend.');
    return r.json();
  }
  useEffect(() => {
    let stopped = false;
    setPage(p => ({ ...p, status: 'loading', error: '' }));
    load(applied).then(body => { if (!stopped) setPage({ items: body.items, next: body.next_cursor, status: 'ready', error: '' }); })
      .catch(e => { if (!stopped) setPage({ items: [], next: null, status: 'error', error: e.message }); });
    return () => { stopped = true; };
  }, [applied]);
  async function more() {
    try { const body = await load(applied, page.next); setPage(p => ({ ...p, items: [...p.items, ...body.items], next: body.next_cursor })); }
    catch (e) { setPage(p => ({ ...p, error: e.message })); }
  }
  async function exportCsv() {
    setNote('Đang tải toàn bộ dữ liệu theo bộ lọc…');
    try {
      let items = [], cursor = null, pages = 0;
      do { const body = await load(applied, cursor, 500); items = items.concat(body.items); cursor = body.next_cursor; pages++; } while (cursor && pages < MAX_EXPORT_PAGES);
      downloadCsv(`khoguard-${applied.kind}-${applied.from.slice(0, 10)}.csv`, REPORT_COLUMNS[applied.kind], reportRows(applied.kind, items));
      setNote(`Đã xuất ${items.length} dòng ${REPORT_LABELS[applied.kind].toLowerCase()}${cursor ? ` (giới hạn ${MAX_EXPORT_PAGES * 500} dòng; thu hẹp khoảng thời gian để lấy phần còn lại)` : ''}.`);
    } catch (e) { setNote(e.message); }
  }
  const set = key => e => setFilter(f => ({ ...f, [key]: e.target.value, ...(key === 'kind' ? { type: '' } : {}) }));
  const columns = REPORT_COLUMNS[applied.kind], rows = reportRows(applied.kind, page.items);
  return <section className="panel" aria-labelledby="history-title"><div className="panel-heading"><div><h2 id="history-title">Lịch sử lưu trong MySQL</h2><p>Lọc theo thời gian (giờ Việt Nam), khu và loại; còn nguyên sau khi khởi động lại backend.</p></div><button className="button" onClick={exportCsv} disabled={page.status !== 'ready'}><Icon name="download" size={16} />Xuất CSV</button></div>
    <form className="history-filters" onSubmit={e => { e.preventDefault(); setApplied(filter); }}>
      <label>Dữ liệu<select value={filter.kind} onChange={set('kind')}>{kinds.map(k => <option key={k} value={k}>{REPORT_LABELS[k]}</option>)}</select></label>
      <label>Từ<input type="datetime-local" required value={filter.from} onChange={set('from')} /></label>
      <label>Đến<input type="datetime-local" required value={filter.to} onChange={set('to')} /></label>
      <label>Khu<select value={filter.zone} onChange={set('zone')}><option value="">Tất cả</option>{['A', 'B', 'C', 'D'].map(z => <option key={z}>{z}</option>)}</select></label>
      <label>Loại<select value={filter.type} onChange={set('type')}><option value="">Tất cả</option>{REPORT_TYPES[filter.kind].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <button className="button primary">Lọc</button>
    </form>
    <p className="history-note" role="status">{page.error ? <span className="warning-text">{page.error}</span> : note || `${rows.length} dòng${page.next ? ', còn nữa' : ''}.`}</p>
    <div className="table-scroll"><table><thead><tr>{columns.map(c => <th key={c.key}>{c.label}</th>)}</tr></thead><tbody>{rows.map(r => <tr key={r.id}>{columns.map(c => <td key={c.key} className={c.key === 'time' ? 'muted time-cell' : ''}>{r[c.key]}</td>)}</tr>)}</tbody></table>
      {page.status === 'ready' && !rows.length && <div className="empty-state"><Icon name="history" size={26} /><strong>Không có dữ liệu</strong><p>Thử khoảng thời gian rộng hơn hoặc bỏ bớt bộ lọc.</p></div>}</div>
    {page.next && <p className="panel-footnote"><button className="text-button" onClick={more}>Tải thêm</button></p>}
  </section>;
}
