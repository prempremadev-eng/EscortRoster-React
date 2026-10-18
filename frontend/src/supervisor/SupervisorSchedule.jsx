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
  const [showOthers, setShowOthers] = useState(false);
  const [pointDraft, setPointDraft] = useState({});
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

  // A post works only its own shifts ("ABC", "G" …; empty = every shift).
  const hasShift = (p, code) => !p.shifts || p.shifts.includes(code);
  const total = data ? data.posts.reduce((n, p) => n + data.shifts.filter(s => hasShift(p, s.code)).length, 0) : 0;
  // The daily sheet: one table per section with A / B / C side by side, then the G shift posts.
  const ABC = data ? data.shifts.filter(s => s.code !== 'G') : [];
  const shiftG = data ? data.shifts.find(s => s.code === 'G') : null;
  const sections = [];
  if (data) data.posts.forEach(p => {
    if (!ABC.some(s => hasShift(p, s.code))) return;
    let sec = sections.find(x => x.name === p.section);
    if (!sec) sections.push(sec = { name: p.section, posts: [] });
    sec.posts.push(p);
  });
  const gPosts = data && shiftG ? data.posts.filter(p => hasShift(p, 'G') && p.shifts) : [];
  const nameOf = id => ((data && data.guards.find(g => g.ROWID === id)) || {}).name || 'Guard';
  function savePoint(guard, value) {
    run(() => api.escortPoint(branch, date, guard, value), () => setNote(nameOf(guard) + ': support point ' + (value ? 'saved.' : 'removed.')));
  }
  const filled = data ? data.slots.length : 0;
  const drafts = data ? data.slots.filter(s => !s.published).length : 0;
  // Taken = already in a slot of the picked shift. A guard in another shift that day can still be
  // picked for extra duty (shown under "Other guards" with their other shift).
  const usedIds = new Set(data ? data.slots.filter(s => !pick || s.shift === pick.shift).map(s => s.guard) : []);
  const otherShift = {};
  if (data) data.slots.forEach(s => { if (pick && s.shift !== pick.shift) otherShift[s.guard] = s.shift; });
  const free = data ? data.guards.filter(g => !usedIds.has(g.ROWID) && (g.name + ' ' + (g.id || '') + ' ' + (g.area || '')).toLowerCase().includes(search.trim().toLowerCase())) : [];
  // With a month roster: the picked shift's guards first; the rest (other shift, week off, leave,
  // no roster) behind "Other guards".
  const onShift = pick && data && data.hasRoster ? free.filter(g => g.roster === pick.shift && !otherShift[g.ROWID]) : free.filter(g => !otherShift[g.ROWID]);
  // Guards already on another shift today show only for an extra duty post (e.g. VTitan).
  const pickedExtra = !!(pick && data && (data.posts.find(p => p.ROWID === pick.post) || {}).extraDuty);
  const others = pick ? free.filter(g => !onShift.includes(g) && (!otherShift[g.ROWID] || pickedExtra || data.slots.some(s => s.guard === g.ROWID && (data.posts.find(p => p.ROWID === s.post) || {}).extraDuty))) : [];
  const b = branches.find(x => String(x.ROWID) === String(branch));
  // One slot of the sheet: a dash when the post has no such shift.
  const Cell = ({ p, code }) => {
    if (!hasShift(p, code)) return <td className="sc-none">—</td>;
    const slot = slotOf(p.ROWID, code);
    const picked = pick && pick.post === p.ROWID && pick.shift === code;
    return (
      <td>
        <button className={'sc-cell' + (slot ? (slot.published ? ' sc-cell-pub' : ' sc-cell-draft') : ' sc-cell-empty') + (picked ? ' sc-cell-picked' : '')}
          onClick={() => tapCell(p.ROWID, code)} disabled={busy} title={slot ? 'Tap to remove' : 'Tap, then pick a guard'}>
          {slot ? guardName(slot.guard) : picked ? 'Pick a guard →' : '+ Assign'}
        </button>
      </td>
    );
  };
  const ROSTER_TAG = { A: 'A', B: 'B', C: 'C', G: 'G', O: 'Off', L: 'Leave' };
  // One free guard in the side list: tap to put them in the picked slot.
  const Person = ({ g }) => (
    <button className={'pd-person' + (pick ? '' : ' sc-person-off')} onClick={() => assign(g)} disabled={busy}>
      <span className="pd-avatar pd-avatar-sm">{initials(g.name)}</span>
      <span className="sc-ptext"><b>{g.name}</b><small>{g.id}{g.area ? ' · ' + g.area : ''}</small></span>
      {otherShift[g.ROWID] && <span className="rs-cell rs-none sc-roster" title="Already in this shift today: extra duty">Also {otherShift[g.ROWID]}</span>}
      {g.roster && <span className={'rs-cell rs-' + g.roster + ' sc-roster'}>{ROSTER_TAG[g.roster]}</span>}
    </button>
  );

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
          <button className="pd-chip" onClick={() => window.print()} title="Print or save as PDF to share">🖨️ Print</button>
          <a className="pd-chip" href="#chart" title="Weekly Duty Chart (used when a day has no published schedule)">Weekly chart</a>
        </div>

        {error && <div className="pd-error-bar">{error}</div>}
        {note && <div className="sc-note">{note}</div>}
        {!data && !error && <div className="pd-muted sup-pad">Loading...</div>}

        {data && (
          <div className="sb-body">
            <div className="sb-main">
              <div className="sc-sheet">
                <div className="sc-print-title">{b ? (b.company || 'Nokia') + ' ' + b.branch_name : ''} · Duty schedule · {niceDate(date)}</div>
                {sections.map(sec => (
                  <div className="sc-block" key={sec.name}>
                    <table className="sc-table sc-sheet-table">
                      <thead>
                        <tr className="sc-sec"><th colSpan={2 + ABC.length}>{sec.name}</th></tr>
                        <tr><th className="sc-no">#</th><th>Point</th>{ABC.map(s => <th key={s.code}>{s.code} shift · {hours(s)}</th>)}</tr>
                      </thead>
                      <tbody>
                        {sec.posts.map((p, i) => (
                          <tr key={p.ROWID}>
                            <td className="sc-no">{i + 1}</td>
                            <td className="sc-post">{p.name}{p.extraDuty ? ' ⭐' : ''}</td>
                            {ABC.map(s => <Cell key={s.code} p={p} code={s.code} />)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}

                {shiftG && gPosts.length > 0 && (
                  <div className="sc-block sc-two">
                    <table className="sc-table sc-sheet-table">
                      <thead>
                        <tr className="sc-sec sc-sec-g"><th colSpan={3}>G shift · {hours(shiftG)}</th></tr>
                        <tr><th className="sc-no">#</th><th>Point</th><th>Guard</th></tr>
                      </thead>
                      <tbody>
                        {gPosts.map((p, i) => (
                          <tr key={p.ROWID}><td className="sc-no">{i + 1}</td><td className="sc-post">{p.name}</td><Cell p={p} code="G" /></tr>
                        ))}
                      </tbody>
                    </table>
                    <table className="sc-table sc-sheet-table">
                      <thead>
                        <tr className="sc-sec sc-sec-off"><th colSpan={2}>Week off / leave · from the month roster</th></tr>
                      </thead>
                      <tbody>
                        {data.off.map((o, i) => (
                          <tr key={o.guard}><td className="sc-no">{i + 1}</td><td className="sc-post">{nameOf(o.guard)} <span className={'rs-cell rs-' + o.code + ' sc-roster'}>{o.code === 'O' ? 'Off' : 'Leave'}</span></td></tr>
                        ))}
                        {data.off.length === 0 && <tr><td colSpan={2} className="pd-muted">{data.hasRoster ? 'Nobody is off today.' : 'No month roster for this month.'}</td></tr>}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="sc-block">
                  <table className="sc-table sc-sheet-table">
                    <thead>
                      <tr className="sc-sec sc-sec-esc"><th colSpan={3}>Escort</th></tr>
                      <tr><th className="sc-no">#</th><th>Guard</th><th>Time · support point</th></tr>
                    </thead>
                    <tbody>
                      {data.escort.batch.map((e, i) => (
                        <tr key={e.guard}>
                          <td className="sc-no">{i + 1}</td>
                          <td className="sc-post">{nameOf(e.guard)}</td>
                          <td className="sc-esc">
                            <span className="sc-time">6 to 5</span>
                            <input className="pd-search sc-point" list="sc-points" placeholder="Support point 18:00–20:30"
                              value={pointDraft[e.guard] ?? e.point} onChange={ev => setPointDraft(d => ({ ...d, [e.guard]: ev.target.value }))}
                              onBlur={ev => { const v = ev.target.value.trim(); if (v !== e.point) savePoint(e.guard, v); }} disabled={busy} />
                          </td>
                        </tr>
                      ))}
                      {data.escort.night.map((id, i) => (
                        <tr key={id}><td className="sc-no">{data.escort.batch.length + i + 1}</td><td className="sc-post">{nameOf(id)}</td><td className="sc-esc"><span className="sc-time sc-time-night">9 to 6</span> Escort cab</td></tr>
                      ))}
                      {!data.escort.batch.length && !data.escort.night.length && <tr><td colSpan={3} className="pd-muted">No escort guard on the roster for this day (6-to-5 runs Monday to Friday).</td></tr>}
                    </tbody>
                  </table>
                  <datalist id="sc-points">
                    {['ERT Booth 1', 'ERT Booth 2', 'ERT Booth 3', 'ERT Booth 4', 'Tower Main Gate', 'Smoking Zone', 'Lancor 2', 'North Plaza', 'MLCP Main Gate', 'MD House', 'PKL', 'Potheri']
                      .concat(data.escort.batch.map(e => e.point)).filter((v, i, a) => v && a.indexOf(v) === i).map(v => <option key={v} value={v} />)}
                  </datalist>
                </div>
              </div>
              <div className="pd-legend"><span className="sc-key sc-cell-pub"></span>Published <span className="sc-key sc-cell-draft"></span>Not published yet <span className="sc-key sc-cell-empty"></span>Empty</div>
            </div>

            <aside className="sb-side">
              <div className="pd-label">FREE GUARDS{pick ? ' · SHIFT ' + pick.shift : ''}</div>
              <input className="pd-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search guard" aria-label="Search guard" />
              {pick && data.hasRoster && <div className="pd-small pd-muted">Month roster: {onShift.length} free guard(s) on Shift {pick.shift} this day.</div>}
              {onShift.map(g => <Person key={g.ROWID} g={g} />)}
              {onShift.length === 0 && <div className="pd-muted pd-small">{pick && data.hasRoster ? 'No free guard has Shift ' + pick.shift + ' on the roster.' : 'No free guards.'}</div>}
              {others.length > 0 && (
                <button className="pd-chip" onClick={() => setShowOthers(v => !v)}>{showOthers ? 'Hide' : 'Show'} other guards ({others.length})</button>
              )}
              {showOthers && others.map(g => <Person key={g.ROWID} g={g} />)}
              <div className="pd-small pd-muted">Tap an empty slot, then a guard. Publish sends each guard their post when they swipe IN.</div>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
