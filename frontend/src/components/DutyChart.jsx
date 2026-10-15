import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';

// Monday of the week `from` is in (default: today in India), moved by `offsetWeeks`.
// Charts run Monday → Sunday.
function monday(offsetWeeks, from) {
  const d = new Date((from || new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10)) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 7 * (offsetWeeks || 0));
  return d.toISOString().slice(0, 10);
}

const fmt = date => new Date(date + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

// Sunday of the week that starts on `week` (Monday).
function weekEnd(week) {
  const d = new Date(week + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 6);
  return fmt(d.toISOString().slice(0, 10));
}

// Week by week: for one branch, which post and which shift each guard has.
// Every change saves at once (one row per guard per week). "📋 Copy last week" fills the
// guards who have nothing yet with what they had last week.
export default function DutyChart() {
  const [week, setWeek] = useState(() => monday(0));
  const [branch, setBranch] = useState('');
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading');
  const [rowState, setRowState] = useState({});
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  // No auto-refresh: every load costs Data Store reads. Use 🔄 instead.
  const load = useCallback(async () => {
    setStatus('loading');
    setError('');
    try {
      const d = (await api.getChart(week, branch)).data;
      setData(d);
      if (!branch) setBranch(d.branchId);
      setRowState({});
      setStatus('ok');
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }, [week, branch]);

  useEffect(() => { load(); }, [load]);

  const chartOf = g => (data ? data.chart.find(c => String(c.guard_id) === String(g.ROWID)) : null);
  const postById = id => data && data.posts.find(p => String(p.ROWID) === String(id));

  async function save(g, postId, shiftCode) {
    const key = String(g.ROWID);
    setRowState(s => ({ ...s, [key]: 'saving' }));
    setError('');
    setNote('');
    try {
      const saved = (await api.saveChart({ guard_id: g.ROWID, week, post_id: postId, shift_code: shiftCode })).data;
      setData(d => ({
        ...d,
        chart: [...d.chart.filter(c => String(c.guard_id) !== key), ...(saved ? [{ ...saved, guard_id: g.ROWID }] : [])]
      }));
      setRowState(s => ({ ...s, [key]: 'saved' }));
    } catch (err) {
      setError(g.guard_name + ': ' + err.message);
      setRowState(s => ({ ...s, [key]: 'failed' }));
    }
  }

  // Picking a post without a shift waits for the shift (and the other way round).
  function change(g, field, value) {
    const c = chartOf(g) || {};
    const next = { post_id: c.post_id || '', shift_code: c.shift_code || '', [field]: value };
    if (field === 'post_id' && !value) return save(g, '', '');
    if (next.post_id && next.shift_code) return save(g, next.post_id, next.shift_code);
    // Only one of the two picked: keep it on screen until the other is picked.
    setData(d => ({
      ...d,
      chart: [...d.chart.filter(x => String(x.guard_id) !== String(g.ROWID)), { guard_id: g.ROWID, ...next, draft: true }]
    }));
  }

  async function copyLastWeek() {
    setError('');
    setNote('');
    try {
      const { copied } = (await api.copyChart(week, branch)).data;
      setNote(copied ? '📋 Copied ' + copied + ' guard(s) from last week.' : 'Nothing to copy: last week is empty, or every guard already has a duty this week.');
      if (copied) load();
    } catch (err) {
      setError(err.message);
    }
  }

  const thisWeek = monday(0);
  const assigned = data ? data.chart.filter(c => !c.draft).length : 0;
  const branchLabel = b => b.branch_name + (b.area ? ' (' + b.area + ')' : '') + ' · ' + b.city;

  return (
    <>
      <div className="titlebar">
        <h1>📅 Duty Chart</h1>
      </div>

      <div className="toolbar no-print">
        <a className="btn secondary" href="#master">🛡️ Guard Master</a>
        <a className="btn secondary" href="#posts">📍 Posts</a>
        {data && (
          <div>
            <label htmlFor="c-branch">Branch:</label>
            <select id="c-branch" value={branch} onChange={e => setBranch(e.target.value)}>
              {data.branches.map(b => <option key={b.ROWID} value={b.ROWID}>{branchLabel(b)}</option>)}
            </select>
          </div>
        )}
        <div className="chart-week">
          <button className="btn secondary" onClick={() => setWeek(w => monday(-1, w))} title="Last week">◀</button>
          <span>{fmt(week)} – {weekEnd(week)}{week === thisWeek ? ' (this week)' : ''}</span>
          <button className="btn secondary" onClick={() => setWeek(w => monday(1, w))} title="Next week">▶</button>
        </div>
        <div className="spacer"></div>
        <button className="btn secondary" onClick={copyLastWeek}>📋 Copy last week</button>
        <button className="btn" onClick={load}>🔄 Refresh</button>
      </div>

      <div className="dash">
        {data && (
          <div className="chart-shifts">
            {data.shifts.map(sh => <span key={sh.code} className="chart-shift">Shift <b>{sh.code}</b> {sh.start}–{sh.end}</span>)}
          </div>
        )}
        {error && <div className="trip-error">{error}</div>}
        {note && <div className="sim-push">{note}</div>}
        {status === 'loading' && <div className="loading-message">Loading...</div>}
        {status === 'error' && !data && <div className="loading-message">Could not load. Check your connection and press Refresh.</div>}

        {status === 'ok' && (
          <>
            {data.posts.length === 0 && <div className="trip-error">This branch has no posts yet. Add them in 📍 Posts first.</div>}
            <div className="dash-scroll">
              <table className="dash-table">
                <thead>
                  <tr><th>ID</th><th>Guard</th><th>Post</th><th>Shift</th><th></th></tr>
                </thead>
                <tbody>
                  {data.guards.map(g => {
                    const c = chartOf(g) || {};
                    const post = postById(c.post_id);
                    const st = rowState[String(g.ROWID)];
                    return (
                      <tr key={g.ROWID} className={c.post_id && !c.draft ? '' : 'chart-empty'}>
                        <td>{g.id_number}</td>
                        <td className="left">{g.guard_name}{g.escort_id ? <div className="master-sub">🚐 on escort sheet</div> : null}</td>
                        <td>
                          <select id={'c-post-' + g.ROWID} value={c.post_id || ''} onChange={e => change(g, 'post_id', e.target.value)}>
                            <option value="">⏳ Not assigned</option>
                            {data.posts.map(p => <option key={p.ROWID} value={p.ROWID}>{(p.post_type === 'ESCORT' ? '🚐 ' : '📍 ') + p.post_name}</option>)}
                          </select>
                        </td>
                        <td>
                          <select id={'c-shift-' + g.ROWID} value={c.shift_code || ''} disabled={!c.post_id} onChange={e => change(g, 'shift_code', e.target.value)}>
                            <option value="">Pick</option>
                            {data.shifts.map(sh => <option key={sh.code} value={sh.code}>{sh.code} ({sh.start}–{sh.end})</option>)}
                          </select>
                        </td>
                        <td className="chart-state">
                          {st === 'saving' ? '⏳' : st === 'failed' ? '❌' : st === 'saved' ? '✅' : c.draft ? 'Pick shift' : ''}
                          {post && post.post_type === 'ESCORT' && !g.escort_id ? ' ⚠️ not on escort sheet' : ''}
                        </td>
                      </tr>
                    );
                  })}
                  {data.guards.length === 0 && <tr><td colSpan="5">No active guards in this branch.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="dash-legend">{assigned} of {data.guards.length} guards have a duty this week. Each change saves at once.</div>
          </>
        )}
      </div>
    </>
  );
}
