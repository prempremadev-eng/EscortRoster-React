import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { shortDate, plusDay } from '../utils.js';

// Duty History (read only, replaces the weekly Duty Chart page): one day of one branch, every guard with
// team, roster letter, post or escort seat, card IN / OUT and a status. Nothing can be changed here.
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const STATUS_CLS = { Present: 'dh-ok', Late: 'dh-late', Absent: 'dh-bad', 'Week off': 'dh-off', Leave: 'dh-leave', 'Not yet': 'dh-muted', 'No post': 'dh-muted', 'No roster': 'dh-muted' };
const STATUS_ORDER = ['Present', 'Late', 'Absent', 'Not yet', 'Leave', 'Week off', 'No post', 'No roster'];

function remember(k, fallback) {
  try { const v = localStorage.getItem(k); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
}

export default function DutyHistory() {
  const [branches, setBranches] = useState([]);
  const [branch, setBranch] = useState('');
  const [date, setDate] = useState(today);
  const [data, setData] = useState(null);
  const [agency, setAgency] = useState('');
  const [team, setTeam] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.getPosts().then(r => {
      const b = r.data.branches;
      setBranches(b);
      const last = String(remember('sup_branch', ''));
      setBranch(b.some(x => String(x.ROWID) === last) ? last : (b[0] ? String(b[0].ROWID) : ''));
    }).catch(err => setError(err.message));
  }, []);

  // One load per date (no timer): every load costs Data Store reads.
  const load = useCallback(async () => {
    if (!branch || !date) return;
    setError('');
    setData(null);
    try {
      setData((await api.dutyHistory(branch, date)).data);
    } catch (err) {
      setError(err.message);
    }
  }, [branch, date]);
  useEffect(() => { load(); }, [load]);

  const rows = data ? data.rows : [];
  // "All my branches" (city / state / super admin): one table with a Branch column.
  const many = branch === 'ALL';
  // Agency (IPF / ISS / BSS …) → its teams → status chips count inside that choice.
  const agencies = [...new Set(rows.map(r => r.agency).filter(Boolean))].sort();
  const teams = [...new Set(rows.filter(r => !agency || r.agency === agency).map(r => r.team).filter(Boolean))];
  const base = useMemo(() => rows.filter(r => (!agency || r.agency === agency) && (!team || r.team === team)
    && (!q.trim() || (r.name + ' ' + r.id + ' ' + r.post + ' ' + (r.branch || '')).toLowerCase().includes(q.trim().toLowerCase()))), [rows, agency, team, q]);
  const count = s => base.filter(r => r.status === s).length;
  const shown = useMemo(() => base.filter(r => !status || r.status === status), [base, status]);

  return (
    <>
      <div className="titlebar">
        <h1>📖 Duty History</h1>
      </div>

      <div className="toolbar no-print">
        <div className="tb-date">
          <button className="btn secondary tb-day" onClick={() => setDate(d => plusDay(d, -1))} aria-label="Previous day">‹</button>
          <b className="tb-day-text">{shortDate(date)}</b>
          <button className="btn secondary tb-day" onClick={() => setDate(d => plusDay(d, 1))} aria-label="Next day">›</button>
          <input type="date" value={date} onChange={e => e.target.value && setDate(e.target.value)} aria-label="Pick a date" />
        </div>
        {branches.length > 1 && (
          <select value={branch} onChange={e => setBranch(e.target.value)} aria-label="Branch">
            <option value="ALL">All my branches ({branches.length})</option>
            {branches.map(b => <option key={b.ROWID} value={b.ROWID}>{b.branch_name} · {b.city}</option>)}
          </select>
        )}
        <div className="spacer"></div>
        <button className="btn secondary" onClick={() => window.print()}>🖨️ Print</button>
        <button className="btn" onClick={load}>🔄 Refresh</button>
      </div>

      <div className="dash">
        {error && <div className="trip-error">{error}</div>}
        {!data && !error && <div className="loading-message">Loading...</div>}
        {data && (
          <>
            <div className="dh-chips no-print">
              <button className={'dh-chip' + (!status ? ' on' : '')} onClick={() => setStatus('')}>All <b>{base.length}</b></button>
              {STATUS_ORDER.filter(count).map(s => (
                <button key={s} className={'dh-chip ' + STATUS_CLS[s] + (status === s ? ' on' : '')} onClick={() => setStatus(status === s ? '' : s)}>{s} <b>{count(s)}</b></button>
              ))}
            </div>
            <div className="master-filters no-print">
              <label>Agency
                <select value={agency} onChange={e => { setAgency(e.target.value); setTeam(''); }}>
                  <option value="">All agencies</option>
                  {agencies.map(a => <option key={a}>{a}</option>)}
                </select>
              </label>
              <label>Team
                <select value={team} onChange={e => setTeam(e.target.value)}>
                  <option value="">All teams</option>
                  {teams.map(t => <option key={t}>{t}</option>)}
                </select>
              </label>
              <label className="master-search">Search name / ID / post
                <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Name, P code or post" />
              </label>
            </div>
            <div className="dash-range-label">{date.split('-').reverse().join('-')} · read only (from the Month Roster, the published Schedule and the card swipes)</div>
            <div className="dash-scroll">
              <table className="dash-table dh-table">
                <thead>
                  <tr><th>S.No</th>{many && <th>Branch</th>}<th>Name</th><th>ID</th><th>Agency</th><th>Team</th><th>Roster</th><th>Post</th><th>Shift</th><th>IN</th><th>OUT</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {shown.map((r, i) => (
                    <tr key={r.branch + r.id + r.name}>
                      <td>{i + 1}</td>
                      {many && <td className="left">{r.branch}</td>}
                      <td className="left"><b>{r.name}</b></td>
                      <td>{r.id}</td>
                      <td>{r.agency}</td>
                      <td>{r.team}</td>
                      <td>{r.roster || '—'}</td>
                      <td className="left">{r.post || '—'}</td>
                      <td>{r.shift || '—'}</td>
                      <td>{r.in || '—'}</td>
                      <td>{r.out || '—'}</td>
                      <td><span className={'dh-status ' + (STATUS_CLS[r.status] || '')}>{r.status}</span></td>
                    </tr>
                  ))}
                  {shown.length === 0 && <tr><td colSpan={many ? 12 : 11} className="dash-empty">Nobody matches.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </>
  );
}
