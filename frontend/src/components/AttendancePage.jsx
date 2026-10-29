import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { worksIn } from '../agency.js';

// #attendance (Prem, 30 Oct): every guard's attendance in the agency's "Attendances" headings, for every branch
// (card swipes and QR selfies alike). Server: functions/escortAPI/attendance.js. 📤 Export gives the same columns.
const COLUMNS = [
  ['Date', 'date'], ['Employee Name', 'vendorId'], ['Clock NO', 'clock'], ['Name', 'name'], ['Status', 'status'],
  ['Approval Status', 'approvalStatus'], ['Shift', 'shift'], ['Post Details', 'post'], ['Entry Time', 'entry'],
  ['Exit Time', 'exit'], ['IN Time', 'inTime'], ['Approved By', 'approvedBy'], ['Agency', 'agency'],
  ['Approved Time', 'approvedTime'], ['Designation', 'designation'], ['day', 'day'], ['month', 'month'], ['year', 'year'],
  ['Added User', 'addedUser'], ['Status', 'status2'], ['Status', 'active'], ['Added Time', 'addedTime'], ['ID', 'id'],
  ['Officelocation', 'office'], ['Added User', 'addedUser2']
];
const today = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);

export default function AttendancePage() {
  const [branches, setBranches] = useState([]);
  const [agencies, setAgencies] = useState([]);
  const [branch, setBranch] = useState('');
  const [agency, setAgency] = useState('');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [show, setShow] = useState('all'); // all · Present · Absent
  const [search, setSearch] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    api.getPosts().then(r => { setBranches(r.data.branches); setAgencies(r.data.agencies || []); if (r.data.branches[0]) setBranch(String(r.data.branches[0].ROWID)); })
      .catch(err => setError(err.message));
  }, []);
  // No auto-refresh: every load costs Data Store reads. Change a filter or press 🔄.
  async function load() {
    if (!branch) return;
    setError(''); setNote(''); setData(null);
    try { setData((await api.attendance(branch, agency, from, to)).data); } catch (err) { setError(err.message); setData({ rows: [] }); }
  }
  useEffect(() => { load(); }, [branch, agency, from, to]); // eslint-disable-line react-hooks/exhaustive-deps

  const branchAgencies = agencies.filter(a => (a.is_active === true || a.is_active === 'true') && worksIn(a, branch));
  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return ((data && data.rows) || []).filter(r => (show === 'all' || r.status === show)
      && (!s || [r.name, r.clock, r.vendorId, r.post].some(v => String(v).toLowerCase().includes(s))));
  }, [data, show, search]);
  const count = k => ((data && data.rows) || []).filter(r => k === 'all' || r.status === k).length;

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
    a.download = 'Attendances-' + (b ? b.branch_name : '') + '-' + from + (to !== from ? '-to-' + to : '') + '.xlsx';
    a.click();
    URL.revokeObjectURL(a.href);
    setNote('📤 Exported ' + rows.length + ' row(s).');
  }

  return (
    <>
      <div className="titlebar"><h1>🗓️ Attendances</h1></div>
      <div className="toolbar no-print at-tools">
        <select value={branch} onChange={e => { setBranch(e.target.value); setAgency(''); }} aria-label="Branch">
          {branches.map(b => <option key={b.ROWID} value={b.ROWID}>{b.branch_name} · {b.city}</option>)}
        </select>
        <select value={agency} onChange={e => setAgency(e.target.value)} aria-label="Agency">
          <option value="">All agencies</option>
          {branchAgencies.map(a => <option key={a.ROWID} value={a.ROWID}>{a.agency_name}</option>)}
        </select>
        <label>From <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} /></label>
        <label>To <input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} /></label>
        <input className="pd-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Name, Clock NO, post" />
        <button className="btn secondary" onClick={load}>🔄</button>
        <button className="btn" onClick={exportXlsx} disabled={!rows.length}>📤 Export Excel</button>
      </div>
      <div className="dash">
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
                      <td key={i} className={k === 'vendorId' ? 'at-vendor' : k === 'status' ? (r.status === 'Present' ? 'at-present' : 'at-absent') : ''}>{r[k]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
