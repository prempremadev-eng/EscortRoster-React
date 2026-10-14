import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';

const NO_FILTERS = { state: '', city: '', branch: '', agency: '', duty: '', status: '', q: '' };
const BLANK_GUARD = { id_number: '', guard_name: '', agency: '', branch_id: '', duty_type: 'POST', post_name: '', escort_id: '', phone: '' };
const STATUS_LABEL = { IN: '✅ IN', OUT: '🚪 OUT', NONE: '⏳ Not yet' };

const uniq = list => [...new Set(list)];

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

// Head-office register: every guard of every branch, today's card status, filters, add guard.
export default function GuardMaster() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading');
  const [filters, setFilters] = useState(NO_FILTERS);
  const [form, setForm] = useState(null);
  const [freeEscorts, setFreeEscorts] = useState(null);
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
  const guards = data ? data.guards : [];

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
      && (!filters.duty || g.duty_type === filters.duty)
      && (!q || g.guard_name.toLowerCase().includes(q) || g.id_number.toLowerCase().includes(q));
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

  function openForm() {
    setError('');
    setNote('');
    setForm({ ...BLANK_GUARD, branch_id: filters.branch || '' });
  }

  async function setFormField(key, value) {
    setForm(prev => ({ ...prev, [key]: value }));
    // The escort list costs reads, so fetch it only when ESCORT is picked.
    if (key === 'duty_type' && value === 'ESCORT' && !freeEscorts) {
      try {
        setFreeEscorts((await api.getFreeEscorts()).data);
      } catch (err) {
        setError(err.message);
      }
    }
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = { ...form };
      if (payload.duty_type === 'POST') delete payload.escort_id;
      else delete payload.post_name;
      const saved = (await api.addGuard(payload)).data;
      // Add the new row ourselves instead of reloading everything (saves reads).
      setData(prev => ({
        ...prev,
        guards: [...prev.guards, saved].sort((a, b) => a.id_number.localeCompare(b.id_number))
      }));
      if (saved.escort_id) setFreeEscorts(prev => prev && prev.filter(x => String(x.ROWID) !== String(saved.escort_id)));
      setNote('✅ ' + saved.guard_name + ' (' + saved.id_number + ') added.');
      setForm(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const branchLabel = b => b.branch_name + (b.area ? ' (' + b.area + ')' : '');

  return (
    <>
      <div className="titlebar">
        <h1>🛡️ Guard Master</h1>
      </div>

      <div className="toolbar no-print">
        <a className="btn secondary" href="#simulator">🪪 Card Simulator</a>
        <a className="btn secondary" href="#links">🔗 Guard Links</a>
        {data && <div><label>Duty day:</label> {data.dutyDate}</div>}
        <div className="spacer"></div>
        <button className="btn secondary" onClick={openForm}>➕ Add guard</button>
        <button className="btn" onClick={load}>🔄 Refresh</button>
      </div>

      <div className="dash">
        {error && <div className="trip-error">{error}</div>}
        {note && <div className="sim-push">{note}</div>}

        {form && (
          <form className="master-form" onSubmit={save}>
            <div className="master-form-title">➕ New guard</div>
            <div className="master-grid">
              <label>ID number<input id="g-id" value={form.id_number} onChange={e => setFormField('id_number', e.target.value)} placeholder="SG-1009" required /></label>
              <label>Name<input id="g-name" value={form.guard_name} onChange={e => setFormField('guard_name', e.target.value)} required /></label>
              <label>Agency<input id="g-agency" value={form.agency} onChange={e => setFormField('agency', e.target.value)} list="g-agencies" required /></label>
              <label>Branch
                <select id="g-branch" value={form.branch_id} onChange={e => setFormField('branch_id', e.target.value)} required>
                  <option value="">Pick a branch</option>
                  {branches.map(b => <option key={b.ROWID} value={b.ROWID}>{branchLabel(b)} · {b.city}</option>)}
                </select>
              </label>
              <label>Duty
                <select id="g-duty" value={form.duty_type} onChange={e => setFormField('duty_type', e.target.value)}>
                  <option value="POST">📍 POST</option>
                  <option value="ESCORT">🚐 ESCORT</option>
                </select>
              </label>
              {form.duty_type === 'POST' ? (
                <label>Post<input id="g-post" value={form.post_name} onChange={e => setFormField('post_name', e.target.value)} placeholder="Gate 3" required /></label>
              ) : (
                <label>Escort (duty sheet name)
                  <select id="g-escort" value={form.escort_id} onChange={e => setFormField('escort_id', e.target.value)} required>
                    <option value="">{freeEscorts ? 'Pick an escort' : 'Loading...'}</option>
                    {(freeEscorts || []).map(x => <option key={x.ROWID} value={x.ROWID}>{x.escort_name}</option>)}
                  </select>
                </label>
              )}
              <label>Phone (optional)<input id="g-phone" value={form.phone} onChange={e => setFormField('phone', e.target.value)} inputMode="tel" /></label>
            </div>
            <datalist id="g-agencies">{uniq(guards.map(g => g.agency)).map(a => <option key={a} value={a} />)}</datalist>
            {form.duty_type === 'ESCORT' && freeEscorts && freeEscorts.length === 0 && (
              <div className="sim-note">Every escort on the duty sheet already has a guard.</div>
            )}
            <div className="link-actions">
              <button className="btn" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save guard'}</button>
              <button className="btn secondary" type="button" onClick={() => setForm(null)}>Cancel</button>
            </div>
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
              <label>Duty
                <select id="f-duty" value={filters.duty} onChange={e => setFilter('duty', e.target.value)}>
                  <option value="">All duties</option>
                  <option value="POST">📍 POST</option>
                  <option value="ESCORT">🚐 ESCORT</option>
                </select>
              </label>
              <label className="master-search">Search name / ID
                <input id="f-q" type="search" value={filters.q} onChange={e => setFilter('q', e.target.value)} placeholder="Murugan or SG-1001" />
              </label>
            </div>

            <div className="master-bar">
              <div className="master-trail">Showing: <b>{trail.join(' › ')}</b></div>
              <button className={'btn' + (filters.duty === 'ESCORT' ? '' : ' secondary')} onClick={() => toggle('duty', 'ESCORT')}>🚐 Escorts</button>
              <button className="btn secondary" onClick={() => setFilters(NO_FILTERS)}>Clear filters</button>
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
                  <tr><th>ID</th><th>Guard</th><th>Agency</th><th>Branch</th><th>Duty</th><th>IN</th><th>OUT</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {shown.map(g => {
                    const b = branchById[String(g.branch_id)];
                    const t = today[String(g.ROWID)] || { status: 'NONE' };
                    return (
                      <tr key={g.ROWID}>
                        <td>{g.id_number}</td>
                        <td className="left">{g.guard_name}</td>
                        <td>{g.agency}</td>
                        <td className="left">{b ? branchLabel(b) : '—'}<div className="master-sub">{b ? b.city + ', ' + b.state : ''}</div></td>
                        <td>{g.duty_type === 'POST' ? '📍 ' + (g.post_name || 'Post') : '🚐 Escort'}</td>
                        <td>{t.firstIn || '—'}</td>
                        <td>{t.lastOut || '—'}</td>
                        <td className={t.status === 'IN' ? 'sim-in' : ''}>{STATUS_LABEL[t.status]}</td>
                      </tr>
                    );
                  })}
                  {shown.length === 0 && <tr><td colSpan="8">No guards match these filters.</td></tr>}
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
