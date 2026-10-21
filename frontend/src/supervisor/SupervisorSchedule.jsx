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
  const [pointDraft, setPointDraft] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  // ▴ hides the buttons and the Auto fill note so the duty sheet gets the whole screen.
  const [tools, setTools] = useState(() => { try { return localStorage.getItem('sc-tools') !== 'off'; } catch { return true; } });
  const toggleTools = () => setTools(v => { try { localStorage.setItem('sc-tools', v ? 'off' : 'on'); } catch { /* private window */ } return !v; });

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
    setPick(p => (p && p.post === post && p.shift === shift ? null : { post, shift }));
  }
  function removePicked() {
    const slot = pick && slotOf(pick.post, pick.shift);
    if (!slot) return;
    const p = pick;
    run(() => api.scheduleSet(branch, date, p.post, p.shift, null), () => { setPick(null); setNote(guardName(slot.guard) + ' removed.'); });
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
  const autoFill = () => run(() => api.scheduleAuto(branch, date), r => setNote('⚡ Auto fill: ' + r.data.filled + ' filled. ' + r.data.rules.map((x, i) => 'Rule ' + (x.no || i + 1) + ' · ' + x.rule + ': ' + (x.filled.length > 6 ? x.filled.length + ' filled' : x.filled.join(', ') || 'nothing new') + (x.empty.length ? ' · no one for ' + (x.empty.length > 6 ? x.empty.length + ' slot(s)' : x.empty.join(', ')) : '')).join(' | ') + '. Check, fix and then Publish.'));
  const publish = () => run(() => api.schedulePublish(branch, date), r => setNote(r.data.published ? 'Published · ' + r.data.published + ' slot(s). Guards get it at card IN.' : 'Everything is already published.'));
  const toSummary = () => { const el = document.getElementById('sc-summary'); if (el) el.scrollIntoView({ behavior: 'smooth' }); };
  // Day summary: per shift how many slots, filled, unfilled (with the empty posts by name), then a total.
  const summary = data ? [...ABC, ...(shiftG ? [shiftG] : [])].map(s => {
    const list = s.code === 'G' ? gPosts : data.posts.filter(p => hasShift(p, s.code));
    const empty = list.filter(p => !slotOf(p.ROWID, s.code));
    return { code: s.code, total: list.length, filled: list.length - empty.length, empty: empty.map(p => p.name) };
  }).filter(r => r.total) : [];
  const sum = k => summary.reduce((n, r) => n + r[k], 0);
  // On duty by the month roster but in no slot and not on the escort list: who can still fill a gap.
  const escortIds = new Set(data ? [...data.escort.batch.map(e => e.guard), ...data.escort.night] : []);
  const idle = data ? data.guards.filter(g => ['A', 'B', 'C', 'G'].includes(g.roster) && !data.slots.some(s => s.guard === g.ROWID) && !escortIds.has(g.ROWID))
    .sort((x, y) => 'ABCG'.indexOf(x.roster) - 'ABCG'.indexOf(y.roster) || x.name.localeCompare(y.name)) : [];
  const filled = data ? data.slots.length : 0;
  const drafts = data ? data.slots.filter(s => !s.published).length : 0;
  // Taken = already in a slot of the picked shift. A guard in another shift that day can still be
  // picked for extra duty (shown under "Other guards" with their other shift).
  const usedIds = new Set(data ? data.slots.filter(s => !pick || s.shift === pick.shift).map(s => s.guard) : []);
  const otherShift = {};
  if (data) data.slots.forEach(s => { if (pick && s.shift !== pick.shift) otherShift[s.guard] = s.shift; });
  const free = data ? data.guards.filter(g => !usedIds.has(g.ROWID) && (g.name + ' ' + (g.id || '') + ' ' + (g.area || '')).toLowerCase().includes(search.trim().toLowerCase())) : [];
  // Tap an empty slot → every guard with no post today, in one list, no rules (Prem, 21 Oct): the
  // supervisor decides. The picked shift's guards come first only as an order, with their roster tag.
  // A guard already on another shift today shows only for an extra duty post (e.g. VTitan).
  const pickedExtra = !!(pick && data && (data.posts.find(p => p.ROWID === pick.post) || {}).extraDuty);
  const onShift = pick ? free.filter(g => !otherShift[g.ROWID] || pickedExtra)
    .sort((x, y) => (y.roster === pick.shift) - (x.roster === pick.shift) || x.name.localeCompare(y.name)) : [];
  const b = branches.find(x => String(x.ROWID) === String(branch));
  const sheetDate = date.split('-').reverse().join('-');
  // One shift block of the daily sheet: S.No · NAME · SHIFT · POINT (the order the team writes it).
  const ShiftTable = ({ code, title, posts }) => (
    <table className="sh-t">
      <colgroup><col className="w-no" /><col className="w-name" /><col className="w-code" /><col className="w-point" /></colgroup>
      <thead>
        <tr className={'sh-head' + (code === 'G' ? ' sh-head-g' : '')} title={title}><th colSpan={2}>{code} SHIFT</th><th colSpan={2}>{sheetDate}</th></tr>
        <tr className="sh-cols"><th>S No</th><th>NAME</th><th>SHIFT</th><th>POINT</th></tr>
      </thead>
      <tbody>
        {posts.map((p, i) => {
          const slot = slotOf(p.ROWID, code);
          const picked = pick && pick.post === p.ROWID && pick.shift === code;
          return (
            <tr key={p.ROWID} className={picked ? 'sh-picked' : ''}>
              <td className="sh-no">{i + 1}</td>
              <td className="sh-name">
                <button className={'sh-slot' + (slot ? (slot.published ? ' sh-pub' : ' sh-draft') : ' sh-open')} onClick={() => tapCell(p.ROWID, code)} disabled={busy}
                  title={slot ? 'Tap to change or remove' : 'Tap, then pick a guard'}>
                  {slot ? guardName(slot.guard) : '+'}
                </button>
              </td>
              <td className="sh-code">{code}</td>
              <td className="sh-point">{p.name}{p.extraDuty ? ' ⭐' : ''}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
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
            {tools && <div className="pd-muted pd-small">{b ? (b.company || 'Nokia') + ' ' + b.branch_name : ''}</div>}
            <div className="pd-row-gap sc-date">
              <button className="pd-icon-btn" onClick={() => setDate(d => addDays(d, -1))} aria-label="Previous day">{Icon.back}</button>
              <div className="pd-title">Schedule · {niceDate(date)}</div>
              <button className="pd-icon-btn sc-next" onClick={() => setDate(d => addDays(d, 1))} aria-label="Next day">{Icon.back}</button>
            </div>
          </div>
          {data && <div className="sc-count"><b>{filled} of {total}</b> filled · {total - filled} empty{drafts ? ' · ' + drafts + ' not published' : ''}</div>}
          <div className="pd-grow"></div>
          {tools && <>
          <select className="pd-search sb-branch" value={branch} onChange={e => setBranch(e.target.value)} aria-label="Branch">
            {branches.map(x => <option key={x.ROWID} value={x.ROWID}>{x.branch_name}{x.area ? ' (' + x.area + ')' : ''} · {x.city}</option>)}
          </select>
          <button className="pd-chip pd-chip-primary" onClick={autoFill} disabled={busy}
            title="Fill empty slots by the fill rules (now: Rule 1 Shift Incharge from the month roster)">⚡ Auto fill</button>
          <button className="pd-chip" onClick={() => window.confirm('Empty the whole sheet of ' + niceDate(date) + '? All ' + filled + ' name(s) go, published ones too.') && run(() => api.scheduleClear(branch, date), r => { setPick(null); setNote('🧹 Cleared · ' + r.data.cleared + ' slot(s) emptied.'); })} disabled={busy || !filled}
            title="Empty this day to fill it again by hand, or to try one fill rule at a time">🧹 Clear day</button>
          <button className="pd-chip" onClick={() => run(() => api.scheduleCopy(branch, date), r => setNote(r.data.copied ? 'Copied ' + r.data.copied + ' slot(s) from the ' + r.data.from + '.' : 'Nothing to copy (no schedule yesterday, and the weekly chart has no free slots).'))} disabled={busy}>Copy from yesterday</button>
          <button className="pd-chip pd-chip-primary" onClick={publish} disabled={busy || !drafts}>Publish to guards</button>
          <a className="pd-chip" href={'#roster/' + date.slice(0, 7)} title="Month roster: who works which shift each day">📅 Month roster</a>
          <button className="pd-chip" onClick={() => window.print()} title="Print or save as PDF to share">🖨️ Print</button>
          <a className="pd-chip" href="#chart" title="Weekly Duty Chart (used when a day has no published schedule)">Weekly chart</a>
          </>}
          <button className="pd-icon-btn sc-tools" onClick={toggleTools} aria-label={tools ? 'Hide buttons' : 'Show buttons'} title={tools ? 'Hide buttons (bigger sheet)' : 'Show buttons'}>{tools ? '▴' : '▾'}</button>
        </div>

        {data && tools && (
          <div className="sc-flow no-print">
            <a className={'sc-step ' + (data.hasRoster ? 'sc-step-done' : 'sc-step-todo')} href={'#roster/' + date.slice(0, 7)}><b>1</b>{data.hasRoster ? 'Month roster ready' : 'Upload the month roster'}</a>
            <span className="sc-arrow">→</span>
            <button className={'sc-step ' + (filled ? 'sc-step-done' : 'sc-step-todo')} onClick={autoFill} disabled={busy || !data.hasRoster}><b>2</b>{filled ? 'Filled ' + filled + ' of ' + total : '⚡ Auto fill'}</button>
            <span className="sc-arrow">→</span>
            <button className={'sc-step ' + (filled && total - filled === 0 ? 'sc-step-done' : filled ? 'sc-step-todo' : '')} onClick={toSummary}><b>3</b>{filled ? 'Check: ' + (total - filled) + ' empty · ' + idle.length + ' free guards' : 'Check the summary'}</button>
            <span className="sc-arrow">→</span>
            <button className={'sc-step ' + (filled && !drafts ? 'sc-step-done' : drafts ? 'sc-step-todo' : '')} onClick={publish} disabled={busy || !drafts}><b>4</b>{drafts ? 'Publish ' + drafts : filled ? 'Published' : 'Publish'}</button>
            <span className="sc-arrow">→</span>
            <a className="sc-step" href="#board"><b>5</b>Watch the Live board</a>
          </div>
        )}
        {error && <div className="pd-error-bar">{error}</div>}
        {note && tools && <div className="sc-note">{note}</div>}
        {!data && !error && <div className="pd-muted sup-pad">Loading...</div>}

        {data && (
          <div className="sb-body">
            <div className="sb-main">
              <div className="sh-page">
                <div className="sc-print-title">{b ? (b.company || 'Nokia') + ' ' + b.branch_name : ''} · Duty schedule · {niceDate(date)}</div>
                {sections.map(sec => (
                  <div className="sh-row" key={sec.name}>
                    {ABC.map(s => (
                      <ShiftTable key={s.code} code={s.code} title={sec.name} posts={sec.posts.filter(p => hasShift(p, s.code))} />
                    ))}
                  </div>
                ))}

                <div className="sh-row">
                  {shiftG && gPosts.length > 0 && <ShiftTable code="G" title="G shift" posts={gPosts} />}
                  <table className="sh-t">
                    <colgroup><col className="w-no" /><col className="w-name" /><col className="w-code2" /></colgroup>
                    <thead>
                      <tr className="sh-head sh-head-off"><th colSpan={3}>WEEK OFF / LEAVE · {sheetDate}</th></tr>
                      <tr className="sh-cols"><th>S No</th><th>NAME</th><th>CODE</th></tr>
                    </thead>
                    <tbody>
                      {data.off.map((o, i) => (
                        <tr key={o.guard}><td className="sh-no">{i + 1}</td><td className="sh-name">{nameOf(o.guard)}</td><td className={'sh-code sh-' + o.code}>{o.code === 'O' ? 'OFF' : 'LEAVE'}</td></tr>
                      ))}
                      {data.off.length === 0 && <tr><td colSpan={3} className="sh-empty">{data.hasRoster ? 'Nobody is off' : 'No month roster'}</td></tr>}
                    </tbody>
                  </table>
                  <table className="sh-t">
                    <colgroup><col className="w-no" /><col className="w-name" /><col className="w-code2" /><col className="w-point" /></colgroup>
                    <thead>
                      <tr className="sh-head sh-head-esc"><th colSpan={4}>ESCORT · {sheetDate}</th></tr>
                      <tr className="sh-cols"><th>S No</th><th>NAME</th><th>TIME</th><th>POINT</th></tr>
                    </thead>
                    <tbody>
                      {data.escort.batch.map((e, i) => (
                        <tr key={e.guard}>
                          <td className="sh-no">{i + 1}</td>
                          <td className="sh-name">{nameOf(e.guard)}</td>
                          <td className="sh-code sh-early">6 to 5</td>
                          <td className="sh-point">
                            <input className="sh-input" list="sc-points" placeholder="support point"
                              value={pointDraft[e.guard] ?? e.point} onChange={ev => setPointDraft(d => ({ ...d, [e.guard]: ev.target.value }))}
                              onBlur={ev => { const v = ev.target.value.trim(); if (v !== e.point) savePoint(e.guard, v); }} disabled={busy} />
                          </td>
                        </tr>
                      ))}
                      {data.escort.night.map((id, i) => (
                        <tr key={id}><td className="sh-no">{data.escort.batch.length + i + 1}</td><td className="sh-name">{nameOf(id)}</td><td className="sh-code sh-night">9 to 6</td><td className="sh-point sh-muted">Escort cab</td></tr>
                      ))}
                      {!data.escort.batch.length && !data.escort.night.length && <tr><td colSpan={4} className="sh-empty">No escort on the roster (6 to 5 is Mon–Fri)</td></tr>}
                    </tbody>
                  </table>
                  <datalist id="sc-points">
                    {['ERT Booth 1', 'ERT Booth 2', 'ERT Booth 3', 'ERT Booth 4', 'Tower Main Gate', 'Smoking Zone', 'Lancor 2', 'North Plaza', 'MLCP Main Gate', 'MD House', 'PKL', 'Potheri']
                      .concat(data.escort.batch.map(e => e.point)).filter((v, i, a) => v && a.indexOf(v) === i).map(v => <option key={v} value={v} />)}
                  </datalist>
                </div>

                <div className="sh-row" id="sc-summary">
                  <table className="sh-t">
                    <colgroup><col className="w-code" /><col className="w-code2" /><col className="w-code2" /><col className="w-code2" /><col className="w-wide" /></colgroup>
                    <thead>
                      <tr className="sh-head"><th colSpan={5}>DAY SUMMARY · {sheetDate}</th></tr>
                      <tr className="sh-cols"><th>SHIFT</th><th>TOTAL</th><th>FILLED</th><th>UNFILLED</th><th>UNFILLED POSTS</th></tr>
                    </thead>
                    <tbody>
                      {summary.map(r => (
                        <tr key={r.code}>
                          <td className="sh-code">{r.code}</td><td className="sh-code">{r.total}</td><td className="sh-code">{r.filled}</td>
                          <td className={'sh-code' + (r.empty.length ? ' sh-gap' : '')}>{r.empty.length}</td>
                          <td className="sh-point sh-wrap">{r.empty.join(', ') || '—'}</td>
                        </tr>
                      ))}
                      <tr className="sh-total"><td className="sh-code">TOTAL</td><td className="sh-code">{sum('total')}</td><td className="sh-code">{sum('filled')}</td><td className="sh-code">{sum('total') - sum('filled')}</td><td className="sh-point"></td></tr>
                    </tbody>
                  </table>
                  <table className="sh-t">
                    <colgroup><col className="w-no" /><col className="w-name" /><col className="w-code" /><col className="w-code2" /></colgroup>
                    <thead>
                      <tr className="sh-head sh-head-off"><th colSpan={4}>ON DUTY, NO POST · {sheetDate}</th></tr>
                      <tr className="sh-cols"><th>S No</th><th>NAME</th><th>SHIFT</th><th>TEAM</th></tr>
                    </thead>
                    <tbody>
                      {idle.map((g, i) => (
                        <tr key={g.ROWID}><td className="sh-no">{i + 1}</td><td className="sh-name">{g.name}</td><td className="sh-code">{g.roster}</td><td className="sh-code">{g.area}</td></tr>
                      ))}
                      {idle.length === 0 && <tr><td colSpan={4} className="sh-empty">{data.hasRoster ? 'Everyone on duty has a post' : 'No month roster'}</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="pd-legend"><span className="sc-key sc-cell-pub"></span>Published <span className="sc-key sc-cell-draft"></span>Not published yet <span className="sc-key sc-cell-empty"></span>Empty</div>
            </div>

            {pick && <aside className="sb-side sh-drawer">
              <div className="pd-row-between">
                <div className="pd-label">{(data.posts.find(x => x.ROWID === pick.post) || {}).name} · SHIFT {pick.shift}</div>
                <button className="pd-chip" onClick={() => setPick(null)}>✕</button>
              </div>
              {slotOf(pick.post, pick.shift) && (
                <div className="sh-current">Now: <b>{guardName(slotOf(pick.post, pick.shift).guard)}</b> <button className="pd-chip" onClick={removePicked} disabled={busy}>Remove</button></div>
              )}
              <div className="pd-label">GUARDS WITH NO POST · SHIFT {pick.shift}</div>
              <input className="pd-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search guard" aria-label="Search guard" />
              <div className="pd-small pd-muted">{onShift.length} guard(s) with no post today ({onShift.filter(g => g.roster === pick.shift).length} on Shift {pick.shift} first).</div>
              {onShift.map(g => <Person key={g.ROWID} g={g} />)}
              {onShift.length === 0 && <div className="pd-muted pd-small">Every guard has a post today.</div>}
              <div className="pd-small pd-muted">Pick a guard to put here (or to replace). Publish sends each guard their post when they swipe IN.</div>
            </aside>}
          </div>
        )}
      </main>
    </div>
  );
}
