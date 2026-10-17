import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { worksIn } from '../agency.js';
import { IconBtn } from './RowControls.jsx';

const NO_FILTERS = { state: '', city: '', branch: '', agency: '', status: '', q: '' };
const BLANK_GUARD = { id_number: '', card_number: '', guard_name: '', agency_id: '', branch_id: '', escort_id: '', phone: '', aadhaar: '' };
const when = t => String(t || '').slice(0, 16);
const STATUS_LABEL = { IN: '✅ IN', OUT: '🚪 OUT', NONE: '⏳ Not yet' };

const uniq = list => [...new Set(list)];

// "📍 Gate 3 · A", "🚐 Escort · C" or "⏳ Not assigned" (this week's Duty Chart).
export const dutyLabel = d => (d ? (d.post_type === 'ESCORT' ? '🚐 ' : '📍 ') + d.post_name + ' · ' + d.shift_code : '⏳ Not assigned');

// Today's swipes (oldest first) -> { guard ROWID: { status, firstIn, lastOut } }.
function todayStatus(swipes) {
  const map = {};
  swipes.forEach(s => {
    const id = String(s.guard_id);
    const m = map[id] || (map[id] = { status: 'NONE', firstIn: '', lastOut: '' });
    m.status = s.direction;
    if (s.direction === 'IN' && !m.firstIn) m.firstIn = s.punch_time;
    if (s.direction === 'OUT') m.lastOut = s.punch_time;
  });
  return map;
}

// Head-office register: every guard of every branch, today's card status, filters,
// add / edit a guard, and switch off a guard who left (never deleted).
export default function GuardMaster() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading');
  const [filters, setFilters] = useState(NO_FILTERS);
  const [showLeft, setShowLeft] = useState(false);
  const [form, setForm] = useState(null);
  const [confirmLeft, setConfirmLeft] = useState(false);
  const [freeEscorts, setFreeEscorts] = useState(null);
  // Photo picked in the form (sent after the guard is saved) and the saved photo's link.
  const [photoFile, setPhotoFile] = useState(null);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  // No auto-refresh: every load costs Data Store reads. Use 🔄 instead.
  const load = useCallback(async () => {
    setStatus('loading');
    try {
      setData((await api.getMaster()).data);
      setStatus('ok');
    } catch (err) {
      console.error('Guard master load failed:', err);
      setStatus('error');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const branches = data ? data.branches : [];
  const branchById = useMemo(() => {
    const map = {};
    branches.forEach(b => { map[String(b.ROWID)] = b; });
    return map;
  }, [branches]);
  const today = useMemo(() => todayStatus(data ? data.swipes : []), [data]);

  // Cascading: picking a state narrows the city list, picking a city narrows the branch list.
  const inState = branches.filter(b => !filters.state || b.state === filters.state);
  const inCity = inState.filter(b => !filters.city || b.city === filters.city);
  const allGuards = data ? data.guards : [];
  const leftCount = allGuards.filter(g => g.is_active !== 'true').length;
  const guards = showLeft ? allGuards : allGuards.filter(g => g.is_active === 'true');

  const statusOf = g => (today[String(g.ROWID)] || { status: 'NONE' }).status;
  const q = filters.q.trim().toLowerCase();
  // Everything except the status filter, so the summary boxes count the same group.
  const base = guards.filter(g => {
    const b = branchById[String(g.branch_id)];
    if (!b) return !filters.state && !filters.city && !filters.branch;
    return (!filters.state || b.state === filters.state)
      && (!filters.city || b.city === filters.city)
      && (!filters.branch || String(b.ROWID) === filters.branch)
      && (!filters.agency || g.agency === filters.agency)
      && (!q || g.guard_name.toLowerCase().includes(q) || g.id_number.toLowerCase().includes(q) || String(g.card_number || '').toLowerCase().includes(q));
  });
  const shown = base.filter(g => !filters.status || statusOf(g) === filters.status);
  const count = s => base.filter(g => statusOf(g) === s).length;

  function setFilter(key, value) {
    setFilters(prev => {
      const next = { ...prev, [key]: value };
      if (key === 'state') { next.city = ''; next.branch = ''; }
      if (key === 'city') next.branch = '';
      return next;
    });
  }
  const toggle = (key, value) => setFilter(key, filters[key] === value ? '' : value);

  const trail = ['All companies'];
  if (filters.state) trail.push(filters.state);
  if (filters.city) trail.push(filters.city);
  if (filters.branch && branchById[filters.branch]) trail.push(branchById[filters.branch].branch_name);

  // The escort list costs reads, so fetch it only when the escort box is opened.
  // `keep` = the escort of the guard being edited, so it stays in the list.
  async function loadFreeEscorts(keep) {
    if (freeEscorts) return;
    try {
      setFreeEscorts((await api.getFreeEscorts(keep)).data);
    } catch (err) {
      setError(err.message);
    }
  }

  function openForm(g) {
    setError('');
    setNote('');
    setConfirmLeft(false);
    const next = g
      ? { ...BLANK_GUARD, ...g, card_number: g.card_number || '', agency_id: g.agency_id || '', escort_id: g.escort_id || '', phone: g.phone || '', aadhaar: '' }
      : { ...BLANK_GUARD, branch_id: filters.branch || (branches.length === 1 ? String(branches[0].ROWID) : '') };
    setForm(next);
    setFreeEscorts(null);
    setPhotoFile(null);
    setPhotoUrl(null);
    // The saved photo is fetched only when a guard with a photo is opened (one read).
    if (g && g.photo_key) api.guardPhotoUrl(g.ROWID).then(r => setPhotoUrl(r.data.url)).catch(() => {});
    window.scrollTo({ top: 0 });
  }

  function setFormField(key, value) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  // Put a saved row into the list ourselves instead of reloading everything (saves reads).
  function putRow(saved) {
    setData(prev => {
      const old = prev.guards.find(x => String(x.ROWID) === String(saved.ROWID));
      return {
        ...prev,
        guards: [...prev.guards.filter(x => x !== old), { ...old, ...saved }]
          .sort((a, b) => a.id_number.localeCompare(b.id_number))
      };
    });
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const fields = ['id_number', 'card_number', 'guard_name', 'agency_id', 'branch_id', 'phone', 'escort_id', 'aadhaar'];
      const payload = {};
      fields.forEach(k => { payload[k] = form[k]; });
      let saved = form.ROWID
        ? (await api.updateGuard({ ROWID: form.ROWID, ...payload })).data
        : (await api.addGuard(payload)).data;
      if (photoFile) saved = { ...saved, photo_key: (await api.guardPhoto(saved.ROWID, photoFile)).data.photo_key };
      putRow(saved);
      setPhotoFile(null);
      setNote('✅ ' + saved.guard_name + ' (' + saved.id_number + ') ' + (form.ROWID ? 'saved.' : 'added.'));
      setForm(null);
      setFreeEscorts(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function setActive(g, active) {
    setSaving(true);
    setError('');
    setNote('');
    try {
      putRow((await api.setGuardActive(g.ROWID, active)).data);
      setNote(active ? '↩️ ' + g.guard_name + ' is active again.' : '🚫 ' + g.guard_name + ' is switched off (left). Their link and phone stop working.');
      setForm(null);
      setFreeEscorts(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
      setConfirmLeft(false);
    }
  }

  const branchLabel = b => b.branch_name + (b.area ? ' (' + b.area + ')' : '');

  return (
    <>
      <div className="titlebar">
        <h1>🛡️ Guard Master</h1>
      </div>

      <div className="toolbar no-print">
        <a className="btn secondary" href="#posts">📍 Posts</a>
        <a className="btn secondary" href="#chart">📅 Duty Chart</a>
        <a className="btn secondary" href="#simulator">🪪 Card Simulator</a>
        <a className="btn secondary" href="#links">🔗 Guard Links</a>
        {data && <div><label>Duty day:</label> {data.dutyDate}</div>}
        <div className="spacer"></div>
        <button className="btn secondary" onClick={() => openForm()}>➕ Add guard</button>
        <button className="btn" onClick={load}>🔄 Refresh</button>
      </div>

      <div className="dash">
        {error && <div className="trip-error">{error}</div>}
        {note && <div className="sim-push">{note}</div>}

        {form && (
          <form className="master-form" onSubmit={save}>
            <div className="master-form-title">{form.ROWID ? '✏️ Edit ' + form.guard_name : '➕ New guard'}</div>
            <div className="master-grid">
              <label>ID number<input id="g-id" value={form.id_number} onChange={e => setFormField('id_number', e.target.value)} placeholder="SG-1009" required /></label>
              <label>Card number<input id="g-card" value={form.card_number} onChange={e => setFormField('card_number', e.target.value)} placeholder="Access card no." /></label>
              <label>Name<input id="g-name" value={form.guard_name} onChange={e => setFormField('guard_name', e.target.value)} required /></label>
              <label>Branch
                <select id="g-branch" value={form.branch_id} onChange={e => setForm(f => ({ ...f, branch_id: e.target.value, agency_id: '' }))} required>
                  <option value="">Pick a branch</option>
                  {branches.map(b => <option key={b.ROWID} value={b.ROWID}>{branchLabel(b)} · {b.city}</option>)}
                </select>
              </label>
              <label>Agency
                <select id="g-agency" value={form.agency_id} onChange={e => setFormField('agency_id', e.target.value)} disabled={!form.branch_id} required>
                  <option value="">{form.branch_id ? 'Pick the agency' : 'Pick the branch first'}</option>
                  {data.agencies.filter(a => ((a.is_active === true || a.is_active === 'true') && worksIn(a, form.branch_id)) || String(a.ROWID) === String(form.agency_id)).map(a => <option key={a.ROWID} value={a.ROWID}>{a.agency_name}</option>)}
                </select>
              </label>
              <label>Aadhaar number
                <input id="g-aadhaar" value={form.aadhaar} onChange={e => setFormField('aadhaar', e.target.value)} inputMode="numeric" maxLength={14} autoComplete="off"
                  placeholder={form.aadhaar_last4 ? 'XXXX XXXX ' + form.aadhaar_last4 + ' (type to change)' : '12 digits'} />
              </label>
              <label>Phone (optional)<input id="g-phone" value={form.phone} onChange={e => setFormField('phone', e.target.value)} inputMode="tel" /></label>
              <label>Photo (optional)
                <input id="g-photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setPhotoFile(e.target.files[0] || null)} />
              </label>
              {(photoFile || photoUrl) && <img className="guard-photo" src={photoFile ? URL.createObjectURL(photoFile) : photoUrl} alt={form.guard_name} />}
              {(String(form.escort_id || '') || (data.escortBranches || []).includes(String(form.branch_id))) && <label>Escort duty sheet name (only for escort duty)
                <select id="g-escort" value={form.escort_id} onFocus={() => loadFreeEscorts(form.escort_id)} onChange={e => setFormField('escort_id', e.target.value)}>
                  <option value="">— Not on the escort sheet —</option>
                  {form.escort_id && !freeEscorts && <option value={form.escort_id}>Linked (tap to change)</option>}
                  {(freeEscorts || []).map(x => <option key={x.ROWID} value={x.ROWID}>{x.escort_name}</option>)}
                </select>
              </label>}
            </div>
            <div className="sim-note">Only the guard's own details here. Post and shift are set in 📅 Duty Chart. Aadhaar is stored encrypted; screens show only the last 4 digits.</div>
            {form.ROWID && <div className="master-sub">Added by {form.created_by || '—'} · {when(form.CREATEDTIME)} &nbsp;|&nbsp; Last change by {form.modified_by || '—'} · {when(form.MODIFIEDTIME)}</div>}
            <div className="link-actions">
              <button className="btn" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save guard'}</button>
              <button className="btn secondary" type="button" onClick={() => setForm(null)}>Cancel</button>
              {form.ROWID && form.is_active === 'true' && !confirmLeft && (
                <button className="btn secondary master-danger" type="button" onClick={() => setConfirmLeft(true)}>🚫 Guard left</button>
              )}
            </div>
            {confirmLeft && (
              <div className="master-confirm">
                Switch off <b>{form.guard_name}</b>? Their link and phone stop working. Old swipes stay.
                <div className="link-actions">
                  <button className="btn master-danger-solid" type="button" disabled={saving} onClick={() => setActive(form, false)}>Yes, switch off</button>
                  <button className="btn secondary" type="button" onClick={() => setConfirmLeft(false)}>No</button>
                </div>
              </div>
            )}
          </form>
        )}

        {status === 'loading' && <div className="loading-message">Loading...</div>}
        {status === 'error' && <div className="loading-message">Could not load. Check your connection and press Refresh.</div>}

        {status === 'ok' && (
          <>
            <div className="master-filters">
              <label>State
                <select id="f-state" value={filters.state} onChange={e => setFilter('state', e.target.value)}>
                  <option value="">All states</option>
                  {uniq(branches.map(b => b.state)).map(s => <option key={s}>{s}</option>)}
                </select>
              </label>
              <label>City
                <select id="f-city" value={filters.city} onChange={e => setFilter('city', e.target.value)}>
                  <option value="">All cities</option>
                  {uniq(inState.map(b => b.city)).map(c => <option key={c}>{c}</option>)}
                </select>
              </label>
              <label>Branch
                <select id="f-branch" value={filters.branch} onChange={e => setFilter('branch', e.target.value)}>
                  <option value="">All branches</option>
                  {inCity.map(b => <option key={b.ROWID} value={b.ROWID}>{branchLabel(b)}</option>)}
                </select>
              </label>
              <label>Agency
                <select id="f-agency" value={filters.agency} onChange={e => setFilter('agency', e.target.value)}>
                  <option value="">All agencies</option>
                  {uniq(guards.map(g => g.agency)).sort().map(a => <option key={a}>{a}</option>)}
                </select>
              </label>
              <label className="master-search">Search name / ID / card
                <input id="f-q" type="search" value={filters.q} onChange={e => setFilter('q', e.target.value)} placeholder="Name, ID or card no." />
              </label>
            </div>

            <div className="master-bar">
              <div className="master-trail">Showing: <b>{trail.join(' › ')}</b></div>
              <button className="btn secondary" onClick={() => setFilters(NO_FILTERS)}>Clear filters</button>
              {leftCount > 0 && (
                <label className="master-left-toggle">
                  <input id="f-left" type="checkbox" checked={showLeft} onChange={e => setShowLeft(e.target.checked)} /> Show guards who left ({leftCount})
                </label>
              )}
            </div>

            <div className="dash-cards">
              {[['', 'Guards', base.length], ['IN', '✅ IN now', count('IN')], ['OUT', '🚪 OUT', count('OUT')], ['NONE', '⏳ Not yet IN', count('NONE')]].map(([key, label, n]) => (
                <button key={label} className={'dash-card master-card' + (filters.status === key && key ? ' on' : '')} onClick={() => key && toggle('status', key)}>
                  <div className="dash-card-label">{label}</div>
                  <div className="dash-card-value">{n}</div>
                </button>
              ))}
            </div>

            <div className="dash-scroll">
              <table className="dash-table">
                <thead>
                  <tr><th>ID</th><th>Card</th><th>Guard</th><th>Agency</th><th>Branch</th><th>IN</th><th>OUT</th><th>Status</th><th></th></tr>
                </thead>
                <tbody>
                  {shown.map(g => {
                    const b = branchById[String(g.branch_id)];
                    const t = today[String(g.ROWID)] || { status: 'NONE' };
                    const left = g.is_active !== 'true';
                    return (
                      <tr key={g.ROWID} className={left ? 'master-left' : ''}>
                        <td>{g.id_number}</td>
                        <td>{g.card_number || '—'}</td>
                        <td className="left">{g.photo_key ? '📷 ' : ''}{g.guard_name}<div className="master-sub">{g.modified_by ? 'by ' + g.modified_by : ''}</div></td>
                        <td>{g.agency}</td>
                        <td className="left">{b ? branchLabel(b) : '—'}<div className="master-sub">{b ? b.city + ', ' + b.state : ''}</div></td>
                        <td>{t.firstIn || '—'}</td>
                        <td>{t.lastOut || '—'}</td>
                        <td className={t.status === 'IN' && !left ? 'sim-in' : ''}>{left ? '🚫 Left' : STATUS_LABEL[t.status]}</td>
                        <td className="adm-actions">
                          {left
                            ? <IconBtn icon="↩️" label={'Re-activate ' + g.guard_name} disabled={saving} onClick={() => setActive(g, true)} />
                            : <IconBtn icon="✏️" label={'Edit ' + g.guard_name} onClick={() => openForm(g)} />}
                        </td>
                      </tr>
                    );
                  })}
                  {shown.length === 0 && <tr><td colSpan="9">No guards match these filters.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="dash-legend">{shown.length} of {guards.length} guards · IN = first card IN of the duty day, OUT = last card OUT.</div>
          </>
        )}
      </div>
    </>
  );
}
