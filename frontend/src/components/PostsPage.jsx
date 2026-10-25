import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useUser, atLeast } from '../auth/user.js';
import { worksIn } from '../agency.js';
import { Toggle, IconBtn } from './RowControls.jsx';

const BLANK_POST = { post_name: '', post_type: 'POST', agency_id: '', vehicle_entry: false, extra_duty: false, auto_fill: false, section: '', sort_order: '', shift_codes: 'ABC' };
const isOn = v => v === true || v === 'true';
const idList = v => String(v || '').split(',').map(x => x.trim()).filter(Boolean);
// Posts.relief_guards = "relief ; weekend ; lady shifts ; flags" → the parts the form edits.
function rulesOf(p) {
  const parts = String((p && p.relief_guards) || '').split(';');
  const flags = String(parts[3] || '');
  const r = flags.match(/R([ABCG]*)/);
  return {
    regular: idList(p && p.regular_guards), relief: idList(parts[0]),
    priority: (flags.match(/[1-9]/) || [''])[0], never_empty: flags.includes('F'), daily: flags.includes('D'), weekdays: flags.includes('W'),
    regular_only: r ? (r[1] || 'ABCG') : ''
  };
}

// An ordered list of guards (first = first choice): chips with ↑ and ✕, and a search to add more.
function GuardPick({ label, help, all, value, onChange }) {
  const [find, setFind] = useState('');
  const byId = new Map(all.map(g => [String(g.ROWID), g]));
  const n = find.trim().toLowerCase();
  const hits = n.length < 2 ? [] : all.filter(g => !value.includes(String(g.ROWID)) && (g.guard_name + ' ' + g.id_number).toLowerCase().includes(n)).slice(0, 8);
  const move = i => { const v = value.slice(); [v[i - 1], v[i]] = [v[i], v[i - 1]]; onChange(v); };
  return (
    <div className="pp-pick">
      <div className="pp-pick-title">{label} <span>({value.length})</span></div>
      {help && <div className="master-sub">{help}</div>}
      <div className="pp-chips">
        {value.map((id, i) => (
          <span key={id} className="pp-chip">{i + 1}. {byId.get(id) ? byId.get(id).guard_name : 'Guard ' + id}
            {i > 0 && <button type="button" onClick={() => move(i)} title="Move up">↑</button>}
            <button type="button" onClick={() => onChange(value.filter(x => x !== id))} title="Remove">✕</button>
          </span>
        ))}
        {value.length === 0 && <span className="master-sub">Nobody yet</span>}
      </div>
      <input type="search" value={find} onChange={e => setFind(e.target.value)} placeholder="🔍 Add: type a name or ID" />
      {hits.length > 0 && (
        <div className="pp-hits">
          {hits.map(g => <button type="button" key={g.ROWID} onClick={() => { onChange([...value, String(g.ROWID)]); setFind(''); }}>+ {g.guard_name} · {g.id_number}</button>)}
        </div>
      )}
    </div>
  );
}

// The places of each branch where a guard can be put: Gate 3, Lobby, Escort…
// A post is switched off, never deleted, because old duty charts point to it.
export default function PostsPage() {
  // Supervisors only look; a branch admin or higher adds and changes posts.
  // A supervisor sets up their own agency's posts (Prem, 25 Oct); City / State / Admin only look.
  const me = useUser();
  const isSup = !!me && me.role === 'supervisor';
  const canEdit = isSup || (atLeast(me, 'branch_admin') && !['city_admin', 'state_admin', 'admin'].includes(me.role));
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading');
  const [branch, setBranch] = useState('');
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  // List filters (Prem, 25 Oct) and the guards for the Auto fill lists (read when a form opens).
  const [agencyFilter, setAgencyFilter] = useState('');
  // Where filters (Prem, 25 Oct: see the total posts by state → city → branch → agency).
  const [stateFilter, setStateFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [find, setFind] = useState('');
  const [guards, setGuards] = useState(null);
  const loadGuards = () => { if (!guards) api.getGuards().then(r => setGuards(r.data)).catch(() => setGuards([])); };

  // No auto-refresh: every load costs Data Store reads. Use 🔄 instead.
  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const d = (await api.getPosts()).data;
      setData(d);
      setBranch(b => b || 'ALL');
      setStatus('ok');
    } catch (err) {
      console.error('Posts load failed:', err);
      setStatus('error');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Same order as the daily roster sheet: section, then place in it.
  const SECS = ['PKL / Main', 'Hospital Block', 'MLCP'];
  const secRank = p => { const i = SECS.indexOf(p.section); return i < 0 ? 99 : i; };
  const branchOf = id => (data ? data.branches.find(b => String(b.ROWID) === String(id)) : null) || {};
  const states = data ? [...new Set(data.branches.map(b => b.state).filter(Boolean))].sort() : [];
  const cities = data ? [...new Set(data.branches.filter(b => !stateFilter || b.state === stateFilter).map(b => b.city).filter(Boolean))].sort() : [];
  const branchesShown = data ? data.branches.filter(b => (!stateFilter || b.state === stateFilter) && (!cityFilter || b.city === cityFilter)) : [];
  const posts = data ? data.posts.filter(p => (branch === 'ALL' ? branchesShown.some(b => String(b.ROWID) === String(p.branch_id)) : String(p.branch_id) === branch) && (!agencyFilter || String(p.agency_id) === agencyFilter)
    && (!find.trim() || p.post_name.toLowerCase().includes(find.trim().toLowerCase())))
    .sort((a, b) => secRank(a) - secRank(b) || (Number(a.sort_order) || 999) - (Number(b.sort_order) || 999) || a.post_name.localeCompare(b.post_name)) : [];

  function putRow(saved) {
    setData(d => ({
      ...d,
      posts: [...d.posts.filter(p => String(p.ROWID) !== String(saved.ROWID)), saved]
        .sort((a, b) => a.post_name.localeCompare(b.post_name))
    }));
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = { rules: form.rules, branch_id: form.branch_id || branch, post_name: form.post_name, post_type: form.post_type, agency_id: form.agency_id, vehicle_entry: isOn(form.vehicle_entry), extra_duty: isOn(form.extra_duty), auto_fill: isOn(form.auto_fill), section: form.section, sort_order: form.sort_order, shift_codes: form.shift_codes };
      const saved = form.ROWID
        ? (await api.updatePost({ ...body, ROWID: form.ROWID, is_active: form.is_active !== 'false' })).data
        : (await api.addPost(body)).data;
      putRow(saved);
      setNote('✅ ' + saved.post_name + (form.ROWID ? ' saved.' : ' added.'));
      setForm(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function setActive(p, active) {
    setError('');
    setNote('');
    try {
      putRow((await api.updatePost({ ...p, vehicle_entry: isOn(p.vehicle_entry), extra_duty: isOn(p.extra_duty), auto_fill: isOn(p.auto_fill), is_active: active })).data);
      setNote((active ? '↩️ ' : '🚫 ') + p.post_name + (active ? ' is open again.' : ' is switched off.'));
    } catch (err) {
      setError(err.message);
    }
  }

  const agencyName = id => ((data && data.agencies.find(a => String(a.ROWID) === String(id))) || {}).agency_name || '⚠️ Not set';
  const branchLabel = b => b.branch_name + (b.area ? ' (' + b.area + ')' : '') + ' · ' + b.city;

  return (
    <>
      <div className="titlebar">
        <h1>📍 Posts</h1>
      </div>

      <div className="toolbar no-print">
        <a className="btn secondary" href="#master">🛡️ Guard Master</a>
        <a className="btn secondary" href="#history">📖 Duty History</a>
        {data && states.length > 1 && (
          <select value={stateFilter} onChange={e => { setStateFilter(e.target.value); setCityFilter(''); setBranch('ALL'); }} aria-label="State">
            <option value="">All states</option>
            {states.map(x => <option key={x}>{x}</option>)}
          </select>
        )}
        {data && cities.length > 1 && (
          <select value={cityFilter} onChange={e => { setCityFilter(e.target.value); setBranch('ALL'); }} aria-label="City">
            <option value="">All cities</option>
            {cities.map(x => <option key={x}>{x}</option>)}
          </select>
        )}
        {data && (
          <select id="p-branch" value={branch} onChange={e => { setBranch(e.target.value); setForm(null); }} aria-label="Branch">
            <option value="ALL">All branches ({branchesShown.length})</option>
            {branchesShown.map(b => <option key={b.ROWID} value={b.ROWID}>{branchLabel(b)}</option>)}
          </select>
        )}
        {data && !isSup && (
          <select value={agencyFilter} onChange={e => setAgencyFilter(e.target.value)} aria-label="Agency">
            <option value="">All agencies</option>
            {data.agencies.filter(a => branch === 'ALL' || worksIn(a, branch)).map(a => <option key={a.ROWID} value={a.ROWID}>{a.agency_name}</option>)}
          </select>
        )}
        <input type="search" value={find} onChange={e => setFind(e.target.value)} placeholder="🔍 Post name" aria-label="Find a post" />
        <div className="spacer"></div>
        {canEdit && <button className="btn secondary" onClick={() => { setError(''); setNote(''); loadGuards(); setForm({ ...BLANK_POST, branch_id: branch === 'ALL' ? (branchesShown[0] ? String(branchesShown[0].ROWID) : '') : branch, agency_id: isSup ? String(me.agency_id) : '', rules: rulesOf(null) }); }}>➕ Add post</button>}
        <button className="btn" onClick={load}>🔄 Refresh</button>
      </div>

      <div className="dash">
        <div className="sim-note">Places where a guard stands. 🚐 ESCORT = the guard goes on the escort duty sheet.</div>
        {error && <div className="trip-error">{error}</div>}
        {note && <div className="sim-push">{note}</div>}

        {form && (
          <form className="master-form" onSubmit={save}>
            <div className="master-form-title">{form.ROWID ? '✏️ Edit ' + form.post_name : '➕ New post'}</div>
            {/* Order (Prem, 25 Oct): where (branch, agency) → what (name, type, place on the sheet, shifts) →
                options → Auto fill details. */}
            <div className="master-grid">
              <label>1 · Branch
                <select value={form.branch_id || branch} onChange={e => setForm(f => ({ ...f, branch_id: e.target.value, agency_id: isSup ? f.agency_id : '' }))} disabled={!!form.ROWID}>
                  {data.branches.map(b => <option key={b.ROWID} value={b.ROWID}>{branchLabel(b)}</option>)}
                </select>
              </label>
              <label>2 · Agency (one agency per post)
                <select id="p-agency" value={form.agency_id || ''} onChange={e => setForm(f => ({ ...f, agency_id: e.target.value, rules: rulesOf(null) }))} required>
                  <option value="">Pick the agency</option>
                  {data.agencies.filter(a => (isOn(a.is_active) && worksIn(a, form.branch_id || branch) && (!isSup || String(a.ROWID) === String(me.agency_id))) || String(a.ROWID) === String(form.agency_id)).map(a => <option key={a.ROWID} value={a.ROWID}>{a.agency_name}</option>)}
                </select>
              </label>
              <label>3 · Post name<input id="p-name" value={form.post_name} onChange={e => setForm(f => ({ ...f, post_name: e.target.value }))} placeholder="Gate 3" required /></label>
              <label>4 · Type
                <select id="p-type" value={form.post_type} onChange={e => setForm(f => ({ ...f, post_type: e.target.value }))}>
                  <option value="POST">📍 POST (stands at a place)</option>
                  <option value="ESCORT">🚐 ESCORT (cab trips, escort duty sheet)</option>
                </select>
              </label>
              <label>5 · Section (on the daily sheet)
                <input value={form.section || ''} onChange={e => setForm(f => ({ ...f, section: e.target.value }))} list="p-sections" placeholder="PKL / Main" maxLength={30} />
              </label>
              <datalist id="p-sections">{[...new Set(data.posts.map(p => p.section).filter(Boolean))].map(s => <option key={s} value={s} />)}</datalist>
              <label>Row in the section<input type="number" min="1" value={form.sort_order ?? ''} onChange={e => setForm(f => ({ ...f, sort_order: e.target.value }))} /></label>
              <div className="p-shifts">6 · Shifts
                <div>{['A', 'B', 'C', 'G'].map(c => (
                  <label key={c} className="master-check">
                    <input type="checkbox" checked={String(form.shift_codes || '').includes(c)} onChange={e => setForm(f => ({ ...f, shift_codes: ['A', 'B', 'C', 'G'].filter(x => x === c ? e.target.checked : String(f.shift_codes || '').includes(x)).join('') }))} /> {c}
                  </label>
                ))}</div>
              </div>
              <label className="master-check">
                <input type="checkbox" checked={isOn(form.vehicle_entry)} onChange={e => setForm(f => ({ ...f, vehicle_entry: e.target.checked }))} />
                🚗 Visitor / vehicle entry at this post
              </label>

            </div>

            {/* Auto fill is taken out of Post setup (Prem, 25 Oct): its rules were made for IPF · Estancia only;
                each agency and branch has its own. The posts set up before keep working; this block stays for later. */}
            {false && isOn(form.auto_fill) && form.rules && (
              <div className="pp-rules">
                <div className="master-form-title">8 · ⚡ Auto fill details</div>
                {!form.agency_id ? <div className="master-sub">Pick the agency first: the lists take that agency's guards.</div> : <>
                  {(() => {
                    const pool = (guards || []).filter(g => String(g.agency_id) === String(form.agency_id) && String(g.branch_id) === String(form.branch_id || branch));
                    const setRule = (k, v) => setForm(f => ({ ...f, rules: { ...f.rules, [k]: v } }));
                    return <>
                      {!guards && <div className="master-sub">Loading guards...</div>}
                      <GuardPick label="Regular guards" help="They stand here first, on their roster shift (first = first choice)." all={pool} value={form.rules.regular} onChange={v => setRule('regular', v)} />
                      <GuardPick label="Relief guards" help="When a regular is off: these, in this order (5 or more also lets free guards fill it)." all={pool} value={form.rules.relief} onChange={v => setRule('relief', v)} />
                      <div className="pp-flags">
                        <label>Priority
                          <select value={form.rules.priority} onChange={e => setRule('priority', e.target.value)}>
                            <option value="">Normal</option>
                            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => <option key={d} value={d}>{d}{d === '1' ? ' (filled first)' : ''}</option>)}
                          </select>
                        </label>
                        <label className="master-check"><input type="checkbox" checked={form.rules.never_empty} onChange={e => setRule('never_empty', e.target.checked)} /> F · Never empty (any free guard of the team if the lists have nobody)</label>
                        <label className="master-check"><input type="checkbox" checked={form.rules.daily} onChange={e => setRule('daily', e.target.checked)} /> D · Daily rotation (never yesterday's guard)</label>
                        <label className="master-check"><input type="checkbox" checked={form.rules.weekdays} onChange={e => setRule('weekdays', e.target.checked)} /> W · Weekdays only (no row on Sat / Sun)</label>
                        <label className="master-check"><input type="checkbox" checked={!!form.rules.regular_only} onChange={e => setRule('regular_only', e.target.checked ? 'ABCG' : '')} /> R · Row only when a regular works that shift</label>
                        {!!form.rules.regular_only && (
                          <div className="pp-rshifts">R for {['A', 'B', 'C', 'G'].map(c => (
                            <label key={c} className="master-check"><input type="checkbox" checked={form.rules.regular_only.includes(c)}
                              onChange={e => setRule('regular_only', ['A', 'B', 'C', 'G'].filter(x => x === c ? e.target.checked : form.rules.regular_only.includes(x)).join('') || 'ABCG')} /> {c}</label>
                          ))}</div>
                        )}
                      </div>
                    </>;
                  })()}
                </>}
              </div>
            )}
            <div className="link-actions">
              <button className="btn" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save post'}</button>
              <button className="btn secondary" type="button" onClick={() => setForm(null)}>Cancel</button>
            </div>
          </form>
        )}

        {status === 'loading' && <div className="loading-message">Loading...</div>}
        {status === 'error' && <div className="loading-message">Could not load. Check your connection and press Refresh.</div>}

        {status === 'ok' && <div className="dash-legend">Total posts: <b>{posts.filter(p => p.is_active === 'true').length}</b> on{posts.some(p => p.is_active !== 'true') ? ' · ' + posts.filter(p => p.is_active !== 'true').length + ' off' : ''}</div>}
        {status === 'ok' && (
          <div className="dash-scroll">
            <table className="dash-table adm-table">
              <thead>
                <tr><th>#</th><th>Post</th><th>Agency</th><th>Branch</th><th>City</th><th>State</th><th>Section</th><th>Shifts</th><th>Type</th><th>Vehicle entry</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {posts.map((p, i) => {
                  const off = p.is_active !== 'true';
                  const b = branchOf(p.branch_id);
                  return (
                    <tr key={p.ROWID} className={off ? 'master-left' : ''}>
                      <td className="master-sub">{i + 1}</td>
                      <td className="left">{p.post_name}</td>
                      <td>{agencyName(p.agency_id)}</td>
                      <td className="left">{b.branch_name || '—'}</td>
                      <td>{b.city || '—'}</td>
                      <td>{b.state || '—'}</td>
                      <td>{p.section ? p.section + (p.sort_order ? ' · ' + p.sort_order : '') : '—'}</td>
                      <td>{p.shift_codes || 'All'}</td>
                      <td>{p.post_type === 'ESCORT' ? '🚐 ESCORT' : '📍 POST'}</td>
                      <td>{isOn(p.vehicle_entry) ? '🚗 Yes' : '—'}</td>
                      <td><Toggle on={!off} label={p.post_name} disabled={!canEdit} onChange={() => setActive(p, off)} /></td>
                      <td className="adm-actions">{canEdit && !off && <IconBtn icon="✏️" label={'Edit ' + p.post_name} onClick={() => { setError(''); setNote(''); loadGuards(); setForm({ ...p, rules: rulesOf(p) }); window.scrollTo({ top: 0 }); }} />}</td>
                    </tr>
                  );
                })}
                {posts.length === 0 && <tr><td colSpan="12">No posts in this branch yet. Press ➕ Add post.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
