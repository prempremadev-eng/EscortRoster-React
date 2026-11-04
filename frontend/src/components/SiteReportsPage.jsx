import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { dutyDayStr } from '../utils.js';

// 📋 Site reports for the office (Prem, 5 Nov): parking and employee strength reports the guards send
// at fixed times. Day: every report post with its times (✅ sent, 🟡 late, 🔴 missed, ⏰ due now).
// Range: every report sent between two dates, with a graph of the headline number and Excel.
const STATE = { sent: ['✅', 'Sent'], late: ['🟡', 'Late'], missed: ['🔴', 'Missed'], due: ['⏰', 'Due now'], later: ['·', 'Later'] };
const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const nice = d => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

export default function SiteReportsPage() {
  const [mode, setMode] = useState('day');
  const [date, setDate] = useState(dutyDayStr());
  const [from, setFrom] = useState(addDays(dutyDayStr(), -6));
  const [to, setTo] = useState(dutyDayStr());
  const [postId, setPostId] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);

  const load = useCallback(async () => {
    setError('');
    setData(null);
    try {
      setData((await (mode === 'day' ? api.siteReports(date) : api.siteReports(from, to))).data);
    } catch (err) {
      setError(err.message);
    }
  }, [mode, date, from, to]);
  useEffect(() => { load(); }, [load]);

  const posts = data ? data.posts : [];
  const postOf = id => posts.find(p => p.id === id) || {};
  const typeOf = p => (data && data.types[p.type]) || { label: '', icon: '📋', sections: [], totals: [] };
  const count = s => posts.reduce((n, p) => n + p.slots.filter(x => x.state === s).length, 0);

  const rangeRows = data && mode === 'range'
    ? data.reports.filter(r => !postId || r.post === postId).sort((a, b) => a.date.localeCompare(b.date) || slotKey(a.slot) - slotKey(b.slot))
    : [];

  async function exportXlsx() {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    // One sheet per report post, columns = its fields, so the numbers line up by date and time.
    const byPost = {};
    rangeRows.forEach(r => { (byPost[r.post] = byPost[r.post] || []).push(r); });
    Object.keys(byPost).forEach(id => {
      const p = postOf(id);
      const t = typeOf(p);
      const fields = t.sections.flatMap(s => s.fields);
      const ws = wb.addWorksheet(String(p.name || id).replace(/[\\/*?:[\]]/g, '').slice(0, 31));
      const head = ['Date', 'Time', 'Sent at', 'By', ...fields.map(f => f.label), ...t.totals.map(x => x.label), 'Remarks'];
      ws.addRow(head).font = { bold: true };
      byPost[id].forEach(r => ws.addRow([r.date, r.slot, r.time, r.by, ...fields.map(f => r.values[f.k] || 0), ...r.totals.map(x => x[1]), r.remarks]));
      ws.columns.forEach((col, i) => { col.width = Math.max(8, String(head[i]).length + 2); });
    });
    if (!Object.keys(byPost).length) wb.addWorksheet('No reports');
    const blob = new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'Site-reports-' + from + '-to-' + to + '.xlsx';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <div className="titlebar"><h1>📋 Site Reports</h1></div>
      <div className="toolbar no-print srp-tools">
        <div className="srp-tabs">
          <button className={'btn' + (mode === 'day' ? '' : ' secondary')} onClick={() => setMode('day')}>Day</button>
          <button className={'btn' + (mode === 'range' ? '' : ' secondary')} onClick={() => setMode('range')}>History</button>
        </div>
        {mode === 'day' ? (
          <div className="srp-dates">
            <button className="btn secondary" onClick={() => setDate(addDays(date, -1))} aria-label="Day before">‹</button>
            <input type="date" value={date} onChange={e => e.target.value && setDate(e.target.value)} />
            <button className="btn secondary" onClick={() => setDate(addDays(date, 1))} aria-label="Next day">›</button>
          </div>
        ) : (
          <div className="srp-dates">
            <input type="date" value={from} onChange={e => e.target.value && setFrom(e.target.value)} aria-label="From" />
            <span>to</span>
            <input type="date" value={to} onChange={e => e.target.value && setTo(e.target.value)} aria-label="To" />
            <select value={postId} onChange={e => setPostId(e.target.value)} aria-label="Post">
              <option value="">All report posts</option>
              {posts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button className="btn secondary" onClick={exportXlsx} disabled={!rangeRows.length}>📤 Excel</button>
          </div>
        )}
        <div className="spacer"></div>
        <button className="btn" onClick={load}>🔄 Refresh</button>
      </div>

      <div className="srp">
        {error && <div className="setup-card bad">❌ {error}</div>}
        {!data && !error && <div className="loading-message">Loading...</div>}

        {data && !posts.length && (
          <div className="setup-card">No post sends a report yet. Post setup → edit a post → <b>📋 Report from this post</b>.</div>
        )}

        {data && mode === 'day' && posts.length > 0 && (
          <>
            <div className="srp-day">{nice(date)}{date === data.today ? ' · today' : ''}</div>
            <div className="srp-counts">
              {['sent', 'late', 'missed', 'due'].map(s => <span key={s} className={'srp-count srp-' + s}>{STATE[s][0]} {STATE[s][1]} <b>{count(s)}</b></span>)}
            </div>
            <div className="srp-grid">
              {posts.map(p => {
                const t = typeOf(p);
                return (
                  <section key={p.id} className="srp-card">
                    <div className="srp-card-head">
                      <span>{t.icon} <b>{p.name}</b></span>
                      <small>{t.label}{p.branch ? ' · ' + p.branch : ''}</small>
                    </div>
                    <div className="srp-slots">
                      {p.slots.map(s => (
                        <button key={s.slot} type="button" className={'srp-slot srp-' + s.state + (open === p.id + s.slot ? ' on' : '')}
                          onClick={() => s.report && setOpen(open === p.id + s.slot ? null : p.id + s.slot)} disabled={!s.report}>
                          <span>{s.slot}</span>
                          <b>{s.report ? s.report.total : STATE[s.state][0]}</b>
                          <small>{s.report ? (s.state === 'late' ? '🟡 ' : '') + s.report.time : STATE[s.state][1]}</small>
                        </button>
                      ))}
                    </div>
                    {p.slots.filter(s => open === p.id + s.slot && s.report).map(s => <Detail key={s.slot} t={t} r={s.report} />)}
                  </section>
                );
              })}
            </div>
          </>
        )}

        {data && mode === 'range' && posts.length > 0 && (
          <>
            {postId && <Chart rows={rangeRows} label={(typeOf(postOf(postId)).totals[0] || {}).label || 'Total'} />}
            <div className="tablewrap">
              <table className="srp-table">
                <thead><tr><th>Date</th><th>Time</th><th>Post</th><th>Totals</th><th>By</th><th>Sent</th><th></th></tr></thead>
                <tbody>
                  {rangeRows.length === 0 && <tr><td colSpan={7}>No reports in these dates.</td></tr>}
                  {rangeRows.map(r => {
                    const p = postOf(r.post);
                    return [
                      <tr key={r.ROWID} className="dash-trip" onClick={() => setOpen(open === r.ROWID ? null : r.ROWID)}>
                        <td>{nice(r.date)}</td><td>{r.slot}</td><td className="left">{typeOf(p).icon} {p.name}</td>
                        <td className="left">{r.totals.map(x => x[0] + ': ' + x[1]).join(' · ')}</td>
                        <td className="left">{r.by}</td><td>{r.time}</td><td>{open === r.ROWID ? '▾' : '▸'}</td>
                      </tr>,
                      open === r.ROWID && <tr key={r.ROWID + 'd'}><td colSpan={7}><Detail t={typeOf(p)} r={r} /></td></tr>
                    ];
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </>
  );
}

// 03:00 comes after 23:00 (same night).
function slotKey(slot) { const [h, m] = slot.split(':').map(Number); return (h < 4 ? 24 + h : h) * 60 + m; }

function Detail({ t, r }) {
  return (
    <div className="srp-detail">
      <div className="srp-detail-top">By <b>{r.by}</b> at {r.time}</div>
      {t.sections.map(sec => (
        <div key={sec.title} className="srp-sec">
          <div className="srp-sec-title">{sec.title}</div>
          <div className="srp-vals">{sec.fields.map(f => <span key={f.k}>{f.label}<b>{r.values[f.k] || 0}</b></span>)}</div>
        </div>
      ))}
      <div className="srp-vals srp-tot">{r.totals.map(x => <span key={x[0]}>{x[0]}<b>{x[1]}</b></span>)}</div>
      {Object.keys(r.values).filter(k => typeof r.values[k] === 'string' && r.values[k]).map(k => <div key={k} className="srp-note">🦺 {r.values[k]}</div>)}
      <div className="srp-note">{r.remarks || 'All area rounds checked, everything normal.'}</div>
    </div>
  );
}

// Headline number of one post over the dates, one bar per report (date + time under it).
function Chart({ rows, label }) {
  if (!rows.length) return null;
  const max = Math.max(1, ...rows.map(r => r.total || 0));
  return (
    <div className="srp-chart" role="img" aria-label={label + ' per report'}>
      <div className="srp-chart-title">{label}</div>
      <div className="srp-bars">
        {rows.map(r => (
          <div key={r.ROWID} className="srp-bar" title={r.date + ' ' + r.slot + ': ' + r.total}>
            <b>{r.total}</b>
            <span style={{ height: Math.max(4, (r.total / max) * 120) + 'px' }}></span>
            <small>{r.date.slice(8)}<br />{r.slot}</small>
          </div>
        ))}
      </div>
    </div>
  );
}
