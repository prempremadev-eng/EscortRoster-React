import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';

// 📅 Monthly attendance (Prem, 5 Nov: "modern and easy to understand"). One row per guard, one cell per
// day: the shift letter on green = present, AB on red = absent (on the schedule, no IN), L = leave,
// WO = week off. Totals on the right; tap a cell for IN / OUT / hours. Server: attendance.js /attendanceMonth.
// The place filters and the search come from the Attendance page (`keep`).
const WD = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const thisMonth = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 7);
const nice = m => new Date(m + '-01T00:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
const shiftMonth = (m, n) => { const d = new Date(m + '-01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7); };
const hm = mins => Math.floor(mins / 60) + 'h ' + String(mins % 60).padStart(2, '0') + 'm';

export default function AttendanceMonth({ keep, filters }) {
  const [month, setMonth] = useState(thisMonth);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [pick, setPick] = useState(null); // { gid, d }

  useEffect(() => {
    setData(null); setError(''); setPick(null);
    api.attendanceMonth(month).then(r => setData(r.data)).catch(err => { setError(err.message); setData({ rows: [], days: 0 }); });
  }, [month]);

  const rows = useMemo(() => ((data && data.rows) || []).filter(keep), [data, keep]);
  const days = (data && data.days) || 0;
  const dayInfo = Array.from({ length: days }, (_, i) => {
    const date = month + '-' + String(i + 1).padStart(2, '0');
    return { d: i + 1, wd: new Date(date + 'T00:00:00Z').getUTCDay(), today: data && date === data.today };
  });
  const sum = rows.reduce((t, r) => ({ P: t.P + r.tot.P, AB: t.AB + r.tot.AB, L: t.L + r.tot.L, WO: t.WO + r.tot.WO, mins: t.mins + r.tot.mins }), { P: 0, AB: 0, L: 0, WO: 0, mins: 0 });
  const picked = pick && rows.find(r => r.gid === pick.gid);
  const pc = picked && picked.cells[pick.d - 1];

  async function exportXlsx() {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(nice(month));
    const head = ['S.No', 'Employee No', 'Clock NO', 'Name', 'Agency', 'Team / Post', ...dayInfo.map(x => String(x.d)), 'Present', 'Absent', 'Leave', 'Week off', 'Hours'];
    ws.addRow([nice(month) + ' · Attendance']).font = { bold: true, size: 14 };
    ws.addRow(head).font = { bold: true };
    const FILL = { P: 'FFDCFCE7', AB: 'FFFEE2E2', L: 'FFFEF3C7', WO: 'FFE5E7EB' };
    rows.forEach((r, i) => {
      const row = ws.addRow([i + 1, r.vendorId, r.clock, r.name, r.agency, r.team, ...r.cells.map(c => (c.s === 'P' ? c.c : c.s)), r.tot.P, r.tot.AB, r.tot.L, r.tot.WO, r.tot.hours]);
      r.cells.forEach((c, j) => { if (FILL[c.s]) row.getCell(7 + j).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL[c.s] } }; });
    });
    ws.columns.forEach((col, i) => { col.width = i < 6 ? [6, 18, 10, 22, 10, 16][i] : i < 6 + days ? 4.5 : 9; });
    const blob = new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'Attendance-' + month + '.xlsx';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="am">
      <div className="am-bar">
        <button className="btn secondary" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Month before">‹</button>
        <input type="month" value={month} onChange={e => e.target.value && setMonth(e.target.value)} aria-label="Month" />
        <button className="btn secondary" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month">›</button>
        <b className="am-title">{nice(month)}</b>
        {/* Branch + Agency right here too (Prem, 5 Nov); same filters as the page toolbar. */}
        {filters}
        <span className="spacer"></span>
        <button className="btn" onClick={exportXlsx} disabled={!rows.length}>📤 Excel</button>
      </div>

      {error && <div className="trip-error">{error}</div>}
      {!data && !error && <div className="loading-message">Loading...</div>}

      {data && (
        <div className="am-kpis">
          <div className="am-kpi"><small>Guards</small><b>{rows.length}</b></div>
          <div className="am-kpi am-k-p"><small>Present days</small><b>{sum.P}</b></div>
          <div className="am-kpi am-k-ab"><small>Absent</small><b>{sum.AB}</b></div>
          <div className="am-kpi am-k-l"><small>Leave</small><b>{sum.L}</b></div>
          <div className="am-kpi am-k-wo"><small>Week off</small><b>{sum.WO}</b></div>
          <div className="am-kpi"><small>Work hours</small><b>{hm(sum.mins)}</b></div>
        </div>
      )}

      {data && (
        <div className="am-legend">
          <span><i className="am-c am-P">A</i> Present (shift letter)</span>
          <span><i className="am-c am-P am-noout">A</i> Present, no OUT</span>
          <span><i className="am-c am-AB">AB</i> Absent</span>
          <span><i className="am-c am-L">L</i> Leave</span>
          <span><i className="am-c am-WO">WO</i> Week off</span>
          <span className="am-tip">Tap a day for IN · OUT · hours</span>
        </div>
      )}

      {picked && pc && (
        <div className="am-pick">
          <b>{picked.name}</b> · {pick.d} {nice(month).split(' ')[0]}:
          {pc.s === 'P' && <> ✅ Shift {pc.c}{pc.post ? ' · ' + pc.post : ''} · IN <b>{pc.in}</b> · OUT <b>{pc.out || '—'}</b>{pc.h ? ' · ' + hm(pc.h) : ' · no OUT'}</>}
          {pc.s === 'AB' && <> ❌ Absent · Shift {pc.c}{pc.post ? ' · ' + pc.post : ''} · no IN</>}
          {pc.s === 'L' && <> 🟡 Leave</>}
          {pc.s === 'WO' && <> ⚪ Week off</>}
          {!pc.s && <> No duty</>}
          <button className="am-x" onClick={() => setPick(null)} aria-label="Close">✕</button>
        </div>
      )}

      {data && rows.length === 0 && <div className="sim-note">No guards for these filters.</div>}
      {rows.length > 0 && (
        <div className="am-scroll">
          <table className="am-table">
            <thead>
              <tr>
                <th className="am-name">Guard</th>
                {dayInfo.map(x => <th key={x.d} className={'am-day' + (x.wd === 0 ? ' am-sun' : '') + (x.today ? ' am-today' : '')}><span>{WD[x.wd]}</span><b>{x.d}</b></th>)}
                <th className="am-tot am-k-p">P</th><th className="am-tot am-k-ab">AB</th><th className="am-tot am-k-l">L</th><th className="am-tot am-k-wo">WO</th><th className="am-tot">Hours</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.gid}>
                  <td className="am-name"><b>{r.name}</b><small>{[r.clock, r.team || r.agency].filter(Boolean).join(' · ')}</small></td>
                  {r.cells.map((c, j) => (
                    <td key={j} className={'am-cellwrap' + (dayInfo[j].wd === 0 ? ' am-sun' : '') + (dayInfo[j].today ? ' am-today' : '')}>
                      {c.s
                        ? <button className={'am-c am-' + c.s + (c.s === 'P' && !c.out ? ' am-noout' : '') + (pick && pick.gid === r.gid && pick.d === j + 1 ? ' on' : '')}
                          onClick={() => setPick({ gid: r.gid, d: j + 1 })} title={c.s === 'P' ? 'IN ' + c.in + ' · OUT ' + (c.out || '—') : c.s}>{c.s === 'P' ? c.c : c.s}</button>
                        : <span className={'am-c am-none' + (c.f ? ' am-future' : '')}>·</span>}
                    </td>
                  ))}
                  <td className="am-tot am-k-p"><b>{r.tot.P}</b></td>
                  <td className="am-tot am-k-ab"><b>{r.tot.AB || ''}</b></td>
                  <td className="am-tot am-k-l"><b>{r.tot.L || ''}</b></td>
                  <td className="am-tot am-k-wo"><b>{r.tot.WO || ''}</b></td>
                  <td className="am-tot am-hours">{r.tot.hours}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
