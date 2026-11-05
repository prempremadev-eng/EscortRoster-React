import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';

// 📜 History log (Prem, 5 Nov): who changed what and when — publish, auto fill, roster upload / edits,
// posts, guards, logins. Admin + Branch Admin. Server: audit.js. Records are never deleted.
const ICON = {
  'Schedule published': '📢', 'Auto fill run': '⚡', 'Copied from yesterday': '📋', 'Day cleared': '🧹', 'Schedule changed': '✏️',
  'Month roster uploaded': '📤', 'Month roster row changed': '🗓️', 'Month roster changed': '🗓️',
  'Post created': '➕', 'Post edited': '✏️', 'Post deleted': '🗑️', 'Posts reordered': '↕️',
  'Guard added': '🧑‍✈️', 'Guard edited': '✏️', 'Guard switched on/off': '🔁', 'Guards imported': '📥', 'Branch imported': '📦',
  'Login added': '🔑', 'Login changed': '🔑', 'Login on/off': '🔑', 'Login deleted': '🔑', 'Branch saved': '🏢', 'Agency saved': '🏢'
};
const GROUPS = [['all', 'All'], ['sched', '📅 Schedule'], ['roster', '🗓️ Roster'], ['post', '📍 Posts'], ['guard', '🧑‍✈️ Guards'], ['login', '🔑 Logins & setup']];
const groupOf = a => (/Schedule|Auto fill|Copied|Day cleared/.test(a) ? 'sched' : /roster/i.test(a) ? 'roster' : /Post/.test(a) ? 'post' : /Guard/.test(a) ? 'guard' : 'login');
const today = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
const minus = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') - n * 86400000).toISOString().slice(0, 10);
const nice = d => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const ROLE = { supervisor: 'Supervisor', branch_admin: 'Branch Admin', city_admin: 'City Admin', state_admin: 'State Admin', admin: 'Admin', super_admin: 'Super Admin' };

export default function AuditLogPage() {
  const [from, setFrom] = useState(() => minus(today(), 6));
  const [to, setTo] = useState(today);
  const [group, setGroup] = useState('all');
  const [search, setSearch] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(() => new Set());

  const load = () => { setData(null); setError(''); api.auditLog(from, to).then(r => setData(r.data.rows)).catch(err => { setError(err.message); setData([]); }); };
  useEffect(load, [from, to]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (data || []).filter(r => (group === 'all' || groupOf(r.action) === group)
      && (!s || [r.who, r.action, r.target, r.branch].some(v => String(v || '').toLowerCase().includes(s))));
  }, [data, group, search]);
  const byDay = [];
  rows.forEach(r => { const d = String(r.at).slice(0, 10); const last = byDay[byDay.length - 1]; if (last && last.d === d) last.rows.push(r); else byDay.push({ d, rows: [r] }); });
  const toggle = id => setOpen(o => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  // New rows: { lines: ["Shifts: ABC → ABCG", …] } in words; the first test rows kept raw fields.
  const details = r => { try { const d = JSON.parse(r.details || '{}'); return Array.isArray(d.lines) ? d.lines : Object.entries(d).map(([k, v]) => k.replace(/_/g, ' ') + ': ' + v); } catch { return []; } };

  return (
    <>
      <div className="titlebar"><h1>📜 History log</h1></div>
      <div className="toolbar no-print al-tools">
        <label>From <input type="date" value={from} max={to} onChange={e => e.target.value && setFrom(e.target.value)} /></label>
        <label>To <input type="date" value={to} min={from} onChange={e => e.target.value && setTo(e.target.value)} /></label>
        <input className="pd-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Who, what, post, guard" />
        <span className="spacer"></span>
        <button className="btn" onClick={load}>🔄</button>
      </div>
      <div className="al">
        <div className="al-groups">
          {GROUPS.map(([k, label]) => (
            <button key={k} className={'pd-chip pd-chip-sm' + (group === k ? ' pd-chip-primary' : '')} onClick={() => setGroup(k)}>
              {label} {(data || []).filter(r => k === 'all' || groupOf(r.action) === k).length}
            </button>
          ))}
        </div>
        {error && <div className="trip-error">{error}</div>}
        {!data && !error && <div className="loading-message">Loading...</div>}
        {data && rows.length === 0 && <div className="sim-note">Nothing changed in these dates.</div>}
        {byDay.map(day => (
          <section key={day.d} className="al-day">
            <h3>{nice(day.d)}</h3>
            {day.rows.map(r => (
              <div key={r.ROWID} className="al-row">
                <button className="al-main" onClick={() => toggle(r.ROWID)}>
                  <span className="al-time">{String(r.at).slice(11, 16)}</span>
                  <span className="al-icon">{ICON[r.action] || '•'}</span>
                  <span className="al-what"><b>{r.action}</b>{r.target ? <span> · {r.target}</span> : null}</span>
                  <span className="al-who">{r.who}<small>{ROLE[r.role] || r.role}{r.branch ? ' · ' + r.branch : ''}</small></span>
                  <span className="al-more">{details(r).length ? (open.has(r.ROWID) ? '▾' : '▸ ' + details(r).length) : ''}</span>
                </button>
                {open.has(r.ROWID) && (
                  <ul className="al-details">
                    {details(r).length ? details(r).map((line, i) => <li key={i}>{line}</li>) : <li className="al-none">Nothing more to show.</li>}
                  </ul>
                )}
              </div>
            ))}
          </section>
        ))}
      </div>
    </>
  );
}
