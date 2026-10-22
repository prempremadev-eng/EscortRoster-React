import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { Icon } from '../post/icons.jsx';
import Rail from './Rail.jsx';
import '../post/post.css';
import './supervisor.css';

const SHIFT_ORDER = ['A', 'G', 'B', 'C'];
const STATE = {
  on_duty: { label: 'On duty', cls: 'sb-green' },
  break: { label: 'On break', cls: 'sb-amber' },
  waiting: { label: 'IN, not taken over', cls: 'sb-amber' },
  empty: { label: 'Empty', cls: 'sb-red' },
  not_in: { label: 'Not IN', cls: 'sb-red' },
  due: { label: 'Due', cls: 'sb-grey' },
  none: { label: 'No guard', cls: 'sb-grey' }
};

function remember(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}
function keep(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // not remembered, fine
  }
}

// The branch this browser used last, if this login may see it; else the first one.
function pickBranch(list) {
  const last = String(remember('sup_branch', ''));
  return list.some(b => String(b.ROWID) === last) ? last : (list[0] ? String(list[0].ROWID) : '');
}

const niceDate = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

// Screen 10: live board of one branch and one shift. A post opens in the inbox.
export default function SupervisorBoard() {
  const [branches, setBranches] = useState([]);
  // Starts empty: the remembered branch is used only if it is in this login's area.
  const [branch, setBranch] = useState('');
  // '' = follow the running shift (Auto); a tapped tab pins that shift.
  const [shift, setShift] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getPosts().then(r => {
      setBranches(r.data.branches);
      setBranch(pickBranch(r.data.branches));
    }).catch(err => setError(err.message));
  }, []);

  // No timer (every load costs Data Store reads): refresh button and coming back to the tab.
  const load = useCallback(async () => {
    if (!branch) return;
    setError('');
    try {
      const d = (await api.supBoard(branch, shift)).data;
      setData(d);
    } catch (err) {
      setError(err.message);
    }
  }, [branch, shift]);

  useEffect(() => { if (branch) keep('sup_branch', branch); load(); }, [branch, load]);
  useEffect(() => {
    const onShow = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, [load]);

  // Auto: one reload at the next shift start (A / B / C), so the board moves on by itself without polling.
  useEffect(() => {
    if (shift || !data) return undefined;
    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    const starts = data.shifts.filter(s => s.code !== 'G' && s.start).map(s => Number(s.start.slice(0, 2)) * 60 + Number(s.start.slice(3, 5)));
    if (!starts.length) return undefined;
    const next = starts.map(t => (t - mins + 1440) % 1440 || 1440).sort((a, b) => a - b)[0];
    const t = setTimeout(load, (next * 60 - now.getSeconds() + 5) * 1000);
    return () => clearTimeout(t);
  }, [shift, data, load]);

  function openPost(id) {
    if (!id) { window.location.hash = '#'; return; } // an escort line opens the escort duty sheet
    keep('sup_open', id);
    window.location.hash = '#supervisor';
  }

  const b = branches.find(x => String(x.ROWID) === String(branch));
  const escortView = !!(data && data.view === 'escort');
  const shifts = data ? data.shifts.slice().sort((x, y) => SHIFT_ORDER.indexOf(x.code) - SHIFT_ORDER.indexOf(y.code)) : [];

  return (
    <div className="pd sup">
      <Rail active="board" />
      <main className="sb">
        <div className="sb-head">
          <div>
            <div className="pd-muted pd-small">{b ? (b.company || 'Nokia') + ' ' + b.branch_name : ''}{data ? ' · ' + niceDate(data.date) : ''}</div>
            <div className="pd-title">{escortView ? 'Live escorts · 6 to 5 and 9 to 6' : 'Live posts' + (data ? ' · Shift ' + data.shift.code : '')}</div>
          </div>
          <div className="pd-grow"></div>
          <select className="pd-search sb-branch" value={branch} onChange={e => { setBranch(e.target.value); setShift(''); }} aria-label="Branch">
            {branches.map(x => <option key={x.ROWID} value={x.ROWID}>{x.branch_name}{x.area ? ' (' + x.area + ')' : ''} · {x.city}</option>)}
          </select>
          <div className="pd-quick">
            <button className={'pd-chip' + (!shift ? ' pd-chip-primary' : '')} onClick={() => setShift('')} title="Follow the running shift">Auto{!shift && data ? ' · ' + data.shift.code : ''}</button>
            {shifts.map(s => <button key={s.code} className={'pd-chip' + (shift === s.code ? ' pd-chip-primary' : '')} onClick={() => setShift(s.code)}>Shift {s.code}</button>)}
            <button className={'pd-chip' + (shift === 'ESCORT' ? ' pd-chip-primary' : '')} onClick={() => setShift('ESCORT')} title="Escort: 6 to 5 and 9 to 6">🚗 Escort</button>
          </div>
          <a className="pd-chip" href="#schedule">Edit schedule</a>
          <button className="pd-icon-btn" onClick={load} aria-label="Refresh">{Icon.refresh}</button>
        </div>

        {error && <div className="pd-error-bar">{error}</div>}
        {!data && !error && <div className="pd-muted sup-pad">Loading...</div>}

        {data && (
          <div className="sb-body">
            <div className="sb-main">
              {!escortView && <>
              <div className="sb-kpis">
                <div className="sb-kpi"><div>Total posts</div><b>{data.kpi.total}</b></div>
                <div className="sb-kpi sb-kpi-green"><div>On duty</div><b>{data.kpi.onDuty}</b></div>
                <div className="sb-kpi sb-kpi-amber"><div>IN, not taken over</div><b>{data.kpi.waiting}</b></div>
                <div className="sb-kpi sb-kpi-red"><div>Guard not IN</div><b>{data.kpi.notIn}</b></div>
              </div>
              <div className="sb-grid">
                {data.posts.map(p => (
                  <button key={p.ROWID} className={'sb-card ' + STATE[p.state].cls} onClick={() => openPost(p.ROWID)}>
                    <div className="pd-row-between"><b>{p.name}</b><span className="sb-label">{STATE[p.state].label}</span></div>
                    <div className="sb-guard">{p.guard || '—'}</div>
                    <div className="pd-small pd-muted">{p.meta}</div>
                  </button>
                ))}
                {data.posts.length === 0 && <div className="pd-muted">No posts in this branch. Add them in Posts.</div>}
              </div>
              </>}
              {escortView && !data.escort && <div className="pd-muted">No escort duty today (Saturday / Sunday, or no month roster).</div>}
              {escortView && data.escort && (
                <div className="sb-kpis">
                  <div className="sb-kpi"><div>Escorts today</div><b>{data.escort.kpi.total}</b></div>
                  <div className="sb-kpi sb-kpi-green"><div>IN</div><b>{data.escort.kpi.in}</b></div>
                  <div className="sb-kpi sb-kpi-amber"><div>On trip now</div><b>{data.escort.kpi.onTrip}</b></div>
                  <div className="sb-kpi sb-kpi-red"><div>Not IN</div><b>{data.escort.kpi.notIn}</b></div>
                </div>
              )}
              {escortView && data.escort && (
                <>
                  <div className="pd-label">6 TO 5 (starts 18:00) · 9 TO 6 (starts 21:00)</div>
                  <div className="sb-grid">
                    {data.escort.rows.map(r => (
                      <button key={r.batch + r.seat} className={'sb-card ' + STATE[r.state].cls} onClick={() => openPost('')}>
                        <div className="pd-row-between"><b>S.No {r.seat} · {r.batch}</b><span className="sb-label">{r.state === 'on_duty' && r.meta.startsWith('On trip') ? 'On trip' : STATE[r.state].label}</span></div>
                        <div className="sb-guard">{r.name}</div>
                        <div className="pd-small pd-muted">{r.meta}</div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <aside className="sb-side">
              <div className="pd-label">NEEDS ATTENTION</div>
              {data.attention.length === 0 && <div className="pd-muted pd-small">All good right now.</div>}
              {data.attention.map((a, i) => (
                <button key={i} className={'sb-att sb-att-' + a.level} onClick={() => openPost(a.postId)}>
                  <b>{a.post}</b>
                  <span className="pd-small">{a.text}</span>
                </button>
              ))}
              <div className="pd-label sb-gap">LATEST WORK UPDATES</div>
              {data.works.length === 0 && <div className="pd-muted pd-small">No works today.</div>}
              {data.works.map(w => (
                <button key={w.ROWID} className="sb-att" onClick={() => openPost(w.postId)}>
                  <b>{w.post} · {w.contractor}</b>
                  <span className="pd-small pd-muted">{w.persons} persons · {w.started}{w.finished ? ' – ' + w.finished : ' · in progress'}</span>
                </button>
              ))}
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
