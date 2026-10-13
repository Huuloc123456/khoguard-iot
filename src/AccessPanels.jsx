import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import { Pill } from './WarehouseMap.jsx';
import { accessToView } from './live-data.js';

const ROLE_LABELS = { viewer: 'Chỉ xem', operator: 'Vận hành', admin: 'Quản trị' };
export const roleLabel = role => ROLE_LABELS[role] ?? role;

export function LoginScreen({ session, modeControl }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const submit = event => { event.preventDefault(); void session.login(username.trim(), password).then(() => setPassword('')); };
  return <main className="login-screen"><form className="panel login-card" onSubmit={submit} aria-labelledby="login-title">
    <span className="brand-mark"><Icon name="warehouse" size={23} /></span>
    <h1 id="login-title">Đăng nhập KhoGuard</h1>
    <p>Dữ liệu backend/MQTT cần đăng nhập. Tài khoản demo nằm trong <code>.local/dashboard-users.json</code> trên máy chạy backend.</p>
    <label>Tên đăng nhập<input name="username" autoComplete="username" required value={username} onChange={e => setUsername(e.target.value)} /></label>
    <label>Mật khẩu<input name="password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
    <p className="login-error" role="alert">{session.error}</p>
    <button className="button primary" disabled={session.busy}>{session.busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
    {modeControl}
  </form></main>;
}

// Access audit is computed by the backend from receive time; it never changes what the door did.
export function AccessAudit({ revision }) {
  const [state, setState] = useState({ rows: null, error: '' });
  useEffect(() => {
    let stopped = false;
    fetch('/api/access', { cache: 'no-store', signal: AbortSignal.timeout(5000) })
      .then(async r => { if (!r.ok) throw new Error(); const rows = accessToView(await r.json()); if (!stopped) setState({ rows, error: '' }); })
      .catch(() => { if (!stopped) setState(s => ({ ...s, error: 'Không tải được nhật ký ra vào.' })); });
    return () => { stopped = true; };
  }, [revision]);
  const rows = state.rows ?? [];
  return <section className="panel" aria-labelledby="access-title"><div className="panel-heading"><div><h2 id="access-title">Ra vào theo ca</h2><p>Ca ngày 06:00–18:00, ca đêm 18:00–06:00 (giờ Việt Nam). Ngoài ca chỉ là ghi nhận, không khóa ai trong kho.</p></div><span className="count">{rows.filter(r => r.label === 'Ngoài ca').length}</span></div>
    {state.error && <p className="warning-text" role="status">{state.error}</p>}
    <div className="table-scroll"><table><thead><tr><th>Thời gian</th><th>Thẻ</th><th>Cửa</th><th>Ca</th><th>Đánh giá</th></tr></thead><tbody>{rows.map(r => <tr key={r.id}><td className="muted time-cell">{r.time}</td><td><strong>{r.card}</strong><small className="cell-secondary">{r.holder}</small></td><td>{r.way} · {r.door}</td><td>{r.shift}</td><td><Pill tone={r.tone}>{r.label}</Pill>{r.note && <small className="cell-secondary">{r.note}</small>}</td></tr>)}</tbody></table>
      {state.rows && !rows.length && <div className="empty-state"><Icon name="history" size={26} /><strong>Chưa có lượt quẹt thẻ</strong><p>Lượt quẹt RFID tại ESP-C01 sẽ hiện ở đây.</p></div>}</div></section>;
}
