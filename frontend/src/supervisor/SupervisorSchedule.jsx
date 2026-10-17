import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { Icon, initials } from '../post/icons.jsx';
import Rail from './Rail.jsx';
import '../post/post.css';
import './supervisor.css';

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

const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
function addDays(date, n) {
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return ymd(d);
}
const niceDate = date => new Date(date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const hours = s => s.start.slice(0, 2).replace(/^0/, '') + '–' + s.end.slice(0, 2).replace(/^0/, '');

// Screen 12: one day of one branch. Tap an empty slot, then a free guard. Tap a filled slot to
// empty it. "Publish to guards" makes the day's drafts the guards' duty for their card IN.
export default function SupervisorSchedule() {
  const [branches, setBranches] = useState([]);
  // Starts empty: the remembered branch is used only if it is in this login's area.
  const [branch, setBranch] = useState('');
  const [date, setDate] = useState(() => ymd(new Date()));
  const [data, setData] = useState(null);
  const [pick, setPick] = useState(null); // { post, shift }
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    api.getPosts().then(r => {
      setBranches(r.data.branches);
      setBranch(pickBranch(r.data.branches));
    }).catch(err => setError(err.message));
  }, []);

  const load = useCallback(async () => {
    if (!branch) return;
    setError('');
    try {
      setData((await api.schedule(branch, date)).data);
    } catch (err) {
      setError(err.message);
    }
  }, [branch, date]);

  useEffect(() => { if (branch) keep('sup_branch', branch); setPick(null); setNote(''); load(); }, [branch, date, load]);

  async function run(task, done) {
    setBusy(true);
    setError('');
    try {
      const r = await task();
      if (done) done(r);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const slotOf = (post, shift) => data && data.slots.find(s => s.post === post && s.shift === shift);
  const guardName = id => ((data && data.guards.find(g => g.ROWID === id)) || {}).name || 'Guard';

  function tapCell(post, shift) {
    const slot = slotOf(post, shift);
    if (slot) return run(() => api.scheduleSet(branch, date, post, shift, null), () => setNote(guardName(slot.guard) + ' removed.'));
    setPick(p => (p && p.post === post && p.shift === shift ? null : { post, shift }));
  }

  function assign(guard) {
    if (!pick) return setNote('Tap an empty slot first.');
    const p = pick;
    run(() => api.scheduleSet(branch, date, p.post, p.shift, guard.ROWID), () => { setPick(null); setNote(guard.name + ' → ' + data.posts.find(x => x.ROWID === p.post).name + ' · Shift ' + p.shift); });
  }

  const total = data ? data.posts.length * data.shifts.length : 0;
  const filled = data ? data.slots.length : 0;
  const drafts = data ? data.slots.filter(s => !s.published).length : 0;
  const usedIds = new Set(data ? data.slots.map(s => s.guard) : []);
  const free = data ? data.guards.filter(g => !usedIds.has(g.ROWID) && (g.name + ' ' + (g.id || '')).toLowerCase().includes(search.trim().toLowerCase())) : [];
  const b = branches.find(x => String(x.ROWID) === String(branch));

  return (
    <div className="pd sup">
      <Rail active="schedule" />
      <main className="sb">
        <div className="sb-head">
          <div>
            <div className="pd-muted pd-small">{b ? (b.company || 'Nokia') + ' ' + b.branch_name : ''}</div>
            <div className="pd-row-gap sc-date">
              <button className="pd-icon-btn" onClick={() => setDate(d => addDays(d, -1))} aria-label="Previous day">{Icon.back}</button>
              <div className="pd-title">Schedule · {niceDate(date)}</div>
              <button className="pd-icon-btn sc-next" onClick={() => setDate(d => addDays(d, 1))} aria-label="Next day">{Icon.back}</button>
            </div>
          </div>
          {data && <div className="sc-count"><b>{filled} of {total}</b> filled · {total - filled} empty{drafts ? ' · ' + drafts + ' not published' : ''}</div>}
          <div className="pd-grow"></div>
          <select className="pd-search sb-branch" value={branch} onChange={e => setBranch(e.target.value)} aria-label="Branch">
            {branches.map(x => <option key={x.ROWID} value={x.ROWID}>{x.branch_name}{x.area ? ' (' + x.area + ')' : ''} · {x.city}</option>)}
          </select>
          <button className="pd-chip" onClick={() => run(() => api.scheduleCopy(branch, date), r => setNote(r.data.copied ? 'Copied ' + r.data.copied + ' slot(s) from the ' + r.data.from + '.' : 'Nothing to copy (no schedule yesterday, and the weekly chart has no free slots).'))} disabled={busy}>Copy from yesterday</button>
          <button className="pd-chip pd-chip-primary" onClick={() => run(() => api.schedulePublish(branch, date), r => setNote(r.data.published ? 'Published · ' + r.data.published + ' slot(s). Guards get it at card IN.' : 'Everything is already published.'))} disabled={busy || !drafts}>Publish to guards</button>
          <a className="pd-chip" href="#chart" title="Weekly Duty Chart (used when a day has no published schedule)">Weekly chart</a>
        </div>

        {error && <div className="pd-error-bar">{error}</div>}
        {note && <div className="sc-note">{note}</div>}
        {!data && !error && <div className="pd-muted sup-pad">Loading...</div>}

        {data && (
          <div className="sb-body">
            <div className="sb-main">
              <div className="pd-table-wrap">
                <table className="sc-table">
                  <thead>
                    <tr><th>Post</th>{data.shifts.map(s => <th key={s.code}>{s.code} · {hours(s)}</th>)}</tr>
                  </thead>
                  <tbody>
                    {data.posts.map(p => (
                      <tr key={p.ROWID}>
                        <td className="sc-post">{p.name}</td>
                        {data.shifts.map(s => {
                          const slot = slotOf(p.ROWID, s.code);
                          const picked = pick && pick.post === p.ROWID && pick.shift === s.code;
                          return (
                            <td key={s.code}>
                              <button className={'sc-cell' + (slot ? (slot.published ? ' sc-cell-pub' : ' sc-cell-draft') : ' sc-cell-empty') + (picked ? ' sc-cell-picked' : '')}
                                onClick={() => tapCell(p.ROWID, s.code)} disabled={busy} title={slot ? 'Tap to remove' : 'Tap, then pick a guard'}>
                                {slot ? guardName(slot.guard) : picked ? 'Pick a guard →' : '+ Assign'}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    {data.posts.length === 0 && <tr><td colSpan={data.shifts.length + 1} className="pd-muted">No posts in this branch. Add them in Posts.</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="pd-legend"><span className="sc-key sc-cell-pub"></span>Published <span className="sc-key sc-cell-draft"></span>Not published yet <span className="sc-key sc-cell-empty"></span>Empty</div>
            </div>

            <aside className="sb-side">
              <div className="pd-label">FREE GUARDS{pick ? ' · SHIFT ' + pick.shift : ''}</div>
              <input className="pd-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search guard" aria-label="Search guard" />
              {free.map(g => (
                <button key={g.ROWID} className={'pd-person' + (pick ? '' : ' sc-person-off')} onClick={() => assign(g)} disabled={busy}>
                  <span className="pd-avatar pd-avatar-sm">{initials(g.name)}</span>
                  <span><b>{g.name}</b><span>{g.id}</span></span>
                </button>
              ))}
              {free.length === 0 && <div className="pd-muted pd-small">No free guards.</div>}
              <div className="pd-small pd-muted">Tap an empty slot, then a guard. Publish sends each guard their post when they swipe IN.</div>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
