import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useAgencyPick } from '../agencyPick.js';

// #roster: the agency's monthly shift chart (guard × day). Upload the Excel the agency sends,
// or tap a box to change one day. A/B/C/G = shift, O = week off, L = leave, - = nothing.
const CODES = ['A', 'B', 'C', 'G', 'O', 'L', '-'];
const LABEL = { A: 'Morning', B: 'Afternoon', C: 'Night', G: 'General', O: 'Week off', L: 'Leave', '-': 'Not set' };
const WD = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const thisMonth = () => new Date().toISOString().slice(0, 7);
const key = n => String(n || '').replace(/\(.*?\)/g, ' ').toUpperCase().replace(/[^A-Z0-9]/g, '');
const pad = (codes, days) => (String(codes || '') + '-'.repeat(days)).slice(0, days);

function remember(k, fallback) {
  try { const v = localStorage.getItem(k); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
}
function keep(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* not remembered, fine */ }
}

// Reads the agency Excel: finds the row of day numbers (1, 2, 3 …), then every row under it with a
// code in most day boxes. A person is matched by ID, then card (any format), then name.
// The sheet that matches the most guards wins.
function readRoster(XLSX, wb, guards, days) {
  const byId = new Map(guards.map(g => [String(g.id).toUpperCase(), g]));
  const byCard = new Map(guards.filter(g => g.card).map(g => [String(g.card).toUpperCase(), g]));
  const byName = new Map(guards.map(g => [key(g.name), g]));
  let best = null;
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' });
    let start = -1;
    for (const r of rows) {
      const i = r.findIndex((c, j) => Number(c) === 1 && Number(r[j + 1]) === 2 && Number(r[j + 2]) === 3);
      if (i >= 0) { start = i; break; }
    }
    if (start < 0) continue;
    const matched = new Map(), unmatched = [];
    for (const r of rows) {
      // Agency files write week off as "W/O" or "WO" (ISI, 27 Oct): read it as O.
      const cells = r.slice(start, start + days).map(c => String(c).trim().toUpperCase().replace(/^W\/?O$/, 'O'));
      if (cells.filter(c => CODES.includes(c) && c !== '-').length < Math.min(20, days - 5)) continue;
      const before = r.slice(0, start).map(c => String(c).trim());
      // Any agency's ID / card format (Prem, 26 Oct: ISI uses 024081, IPF P12345 and VEN-IP-…): a cell that
      // is a known ID or card wins, then the longest name-like cell.
      const pid = before.find(c => c && byId.has(c.toUpperCase()));
      const ven = before.find(c => c && byCard.has(c.toUpperCase()));
      const person = before.filter(c => /[A-Za-z]{2}/.test(c) && c !== pid && c !== ven && !/^VEN/i.test(c)).sort((a, b) => b.length - a.length)[0] || '';
      const g = (pid && byId.get(pid.toUpperCase())) || (ven && byCard.get(ven.toUpperCase())) || byName.get(key(person));
      const codes = cells.map(c => (CODES.includes(c) ? c : '-')).join('');
      if (g) matched.set(g.ROWID, { guard_id: g.ROWID, codes });
      else unmatched.push(person || pid || '?');
    }
    if (!best || matched.size > best.matched.size) best = { sheet: name, matched, unmatched };
  }
  return best;
}

export default function RosterPage({ initialMonth }) {
  const [branches, setBranches] = useState([]);
  const [branch, setBranch] = useState('');
  const [month, setMonth] = useState(() => (/^\d{4}-\d{2}$/.test(initialMonth || '') ? initialMonth : thisMonth()));
  const [data, setData] = useState(null);
  const [area, setArea] = useState('');
  const [q, setQ] = useState('');
  const [upload, setUpload] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [agencies, setAgencies] = useState([]);
  const { pickAgency, branchAgencies, ag, chooseAgency } = useAgencyPick(branch, agencies);

  useEffect(() => {
    api.getPosts().then(r => {
      const b = r.data.branches;
      setBranches(b);
      setAgencies(r.data.agencies || []);
      const last = String(remember('sup_branch', ''));
      setBranch(b.some(x => String(x.ROWID) === last) ? last : (b[0] ? String(b[0].ROWID) : ''));
    }).catch(err => setError(err.message));
  }, []);

  // About 2 reads per load; no timer.
  const load = useCallback(async () => {
    if (!branch || !month || (pickAgency && !ag)) return;
    setError('');
    try {
      setData((await api.roster(branch, month, ag)).data);
    } catch (err) {
      setError(err.message);
    }
  }, [branch, month, ag, pickAgency]);
  useEffect(() => { if (branch) keep('sup_branch', branch); setUpload(null); load(); }, [branch, load]);

  const days = data ? data.days : 0;
  const weekday = d => WD[new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7) - 1, d)).getUTCDay()];
  const areas = data ? [...new Set(data.guards.map(g => g.area).filter(Boolean))].sort() : [];
  const shown = useMemo(() => !data ? [] : data.guards.filter(g =>
    (!area || g.area === area) && (!q.trim() || (g.name + ' ' + g.id).toLowerCase().includes(q.trim().toLowerCase()))), [data, area, q]);
  const codesOf = g => pad(data.codes[g.ROWID], days);
  const filled = data ? data.guards.filter(g => data.codes[g.ROWID]).length : 0;

  async function pickFile(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file || !data) return;
    setError('');
    setNote('');
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer());
      // "IPF-Oct-2026 …" in the file name or title → that month.
      const m = (file.name + ' ' + wb.SheetNames.join(' ')).toUpperCase().match(/(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*[-\s_]*(20\d\d)/);
      const fileMonth = m ? m[2] + '-' + String(MONTHS.indexOf(m[1]) + 1).padStart(2, '0') : '';
      if (fileMonth && fileMonth !== month) {
        setMonth(fileMonth);
        setNote('This file is for ' + fileMonth + '. Switched to that month; pick the file again.');
        return;
      }
      const r = readRoster(XLSX, wb, data.guards, days);
      if (!r || !r.matched.size) throw new Error('No guard of this branch was found in the file.');
      setUpload({ file: file.name, ...r });
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveUpload() {
    setBusy(true);
    setError('');
    try {
      const r = (await api.rosterUpload(branch, month, [...upload.matched.values()], ag)).data;
      setNote('✅ Saved: ' + r.added + ' added, ' + r.replaced + ' replaced.');
      setUpload(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // Tap a box: next code (A → B → C → G → O → L → - → A).
  async function tap(g, day) {
    if (busy) return;
    const now = codesOf(g)[day - 1];
    const next = CODES[(CODES.indexOf(now) + 1) % CODES.length];
    setBusy(true);
    setError('');
    try {
      const r = (await api.rosterSet(branch, month, g.ROWID, day, next, ag)).data;
      setData(d => ({ ...d, codes: { ...d.codes, [g.ROWID]: r.codes } }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const dayCount = (d, c) => shown.filter(g => codesOf(g)[d - 1] === c).length;
  const dayNums = Array.from({ length: days }, (_, i) => i + 1);

  return (
    <>
      <div className="titlebar">
        <h1>📅 Month Roster</h1>
      </div>

      <div className="toolbar no-print">
        <div>
          <label htmlFor="r-branch">Branch:</label>
          <select id="r-branch" value={branch} onChange={e => setBranch(e.target.value)}>
            {branches.map(b => <option key={b.ROWID} value={b.ROWID}>{b.branch_name} · {b.city}</option>)}
          </select>
        </div>
        {pickAgency && branchAgencies.length > 0 && (
          <div>
            <label htmlFor="r-agency">Agency:</label>
            <select id="r-agency" value={ag} onChange={e => chooseAgency(e.target.value)}>
              {branchAgencies.map(a => <option key={a.ROWID} value={a.ROWID}>{a.agency_name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label htmlFor="r-month">Month:</label>
          <input id="r-month" type="month" value={month} onChange={e => e.target.value && setMonth(e.target.value)} />
        </div>
        <div className="spacer"></div>
        <label className="btn secondary">
          📤 Upload Excel
          <input type="file" accept=".xlsx,.xls,.csv" onChange={pickFile} hidden />
        </label>
        <button className="btn" onClick={load}>🔄 Refresh</button>
        <a className="btn" href="#schedule" title="Step 2: fill the daily schedule from this roster">Next: Schedule →</a>
      </div>

      <div className="dash">
        {error && <div className="trip-error">{error}</div>}
        {note && <div className="sim-push">{note}</div>}

        {upload && (
          <div className="master-form">
            <div className="master-form-title">📤 {upload.file} · sheet "{upload.sheet}"</div>
            <div><b>{upload.matched.size}</b> guards found for {month}. They replace what is saved for them; other guards stay.</div>
            {upload.unmatched.length > 0 && (
              <div className="master-sub">Not found in this branch ({upload.unmatched.length}): {upload.unmatched.join(' · ')}</div>
            )}
            <div className="link-actions">
              <button className="btn" onClick={saveUpload} disabled={busy}>{busy ? 'Saving...' : 'Save ' + upload.matched.size + ' guards'}</button>
              <button className="btn secondary" onClick={() => setUpload(null)}>Cancel</button>
            </div>
          </div>
        )}

        {!data && !error && <div className="loading-message">Loading...</div>}

        {data && (
          <>
            <div className="master-filters">
              <label>Area
                <select value={area} onChange={e => setArea(e.target.value)}>
                  <option value="">All areas</option>
                  {areas.map(a => <option key={a}>{a}</option>)}
                </select>
              </label>
              <label className="master-search">Search name / ID
                <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Name or P code" />
              </label>
            </div>
            <div className="rs-legend">
              {CODES.map(c => <span key={c}><span className={'rs-cell rs-' + (c === '-' ? 'none' : c)}>{c}</span> {LABEL[c]}</span>)}
              <span className="master-sub">· {filled} of {data.guards.length} guards have a roster this month{data.updated ? ' · last saved by ' + data.updated.by + ' ' + data.updated.at : ''} · tap a box to change it</span>
            </div>

            <div className="rs-scroll">
              <table className="rs-table">
                <thead>
                  <tr>
                    <th className="rs-sticky rs-no">#</th>
                    <th className="rs-sticky rs-name">Guard</th>
                    {dayNums.map(d => <th key={d} className={['Su', 'Sa'].includes(weekday(d)) ? 'rs-weekend' : ''}>{d}<div>{weekday(d)}</div></th>)}
                    <th>Work</th><th>Off</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((g, i) => {
                    const codes = codesOf(g);
                    return (
                      <tr key={g.ROWID}>
                        <td className="rs-sticky rs-no">{i + 1}</td>
                        <td className="rs-sticky rs-name"><b>{g.name}</b><div className="master-sub">{g.id}{g.area ? ' · ' + g.area : ''}</div></td>
                        {dayNums.map(d => {
                          const c = codes[d - 1];
                          return <td key={d}><button className={'rs-cell rs-' + (c === '-' ? 'none' : c)} onClick={() => tap(g, d)} disabled={busy} title={g.name + ' · ' + d + ' · ' + LABEL[c]}>{c === '-' ? '' : c}</button></td>;
                        })}
                        <td><b>{[...codes].filter(c => 'ABCG'.includes(c)).length}</b></td>
                        <td>{[...codes].filter(c => c === 'O' || c === 'L').length}</td>
                      </tr>
                    );
                  })}
                  {shown.length === 0 && <tr><td colSpan={days + 4}>No guards match.</td></tr>}
                </tbody>
                <tfoot>
                  {['A', 'B', 'C', 'G', 'O', 'L'].map(c => (
                    <tr key={c}>
                      <td className="rs-sticky rs-no"></td>
                      <td className="rs-sticky rs-name"><span className={'rs-cell rs-' + c}>{c}</span> {LABEL[c]}</td>
                      {dayNums.map(d => <td key={d}>{dayCount(d, c) || ''}</td>)}
                      <td></td><td></td>
                    </tr>
                  ))}
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>
    </>
  );
}
