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

const niceDate = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

// Screen 10: live board of one branch and one shift. A post opens in the inbox.
export default function SupervisorBoard() {
  const [branches, setBranches] = useState([]);
  const [branch, setBranch] = useState(() => remember('sup_branch', ''));
  const [shift, setShift] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const name = remember('sup_name', '');

  useEffect(() => {
    api.getPosts().then(r => {
      setBranches(r.data.branches);
      setBranch(cur => cur || (r.data.branches[0] ? String(r.data.branches[0].ROWID) : ''));
    }).catch(err => setError(err.message));
  }, []);

  // No timer (every load costs Data Store reads): refresh button and coming back to the tab.
  const load = useCallback(async () => {
    if (!branch) return;
    setError('');
    try {
      const d = (await api.supBoard(branch, shift)).data;
      setData(d);
      if (!shift) setShift(d.shift.code);
    } catch (err) {
      setError(err.message);
    }
  }, [branch, shift]);

  useEffect(() => { keep('sup_branch', branch); load(); }, [branch, load]);
  useEffect(() => {
    const onShow = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, [load]);

  function openPost(id) {
    keep('sup_open', id);
    window.location.hash = '#supervisor';
  }

  const b = branches.find(x => String(x.ROWID) === String(branch));
  const shifts = data ? data.shifts.slice().sort((x, y) => SHIFT_ORDER.indexOf(x.code) - SHIFT_ORDER.indexOf(y.code)) : [];

  return (
    <div className="pd sup">
      <Rail active="board" name={name} />
      <main className="sb">
        <div className="sb-head">
          <div>
            <div className="pd-muted pd-small">{b ? (b.company || 'Nokia') + ' ' + b.branch_name : ''}{data ? ' · ' + niceDate(data.date) : ''}</div>
            <div className="pd-title">Live posts{data ? ' · Shift ' + data.shift.code : ''}</div>
          </div>
          <div className="pd-grow"></div>
          <select className="pd-search sb-branch" value={branch} onChange={e => { setBranch(e.target.value); setShift(''); }} aria-label="Branch">
            {branches.map(x => <option key={x.ROWID} value={x.ROWID}>{x.branch_name}{x.area ? ' (' + x.area + ')' : ''} · {x.city}</option>)}
          </select>
          <div className="pd-quick">
            {shifts.map(s => <button key={s.code} className={'pd-chip' + (shift === s.code ? ' pd-chip-primary' : '')} onClick={() => setShift(s.code)}>Shift {s.code}</button>)}
          </div>
          <a className="pd-chip" href="#chart">Edit schedule</a>
          <button className="pd-icon-btn" onClick={load} aria-label="Refresh">{Icon.refresh}</button>
        </div>

        {error && <div className="pd-error-bar">{error}</div>}
        {!data && !error && <div className="pd-muted sup-pad">Loading...</div>}

        {data && (
          <div className="sb-body">
            <div className="sb-main">
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
