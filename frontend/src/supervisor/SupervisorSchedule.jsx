import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { Icon, initials } from '../post/icons.jsx';
import Rail from './Rail.jsx';
import { useUser } from '../auth/user.js';
import { worksIn } from '../agency.js';
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
  // Branch Admin and above pick one agency (IPF / ISI / BSS): its posts and guards only (Prem, 25 Oct).
  // A supervisor always sees their own agency, so no picker for them.
  const me = useUser();
  const pickAgency = !!me && me.role !== 'supervisor';
  const [agencies, setAgencies] = useState([]);
  const [agency, setAgency] = useState(() => { try { return localStorage.getItem('sc-agency') || ''; } catch { return ''; } });
  const chooseAgency = v => { setAgency(v); try { localStorage.setItem('sc-agency', v); } catch { /* private window */ } };
  const [date, setDate] = useState(() => ymd(new Date()));
  const [data, setData] = useState(null);
  const [pick, setPick] = useState(null); // { post, shift }
  // ➕ Add post on the sheet itself (Prem, 28 Oct: a new start makes its posts here, then taps them to put names).
  const [adding, setAdding] = useState(null); // { name, shifts, place }
  const [dayList, setDayList] = useState(''); // which number of the day box shows its names
  const [kind, setKind] = useState(''); // guard picker: '' all · '*' ⭐ incharges · a tag
  useEffect(() => { if (pick) setAdding(null); }, [pick]);
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
      setAgencies(r.data.agencies || []);
    }).catch(err => setError(err.message));
  }, []);

  const branchAgencies = agencies.filter(a => (a.is_active === true || a.is_active === 'true') && worksIn(a, branch));
  const ag = pickAgency ? (branchAgencies.some(a => String(a.ROWID) === agency) ? agency : (branchAgencies[0] ? String(branchAgencies[0].ROWID) : '')) : '';
  const load = useCallback(async () => {
    if (!branch || (pickAgency && !ag)) return;
    setError('');
    try {
      setData((await api.schedule(branch, date, ag)).data);
    } catch (err) {
      setError(err.message);
    }
  }, [branch, date, ag, pickAgency]);

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
  // The month roster changed after the guard was put here (Prem, 28 Oct: roster A → B, the slot stayed A): the
  // slot is the supervisor's choice, so it stays, but a ⚠️ says the roster now differs. An extra-duty post is fine.
  const rosterSays = (slot, post) => {
    if (!data || !data.hasRoster || (post && post.extraDuty)) return '';
    const r = (data.guards.find(g => g.ROWID === slot.guard) || {}).roster || '';
    return r && r !== slot.shift ? r : '';
  };

  function tapCell(post, shift) {
    setPick(p => (p && p.post === post && p.shift === shift ? null : { post, shift }));
  }
  function removePicked() {
    const slot = pick && slotOf(pick.post, pick.shift);
    if (!slot) return;
    const p = pick;
    run(() => api.scheduleSet(branch, date, p.post, p.shift, null, ag), () => { setPick(null); setNote(guardName(slot.guard) + ' removed.'); });
  }

  function assign(guard) {
    if (!pick) return setNote('Tap an empty slot first.');
    const p = pick;
    run(() => api.scheduleSet(branch, date, p.post, p.shift, guard.ROWID, ag), () => { setPick(null); setNote(guard.name + ' → ' + data.posts.find(x => x.ROWID === p.post).name + ' · Shift ' + p.shift); });
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
  // G shift like the printed sheet: one G block per section (PKL, then MLCP …), stacked in the first column.
  const gSections = [];
  gPosts.forEach(p => {
    let sec = gSections.find(x => x.name === p.section);
    if (!sec) gSections.push(sec = { name: p.section, posts: [] });
    sec.posts.push(p);
  });
  const nameOf = id => ((data && data.guards.find(g => g.ROWID === id)) || {}).name || 'Guard';
  // "→ Escort": a free guard goes to the end of tonight's 9 to 6 for this day (any team). Saved as his
  // support point, so his card IN gives him a seat and his own row on the escort page.
  const EXTRA = 'Extra 9 to 6';
  // 📥 / 📤 Excel day sheet (Prem, 25 Oct: agencies without Auto fill rules write the day in Excel).
  // Template = every post and shift of this day (names already put are filled in) + a Guards sheet
  // with each guard's roster shift. Upload = the rows with a Guard ID become drafts; then Publish.
  async function downloadTemplate() {
    const XLSX = await import('xlsx');
    const shiftList = ['A', 'B', 'C', 'G'];
    const rows = [['Date', 'Post', 'Shift', 'Guard ID', 'Guard name (for you)']];
    data.posts.forEach(p => shiftList.filter(c => (p.shifts || 'ABCG').includes(c)).forEach(c => {
      const s = slotOf(p.ROWID, c);
      const g = s && data.guards.find(x => x.ROWID === s.guard);
      rows.push([date, p.name, c, g ? g.id : '', g ? g.name : '']);
    }));
    const people = [['Guard ID', 'Name', 'Roster ' + date, 'Team']].concat(data.guards.slice().sort((a, b) => 'ABCGOL'.indexOf(a.roster) - 'ABCGOL'.indexOf(b.roster) || a.name.localeCompare(b.name)).map(g => [g.id, g.name, g.roster || '-', g.area]));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Schedule');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(people), 'Guards');
    XLSX.writeFile(wb, 'schedule-' + date + '.xlsx');
  }
  async function uploadSheet(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer());
      const all = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
      const head = (all[0] || []).map(h => String(h).toLowerCase());
      const col = (...names) => head.findIndex(h => names.some(n => h.startsWith(n)));
      const cDate = col('date'), cPost = col('post'), cShift = col('shift'), cGuard = col('guard id', 'id', 'guard');
      if (cPost < 0 || cShift < 0 || cGuard < 0) throw new Error('The first row must have the headings Post, Shift and Guard ID (download the template).');
      // A date cell may come as an Excel day number or as text.
      const asDate = v => typeof v === 'number' ? new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10) : String(v || '').trim();
      const rows = all.slice(1).map(r => ({ date: cDate >= 0 ? asDate(r[cDate]) : date, post: r[cPost], shift: r[cShift], guard: r[cGuard] }));
      run(() => api.scheduleUpload(branch, date, rows, ag), r => setNote('📤 Uploaded: ' + r.data.saved + ' slot(s) saved as drafts' + (r.data.days.length > 1 ? ' for ' + r.data.days.join(', ') : '') + '.'
        + (r.data.skipped.length ? ' Not saved (' + r.data.skipped.length + '): ' + r.data.skipped.slice(0, 8).join(' · ') + (r.data.skipped.length > 8 ? ' …' : '') : '') + ' Check, then Publish.'));
    } catch (err) {
      setError(err.message);
    }
  }

  const toEscort = (guard, on) => run(() => api.escortPoint(branch, date, guard, on ? EXTRA : ''),
    () => setNote(nameOf(guard) + (on ? ' → Escort 9 to 6 today. His card IN gives his seat.' : ' removed from Escort today.')));
  function savePoint(guard, value) {
    run(() => api.escortPoint(branch, date, guard, value), () => setNote(nameOf(guard) + ': support point ' + (value ? 'saved.' : 'removed.')));
  }
  const autoFill = () => run(() => api.scheduleAuto(branch, date, ag), r => setNote('⚡ Auto fill: ' + r.data.filled + ' filled. ' + r.data.rules.map((x, i) => 'Rule ' + (x.no || i + 1) + ' · ' + x.rule + ': ' + (x.filled.length > 6 ? x.filled.length + ' filled' : x.filled.join(', ') || 'nothing new') + (x.empty.length ? ' · no one for ' + (x.empty.length > 6 ? x.empty.length + ' slot(s)' : x.empty.join(', ')) : '')).join(' | ') + '. Check, fix and then Publish.'));
  const openAdd = code => { setPick(null); setAdding({ name: '', shifts: code ? (code === 'G' ? 'G' : 'ABC') : 'ABC', place: '' }); };
  const savePost = () => run(async () => {
    const saved = (await api.addPost({ branch_id: branch, agency_id: ag || (me && me.agency_id) || '', post_name: adding.name.trim(), post_type: 'POST', shift_codes: adding.shifts })).data;
    // The sheet order: at the end unless "after" a post was picked; numbered 1, 2, 3 … like Post setup's ▲ ▼.
    if (adding.place) {
      const ids = data.posts.map(x => x.ROWID).filter(id => String(id) !== String(saved.ROWID));
      ids.splice(adding.place === 'top' ? 0 : ids.indexOf(adding.place) + 1, 0, saved.ROWID);
      await api.postOrder(ids);
    }
    return saved;
  }, saved => { setNote('➕ ' + saved.post_name + ' added. Tap its + to put a guard.'); setAdding(null); });
  const publish = () => run(() => api.schedulePublish(branch, date, ag), r => setNote(r.data.published ? 'Published · ' + r.data.published + ' slot(s). Guards get it at card IN.' : 'Everything is already published.'));
  const toSummary = () => { const el = document.getElementById('sc-summary'); if (el) el.scrollIntoView({ behavior: 'smooth' }); };
  // Day summary: per shift how many slots, filled, unfilled (with the empty posts by name), then a total.
  const summary = data ? [...ABC, ...(shiftG ? [shiftG] : [])].map(s => {
    const list = s.code === 'G' ? gPosts : data.posts.filter(p => hasShift(p, s.code));
    const empty = list.filter(p => !slotOf(p.ROWID, s.code));
    return { code: s.code, total: list.length, filled: list.length - empty.length, empty: empty.map(p => p.name) };
  }).filter(r => r.total) : [];
  const sum = k => summary.reduce((n, r) => n + r[k], 0);
  // On duty by the month roster but in no slot and not on the escort list: who can still fill a gap.
  const escortIds = new Set(data ? [...data.escort.batch, ...data.escort.night].map(e => e.guard) : []);
  const idle = data ? data.guards.filter(g => ['A', 'B', 'C', 'G'].includes(g.roster) && !data.slots.some(s => s.guard === g.ROWID) && !escortIds.has(g.ROWID))
    .sort((x, y) => 'ABCG'.indexOf(x.roster) - 'ABCG'.indexOf(y.roster) || x.name.localeCompare(y.name)) : [];
  const hasG = idle.some(g => g.roster === 'G');
  const filled = data ? data.slots.length : 0;
  const drafts = data ? data.slots.filter(s => !s.published).length : 0;
  // Taken = already in a slot of the picked shift. A guard in another shift that day can still be
  // picked for extra duty (shown under "Other guards" with their other shift).
  const usedIds = new Set(data ? data.slots.filter(s => !pick || s.shift === pick.shift).map(s => s.guard) : []);
  const otherShift = {};
  if (data) data.slots.forEach(s => { if (pick && s.shift !== pick.shift) otherShift[s.guard] = s.shift; });
  const free = data ? data.guards.filter(g => !usedIds.has(g.ROWID) && (g.name + ' ' + (g.id || '') + ' ' + (g.area || '')).toLowerCase().includes(search.trim().toLowerCase())) : [];
  // Tap an empty slot → only that shift's guards (month roster) who have no post and are not on the
  // escort list today (Prem, 21 Oct). No other rules: the supervisor picks. With no roster, everyone
  // free. A guard already on another shift today shows only for an extra duty post (e.g. VTitan).
  const pickedExtra = !!(pick && data && (data.posts.find(p => p.ROWID === pick.post) || {}).extraDuty);
  const tagsOf = g => String(g.tags || '').split(',').map(x => x.trim()).filter(Boolean);
  const kindOk = g => !kind || (kind === '*' ? g.incharge : tagsOf(g).includes(kind));
  const onShiftAll = pick ? free.filter(g => (!otherShift[g.ROWID] || pickedExtra) && !escortIds.has(g.ROWID) && (!data.hasRoster || g.roster === pick.shift))
    .sort((x, y) => x.name.localeCompare(y.name)) : [];
  const onShift = onShiftAll.filter(kindOk);
  const pickKinds = [...new Set(onShiftAll.flatMap(tagsOf))].sort();
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
                  {slot && rosterSays(slot, p) && <span className="sh-warn" title={'Month roster says ' + ({ O: 'week off', L: 'leave' }[rosterSays(slot, p)] || 'Shift ' + rosterSays(slot, p)) + ' today'}> ⚠️ {({ O: 'OFF', L: 'LEAVE' }[rosterSays(slot, p)] || rosterSays(slot, p))}</span>}
                </button>
              </td>
              <td className="sh-code">{code}</td>
              <td className="sh-point">{p.name}{p.extraDuty ? ' ⭐' : ''}</td>
            </tr>
          );
        })}
      </tbody>
      <tfoot className="no-print">
        <tr><td colSpan={4}><button className="sh-add" onClick={() => openAdd(code)} disabled={busy}>➕ Add post</button></td></tr>
      </tfoot>
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
          {pickAgency && branchAgencies.length > 0 && (
            <select className="pd-search sb-branch" value={ag} onChange={e => chooseAgency(e.target.value)} aria-label="Agency">
              {branchAgencies.map(a => <option key={a.ROWID} value={a.ROWID}>{a.agency_name}</option>)}
            </select>
          )}
          {data && data.autoFill && <button className="pd-chip pd-chip-primary" onClick={autoFill} disabled={busy}
            title="Fill empty slots by the fill rules (now: Rule 1 Shift Incharge from the month roster)">⚡ Auto fill</button>}
          <button className="pd-chip" onClick={downloadTemplate} disabled={!data} title="Excel of this day: every post and shift, plus the guards and their roster shift">📥 Template</button>
          <label className="pd-chip sc-upload" title="Upload the filled Excel: the rows with a Guard ID become drafts">📤 Upload<input type="file" accept=".xlsx,.xls,.csv" hidden onChange={uploadSheet} /></label>
          <button className="pd-chip" onClick={() => window.confirm('Empty the whole sheet of ' + niceDate(date) + '? All ' + filled + ' name(s) go, published ones too.') && run(() => api.scheduleClear(branch, date, ag), r => { setPick(null); setNote('🧹 Cleared · ' + r.data.cleared + ' slot(s) emptied.'); })} disabled={busy || !filled}
            title="Empty this day to fill it again by hand, or to try one fill rule at a time">🧹 Clear day</button>
          <button className="pd-chip" onClick={() => run(() => api.scheduleCopy(branch, date, ag), r => setNote(r.data.copied ? 'Copied ' + r.data.copied + ' slot(s) from the ' + r.data.from + '.' : 'Nothing to copy (no schedule yesterday, and the weekly chart has no free slots).'))} disabled={busy}>Copy from yesterday</button>
          <button className="pd-chip" onClick={() => openAdd('')} disabled={busy || !data} title="Make a new post right here on the sheet">➕ Add post</button>
          <button className="pd-chip pd-chip-primary" onClick={publish} disabled={busy || !drafts}>Publish to guards</button>
          <a className="pd-chip" href={'#roster/' + date.slice(0, 7)} title="Month roster: who works which shift each day">📅 Month roster</a>
          <button className="pd-chip" onClick={() => window.print()} title="Print or save as PDF to share">🖨️ Print</button>
          <a className="pd-chip" href="#history" title="Who worked where, IN / OUT, absent, leave (read only)">📖 Duty history</a>
          </>}
          <button className="pd-icon-btn sc-tools" onClick={toggleTools} aria-label={tools ? 'Hide buttons' : 'Show buttons'} title={tools ? 'Hide buttons (bigger sheet)' : 'Show buttons'}>{tools ? '▴' : '▾'}</button>
        </div>

        {data && tools && (
          <div className="sc-flow no-print">
            <a className={'sc-step ' + (data.hasRoster ? 'sc-step-done' : 'sc-step-todo')} href={'#roster/' + date.slice(0, 7)}><b>1</b>{data.hasRoster ? 'Month roster ready' : 'Upload the month roster'}</a>
            <span className="sc-arrow">→</span>
            <button className={'sc-step ' + (filled ? 'sc-step-done' : 'sc-step-todo')} onClick={data.autoFill ? autoFill : undefined} disabled={busy || !data.hasRoster || (!data.autoFill && !filled)}><b>2</b>{filled ? 'Filled ' + filled + ' of ' + total : data.autoFill ? '⚡ Auto fill' : 'Put the names (tap a slot)'}</button>
            <span className="sc-arrow">→</span>
            <button className={'sc-step ' + (filled && total - filled === 0 ? 'sc-step-done' : filled ? 'sc-step-todo' : '')} onClick={toSummary}><b>3</b>{filled ? 'Check: ' + (total - filled) + ' empty · ' + idle.length + ' free guards' : 'Check the summary'}</button>
            <span className="sc-arrow">→</span>
            <button className={'sc-step ' + (filled && !drafts ? 'sc-step-done' : drafts ? 'sc-step-todo' : '')} onClick={publish} disabled={busy || !drafts}><b>4</b>{drafts ? 'Publish ' + drafts : filled ? 'Published' : 'Publish'}</button>
            <span className="sc-arrow">→</span>
            <a className="sc-step" href="#board"><b>5</b>Watch the Live board</a>
          </div>
        )}
        {data && (() => {
          // The day in numbers (Prem, 28 Oct: total, leave, absent, allotted, vacant on the schedule page itself).
          // Roster: on duty / week off / leave. Sheet: allotted, free, vacant. Card IN: absent once a shift has run
          // 15 minutes (today) or for a past day; a future day shows —.
          const r = c => data.guards.filter(g => g.roster === c);
          const onDuty = data.guards.filter(g => 'ABCG'.includes(g.roster || '-'));
          const inSlot = new Set(data.slots.map(x => x.guard));
          const allotted = data.guards.filter(g => inSlot.has(g.ROWID));
          const minus15 = new Date(new Date(String(data.now || '').replace(' ', 'T') + ':00Z').getTime() - 15 * 60000).toISOString().slice(0, 16).replace('T', ' ');
          const begun = code => { const sh = data.shifts.find(x => x.code === code); return !!sh && ((sh.start < '06:00' ? addDays(date, 1) : date) + ' ' + sh.start) <= minus15; };
          const absent = data.ins ? data.guards.filter(g => data.slots.some(x => x.guard === g.ROWID && begun(x.shift)) && !data.ins.includes(g.ROWID)) : null;
          const byShift = list => ['A', 'B', 'C', 'G'].map(c => [c, list.filter(g => g.roster === c).length]).filter(x => x[1]).map(x => x.join(' ')).join(' · ');
          const rows = [
            ['guards', 'Guards', data.guards, ''],
            ['duty', 'On duty', onDuty, byShift(onDuty)],
            ['off', 'Week off', r('O'), ''],
            ['leave', 'Leave', r('L'), ''],
            ['allotted', 'Allotted', allotted, 'have a post'],
            ['free', 'Free', idle, 'duty, no post'],
            ['vacant', 'Vacant', null, 'empty posts'],
            ['absent', 'Absent', absent, absent ? 'no card IN' : 'after the shift starts']
          ];
          const vacantNames = summary.flatMap(x => x.empty.map(n => n + ' (' + x.code + ')'));
          const shown = rows.find(x => x[0] === dayList);
          return (
            <div className="sc-day no-print">
              {rows.map(([k, label, list, hint]) => {
                const n = k === 'vacant' ? total - filled : list ? list.length : '—';
                return (
                  <button key={k} className={'sc-day-n' + (dayList === k ? ' on' : '') + (k === 'vacant' && n ? ' warn' : '') + (k === 'absent' && n ? ' bad' : '')}
                    onClick={() => setDayList(d => (d === k ? '' : k))} disabled={n === '—' || n === 0} title={hint}>
                    <span>{label}</span><b>{n}</b>{hint && <small>{hint}</small>}
                  </button>
                );
              })}
              {shown && (
                <div className="sc-day-list">
                  <b>{shown[1]}:</b> {(shown[0] === 'vacant' ? vacantNames : (shown[2] || []).map(g => g.name + (g.roster ? ' (' + g.roster + ')' : ''))).join(' · ') || '—'}
                </div>
              )}
            </div>
          );
        })()}
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
                  {shiftG && gPosts.length > 0 && <div className="sh-stack">
                    {gSections.map(sec => <ShiftTable key={sec.name} code="G" title={sec.name + ' · G shift'} posts={sec.posts} />)}
                  </div>}
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
                  {data.escort.show && <table className="sh-t">
                    <colgroup><col className="w-no" /><col className="w-name" /><col className="w-code2" /><col className="w-point" /></colgroup>
                    <thead>
                      <tr className="sh-head sh-head-esc"><th colSpan={4}>ESCORT · {sheetDate}</th></tr>
                      <tr className="sh-cols"><th>S No</th><th>NAME</th><th>TIME</th><th>POINT</th></tr>
                    </thead>
                    <tbody>
                      {/* S No = today's seat in its own list (6 to 5 / 9 to 6), the same as the escort duty sheet. */}
                      {data.escort.batch.map(e => (
                        <tr key={e.guard}>
                          <td className="sh-no">{e.seat}</td>
                          <td className="sh-name">{nameOf(e.guard)}</td>
                          <td className="sh-code sh-early">6 to 5</td>
                          <td className="sh-point">
                            <input className="sh-input" list="sc-points" placeholder="support point"
                              value={pointDraft[e.guard] ?? e.point} onChange={ev => setPointDraft(d => ({ ...d, [e.guard]: ev.target.value }))}
                              onBlur={ev => { const v = ev.target.value.trim(); if (v !== e.point) savePoint(e.guard, v); }} disabled={busy} />
                          </td>
                        </tr>
                      ))}
                      {data.escort.night.map(e => (
                        <tr key={e.guard}><td className="sh-no">{e.seat}</td><td className="sh-name">{nameOf(e.guard)}</td><td className="sh-code sh-night">9 to 6</td>
                          <td className="sh-point sh-muted">{e.extra ? <>Extra today <button className="sh-esc-x no-print" onClick={() => toEscort(e.guard, false)} disabled={busy} title="Remove from Escort today">✕</button></> : 'Escort cab'}</td></tr>
                      ))}
                      {!data.escort.batch.length && !data.escort.night.length && <tr><td colSpan={4} className="sh-empty">No escort on the roster (6 to 5 is Mon–Fri)</td></tr>}
                    </tbody>
                  </table>}
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
                      <tr className="sh-head sh-head-off"><th colSpan={(data.escort.canAdd ? 5 : 4) + (hasG ? 1 : 0)}>ON DUTY, NO POST · {sheetDate}</th></tr>
                      <tr className="sh-cols"><th>S No</th><th>NAME</th><th>SHIFT</th><th>TEAM</th>{data.escort.canAdd && <th className="no-print">ESCORT</th>}{hasG && <th className="no-print">G TODAY</th>}</tr>
                    </thead>
                    <tbody>
                      {idle.map((g, i) => (
                        <tr key={g.ROWID}><td className="sh-no">{i + 1}</td><td className="sh-name">{g.name}</td><td className="sh-code">{g.roster}</td><td className="sh-code">{g.area}</td>
                          {data.escort.canAdd && <td className="sh-code no-print">{g.roster === 'C' && <button className="sh-esc-btn" onClick={() => toEscort(g.ROWID, true)} disabled={busy} title="Send to Escort 9 to 6 for today (C shift only)">→ Escort</button>}</td>}
                          {/* G on demand (Prem, 25 Oct): a G guard goes to any post for this day only; the G row shows then. */}
                          {hasG && <td className="sh-code no-print">{g.roster === 'G' && (
                            <select className="sh-g-pick" value="" disabled={busy} aria-label={'G duty today for ' + g.name}
                              onChange={e => e.target.value && run(() => api.scheduleSet(branch, date, e.target.value, 'G', g.ROWID, ag), () => setNote(g.name + ' → ' + (data.posts.find(x => x.ROWID === e.target.value) || {}).name + ' · G today'))}>
                              <option value="">→ Post…</option>
                              {data.posts.map(x => <option key={x.ROWID} value={x.ROWID}>{x.name}</option>)}
                            </select>
                          )}</td>}</tr>
                      ))}
                      {idle.length === 0 && <tr><td colSpan={(data.escort.canAdd ? 5 : 4) + (hasG ? 1 : 0)} className="sh-empty">{data.hasRoster ? 'Everyone on duty has a post' : 'No month roster'}</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="pd-legend"><span className="sc-key sc-cell-pub"></span>Published <span className="sc-key sc-cell-draft"></span>Not published yet <span className="sc-key sc-cell-empty"></span>Empty</div>
            </div>

            {adding && <aside className="sb-side sh-drawer">
              <div className="pd-row-between">
                <div className="pd-label">➕ NEW POST · {b ? b.branch_name : ''}</div>
                <button className="pd-chip" onClick={() => setAdding(null)}>✕</button>
              </div>
              <label className="pd-small">Post name
                <input className="pd-search" value={adding.name} onChange={e => setAdding(a => ({ ...a, name: e.target.value }))} placeholder="e.g. Gate 3" autoFocus />
              </label>
              <div className="pd-small">Shifts (G only if it is needed every day)</div>
              <div className="sh-add-shifts">
                {['A', 'B', 'C', 'G'].map(c => (
                  <label key={c}><input type="checkbox" checked={adding.shifts.includes(c)}
                    onChange={ev => setAdding(a => ({ ...a, shifts: ['A', 'B', 'C', 'G'].filter(x => (x === c ? ev.target.checked : a.shifts.includes(x))).join('') }))} /> {c}</label>
                ))}
              </div>
              <label className="pd-small">Place on the sheet
                <select className="pd-search" value={adding.place} onChange={e => setAdding(a => ({ ...a, place: e.target.value }))}>
                  <option value="">At the end</option>
                  <option value="top">At the top</option>
                  {data.posts.map(x => <option key={x.ROWID} value={x.ROWID}>After {x.name}</option>)}
                </select>
              </label>
              <button className="pd-chip pd-chip-primary" onClick={savePost} disabled={busy || !adding.name.trim() || !adding.shifts}>Save post</button>
              <div className="pd-small pd-muted">The post is saved in Post setup too (same post). Then tap its + on the sheet and pick a guard.</div>
            </aside>}
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
              {/* Only the kind needed here (Prem, 28 Oct): ⭐ incharges, Lady, Document … */}
              {(pickKinds.length > 0 || onShiftAll.some(g => g.incharge)) && <div className="rs-kinds">
                {[['', 'All'], ...(onShiftAll.some(g => g.incharge) ? [['*', '⭐ Incharge']] : []), ...pickKinds.map(k => [k, k])].map(([k, label]) => (
                  <button key={k || 'all'} className={'rs-kind' + (kind === k ? ' on' : '')} onClick={() => setKind(k)}>{label}</button>
                ))}
              </div>}
              <div className="pd-small pd-muted">{onShift.length} guard(s) on Shift {pick.shift} with no post.</div>
              {onShift.map(g => <Person key={g.ROWID} g={g} />)}
              {onShift.length === 0 && <div className="pd-muted pd-small">Every Shift {pick.shift} guard has a post.</div>}
              <div className="pd-small pd-muted">Pick a guard to put here (or to replace). Publish sends each guard their post when they swipe IN.</div>
            </aside>}
          </div>
        )}
      </main>
    </div>
  );
}
