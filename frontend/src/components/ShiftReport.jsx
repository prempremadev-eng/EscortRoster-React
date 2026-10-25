import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAgencyPick } from '../agencyPick.js';
import { shortDate, plusDay } from '../utils.js';
import useFullView from './useFullView.js';

// Shift Report (read only): what the supervisor reports to the branch admin for one day. Per shift:
// allotted, posts, filled, present, late, absent, spare, vacant; then the lists behind the numbers.
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
function remember(k, fallback) {
  try { const v = localStorage.getItem(k); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
}

const LISTS = [
  { key: 'vacant', title: '🔴 Vacant posts (no guard scheduled)', cols: ['Shift', 'Post'], row: x => [x.shift, x.post] },
  { key: 'absent', title: '🔴 Absent (post / seat, no card IN)', cols: ['Name', 'ID', 'Team', 'Shift', 'Post'], row: x => [x.name, x.id, x.team, x.shift, x.post] },
  { key: 'late', title: '⏰ Late (IN after the shift start)', cols: ['Name', 'ID', 'Team', 'Shift', 'Post', 'IN'], row: x => [x.name, x.id, x.team, x.shift, x.post, x.in] },
  { key: 'leave', title: '🟨 Leave', cols: ['Name', 'ID', 'Team'], row: x => [x.name, x.id, x.team] },
  { key: 'spare', title: '⚪ Spare (on duty by the roster, no post)', cols: ['Name', 'ID', 'Team', 'Shift'], row: x => [x.name, x.id, x.team, x.shift] },
  { key: 'weekOff', title: '🟦 Week off', cols: ['Name', 'ID', 'Team'], row: x => [x.name, x.id, x.team] }
];

export default function ShiftReport() {
  const [branches, setBranches] = useState([]);
  const [branch, setBranch] = useState('');
  const [date, setDate] = useState(today);
  const [data, setData] = useState(null);
  const [full, toggleFull] = useFullView('full-' + 'ShiftReport');
  const [error, setError] = useState('');

  useEffect(() => {
    api.getPosts().then(r => {
      const b = r.data.branches;
      setBranches(b);
      setAgencies(r.data.agencies || []);
      const last = String(remember('sup_branch', ''));
      setBranch(b.some(x => String(x.ROWID) === last) ? last : (b[0] ? String(b[0].ROWID) : ''));
    }).catch(err => setError(err.message));
  }, []);

  // One load per date (no timer): every load costs Data Store reads.
  const [agencies, setAgencies] = useState([]);
  const { pickAgency, branchAgencies, ag, chooseAgency } = useAgencyPick(branch, agencies);
  const load = useCallback(async () => {
    if (!branch || !date) return;
    setError('');
    setData(null);
    try {
      setData((await api.shiftReport(branch, date, ag)).data);
    } catch (err) {
      setError(err.message);
    }
  }, [branch, date, ag]);
  useEffect(() => { load(); }, [load]);

  const many = branch === 'ALL';
  const b = branches.find(x => String(x.ROWID) === String(branch));
  const shifts = data ? data.shifts.filter(s => s.key !== 'off') : [];
  const off = data ? data.shifts.find(s => s.key === 'off') : null;
  const sum = k => shifts.reduce((n, s) => n + (s[k] || 0), 0);

  return (
    <>
      {full ? (
        <div className="full-bar no-print">
          <div className="full-date">{shortDate(date)}</div>
          <h1 className="full-title">📊 Shift Report</h1>
          <div className="full-btns">
            <button className="btn secondary" onClick={() => setDate(d => plusDay(d, -1))} aria-label="Previous day">‹</button>
            <button className="btn secondary" onClick={() => setDate(d => plusDay(d, 1))} aria-label="Next day">›</button>
            <button className="btn secondary" onClick={toggleFull} title="Show the buttons and filters">▾</button>
          </div>
        </div>
      ) : <>
      <div className="titlebar">
        <h1>📊 Shift Report</h1>
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
            {branches.map(x => <option key={x.ROWID} value={x.ROWID}>{x.branch_name} · {x.city}</option>)}
          </select>
        )}
        {pickAgency && branchAgencies.length > 0 && (
            <select value={ag} onChange={e => chooseAgency(e.target.value)} aria-label="Agency">
              {branchAgencies.map(a => <option key={a.ROWID} value={a.ROWID}>{a.agency_name}</option>)}
            </select>
          )}
        <div className="spacer"></div>
        <button className="btn secondary" onClick={() => window.print()}>🖨️ Print / PDF</button>
        <button className="btn" onClick={load}>🔄 Refresh</button>
        <button className="btn secondary" onClick={toggleFull} title="Hide the buttons and filters (full page)">▴</button>
      </div>
      </>}

      <div className={'dash' + (full ? ' dash-full' : '')}>
        {error && <div className="trip-error">{error}</div>}
        {!data && !error && <div className="loading-message">Loading...</div>}
        {data && (
          <>
            <div className="dash-range-label">
              {many ? 'All my branches' : (b ? (b.company || 'Nokia') + ' ' + b.branch_name : '')} · {date.split('-').reverse().join('-')} · read only
            </div>

            <div className="dash-scroll">
              <table className="dash-table sr-table">
                <thead>
                  <tr>
                    <th>Shift</th><th>Allot (roster)</th><th>Posts</th><th>Filled</th>
                    <th>✅ Present</th><th>⏰ Late</th><th>🔴 Absent</th><th>⏳ Not yet</th><th>⚪ Spare</th><th>🔴 Vacant posts</th>
                  </tr>
                </thead>
                <tbody>
                  {shifts.map(s => (
                    <tr key={s.key}>
                      <td className="left"><b>{s.label}</b></td>
                      <td>{s.allot}</td><td>{s.posts}</td><td>{s.filled}</td>
                      <td className="sr-ok">{s.present}</td>
                      <td className={s.late ? 'sr-late' : ''}>{s.late}</td>
                      <td className={s.absent ? 'sr-bad' : ''}>{s.absent}</td>
                      <td>{s.notYet}</td>
                      <td>{s.spare}</td>
                      <td className={s.vacant ? 'sr-bad' : ''}>{s.vacant}</td>
                    </tr>
                  ))}
                  <tr className="sr-total">
                    <td className="left">Total</td>
                    <td>{sum('allot')}</td><td>{sum('posts')}</td><td>{sum('filled')}</td>
                    <td>{sum('present')}</td><td>{sum('late')}</td><td>{sum('absent')}</td><td>{sum('notYet')}</td><td>{sum('spare')}</td><td>{sum('vacant')}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {off && <div className="sr-off">🟨 Leave <b>{off.leave}</b> · 🟦 Week off <b>{off.weekOff}</b></div>}

            <h2 className="dash-h2">Problems</h2>
            {LISTS.map(l => {
              const rows = data.problems[l.key] || [];
              return (
                <div key={l.key} className="sr-block">
                  <div className="sr-title">{l.title} · <b>{rows.length}</b></div>
                  {rows.length === 0 ? <div className="dash-empty">None.</div> : (
                    <div className="dash-scroll">
                      <table className="dash-table">
                        <thead><tr><th>#</th>{many && <th>Branch</th>}{l.cols.map(c => <th key={c}>{c}</th>)}</tr></thead>
                        <tbody>
                          {rows.map((x, i) => (
                            <tr key={i}><td>{i + 1}</td>{many && <td className="left">{x.branch}</td>}{l.row(x).map((v, j) => <td key={j} className={j === 0 ? 'left' : ''}>{v || '—'}</td>)}</tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </>
  );
}
