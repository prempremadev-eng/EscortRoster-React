import { useCallback, useEffect, useMemo, useState } from 'react';
import AttendanceMonth from './AttendanceMonth.jsx';
import { api } from '../api.js';
import { worksIn } from '../agency.js';

// #attendance (Prem, 30 Oct): every guard's attendance in the agency's "Attendances" headings, for every branch
// (card swipes and QR selfies alike). Server: functions/escortAPI/attendance.js. 📤 Export gives the same columns.
const COLUMNS = [
  // Approval Status / Approved By / Approved Time, the empty Status, Added Time and ID dropped (Prem, 3 Nov).
  ['Date', 'date'], ['Employee No', 'vendorId'], ['Clock NO', 'clock'], ['Name', 'name'], ['Status', 'status'],
  ['Shift', 'shift'], ['Swap', 'swap'], ['Post Details', 'post'], ['Entry Time', 'entry'],
  ['Exit Time', 'exit'], ['Work Hours', 'inTime'], ['Agency', 'agency'], ['Designation', 'designation'],
  ['Added User', 'addedUser'], ['Status', 'active'], ['Officelocation', 'office'], ['Added User', 'addedUser2']
];
const today = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);

export default function AttendancePage() {
  const [branches, setBranches] = useState([]);
  const [agencies, setAgencies] = useState([]);
  // All states, cities, branches, agencies on one page (Prem, 30 Oct); '' = All. Picking a state narrows the cities, etc.
  const [state, setState] = useState('');
  const [city, setCity] = useState('');
  const [branch, setBranch] = useState('');
  const [agency, setAgency] = useState('');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [show, setShow] = useState('all'); // all · Present · Absent
  // 📋 Day list or 📅 Month grid (Prem, 5 Nov); remembered on this computer.
  const [view, setViewRaw] = useState(() => { try { return localStorage.getItem('at-view') || 'day'; } catch { return 'day'; } });
  const setView = v => { setViewRaw(v); try { localStorage.setItem('at-view', v); } catch { /* private mode */ } };
  const [search, setSearch] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    api.getPosts().then(r => { setBranches(r.data.branches); setAgencies(r.data.agencies || []); })
      .catch(err => setError(err.message));
  }, []);
  // No auto-refresh: every load costs Data Store reads. Only the dates load again; the other filters work on the page.
  async function load() {
    setError(''); setNote(''); setData(null);
    try { setData((await api.attendance('', '', from, to)).data); } catch (err) { setError(err.message); setData({ rows: [] }); }
  }
  useEffect(() => { if (view === 'day') load(); }, [from, to, view]); // eslint-disable-line react-hooks/exhaustive-deps

  const uniq = list => [...new Set(list.filter(Boolean))].sort();
  const states = uniq(branches.map(b => b.state));
  const cities = uniq(branches.filter(b => !state || b.state === state).map(b => b.city));
  const shownBranches = branches.filter(b => (!state || b.state === state) && (!city || b.city === city));
  const shownAgencies = agencies.filter(a => (a.is_active === true || a.is_active === 'true') && (branch ? worksIn(a, branch) : shownBranches.some(b => worksIn(a, String(b.ROWID)))));
  // Rows for the place filters (state · city · branch · agency) and the search; the chips count these.
  const placed = useMemo(() => {
    const s = search.trim().toLowerCase();
    return ((data && data.rows) || []).filter(r => (!state || r.state === state) && (!city || r.city === city)
      && (!branch || r.branchId === branch) && (!agency || r.agencyId === agency)
      && (!s || [r.name, r.clock, r.vendorId, r.post].some(v => String(v).toLowerCase().includes(s))));
  }, [data, state, city, branch, agency, search]);
  // The Month grid uses the same place filters and search.
  const keep = useCallback(r => {
    const s = search.trim().toLowerCase();
    return (!state || r.state === state) && (!city || r.city === city) && (!branch || r.branchId === branch) && (!agency || r.agencyId === agency)
      && (!s || [r.name, r.clock, r.vendorId, r.team].some(v => String(v || '').toLowerCase().includes(s)));
  }, [state, city, branch, agency, search]);
  const rows = placed.filter(r => show === 'all' || r.status === show);
  const count = k => placed.filter(r => k === 'all' || r.status === k).length;

  // 📤 Excel with the same headings, in the order on screen.
  async function exportXlsx() {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Attendances');
    ws.addRow(COLUMNS.map(c => c[0])).font = { bold: true };
    rows.forEach(r => ws.addRow(COLUMNS.map(c => r[c[1]])));
    ws.columns.forEach((col, i) => { col.width = Math.max(10, COLUMNS[i][0].length + 2, ...rows.slice(0, 200).map(r => String(r[COLUMNS[i][1]] ?? '').length + 2)); });
    const b = branches.find(x => String(x.ROWID) === branch);
    const blob = new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'Attendances-' + (b ? b.branch_name : city || state || 'All') + '-' + from + (to !== from ? '-to-' + to : '') + '.xlsx';
    a.click();
    URL.revokeObjectURL(a.href);
    setNote('📤 Exported ' + rows.length + ' row(s).');
  }

  return (
    <>
      <div className="titlebar"><h1>🗓️ Attendances</h1></div>
      <div className="toolbar no-print at-tools">
        <div className="at-views" role="tablist">
          <button role="tab" aria-selected={view === 'day'} className={'btn' + (view === 'day' ? '' : ' secondary')} onClick={() => setView('day')}>📋 Day list</button>
          <button role="tab" aria-selected={view === 'month'} className={'btn' + (view === 'month' ? '' : ' secondary')} onClick={() => setView('month')}>📅 Month</button>
        </div>
        <select value={state} onChange={e => { setState(e.target.value); setCity(''); setBranch(''); setAgency(''); }} aria-label="State">
          <option value="">All states</option>
          {states.map(x => <option key={x} value={x}>{x}</option>)}
        </select>
        <select value={city} onChange={e => { setCity(e.target.value); setBranch(''); setAgency(''); }} aria-label="City">
          <option value="">All cities</option>
          {cities.map(x => <option key={x} value={x}>{x}</option>)}
        </select>
        <select value={branch} onChange={e => { setBranch(e.target.value); setAgency(''); }} aria-label="Branch">
          <option value="">All branches</option>
          {shownBranches.map(b => <option key={b.ROWID} value={b.ROWID}>{b.branch_name} · {b.city}</option>)}
        </select>
        <select value={agency} onChange={e => setAgency(e.target.value)} aria-label="Agency">
          <option value="">All agencies</option>
          {shownAgencies.map(a => <option key={a.ROWID} value={a.ROWID}>{a.agency_name}</option>)}
        </select>
        {view === 'day' && <label>From <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} /></label>}
        {view === 'day' && <label>To <input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} /></label>}
        <input className="pd-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Name, Clock NO, post" />
        {view === 'day' && <button className="btn secondary" onClick={load}>🔄</button>}
        {view === 'day' && <button className="btn" onClick={exportXlsx} disabled={!rows.length}>📤 Export Excel</button>}
      </div>
      {view === 'month' ? <div className="dash at-page"><AttendanceMonth keep={keep} filters={<>
        <select value={branch} onChange={e => { setBranch(e.target.value); setAgency(''); }} aria-label="Branch">
          <option value="">All branches</option>
          {shownBranches.map(b => <option key={b.ROWID} value={b.ROWID}>{b.branch_name} · {b.city}</option>)}
        </select>
        <select value={agency} onChange={e => setAgency(e.target.value)} aria-label="Agency">
          <option value="">All agencies</option>
          {shownAgencies.map(a => <option key={a.ROWID} value={a.ROWID}>{a.agency_name}</option>)}
        </select>
        <input className="am-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Name, Clock NO, team" />
      </>} /></div> : <div className="dash at-page">
        {error && <div className="trip-error">{error}</div>}
        {note && <div className="sim-push">{note}</div>}
        <div className="at-chips">
          {[['all', 'All'], ['Present', '✅ Present'], ['Absent', '❌ Absent']].map(([k, l]) => (
            <button key={k} className={'pd-chip pd-chip-sm' + (show === k ? ' pd-chip-primary' : '')} onClick={() => setShow(k)}>{l} {count(k)}</button>
          ))}
          <span className="sim-note">Present = IN that day (card or QR). Absent = on the published schedule, no IN.</span>
        </div>
        {!data && !error && <div className="loading-message">Loading...</div>}
        {data && rows.length === 0 && <div className="sim-note">No attendance for these dates.</div>}
        {rows.length > 0 && (
          <div className="dash-scroll">
            <table className="dash-table adm-table at-table">
              <thead><tr>{COLUMNS.map((c, i) => <th key={i}>{c[0]}</th>)}</tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.sortDay + r.clock + r.name + r.id}>
                    {COLUMNS.map(([, k], i) => (
                      <td key={i} className={k === 'vendorId' ? 'at-vendor' : k === 'swap' ? (r.swap ? 'at-swap' : '') : k === 'shift' && r.swap ? 'at-swap-shift' : k === 'status' ? (r.status === 'Present' ? 'at-present' : 'at-absent') : ''}>{r[k]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>}
    </>
  );
}
