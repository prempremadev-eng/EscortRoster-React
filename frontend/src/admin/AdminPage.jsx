import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useUser, atLeast } from '../auth/user.js';
import { agencyBranches, worksIn } from '../agency.js';
import { Toggle, IconBtn } from '../components/RowControls.jsx';

const ROLE_NAME = { super_admin: 'Super Admin', admin: 'Admin', city_admin: 'City Admin', branch_admin: 'Branch Admin', supervisor: 'Supervisor' };
const ROLE_HELP = {
  super_admin: 'Everything, and can add other Super Admins.',
  admin: 'Every city, every branch.',
  city_admin: 'Every branch of one city.',
  branch_admin: 'One branch, every agency.',
  supervisor: 'One branch, only the posts and guards of one agency.'
};
const MAIL_TEXT = { invited: 'Invite mail sent.', already: 'Already a user, so no mail (they sign in with their password).', reset: 'Password link sent.' };
const BLANK_USER = { email: '', name: '', role: '', city: '', branch_id: '', agency_id: '' };
const BLANK_AGENCY = { agency_name: '', branch_ids: [] };
const BLANK_BRANCH = { branch_code: '', branch_name: '', state_id: '', city_id: '' };
const isOn = v => v === true || v === 'true';
const uniq = list => [...new Set(list.filter(Boolean))].sort();

// #admin, in the order things are made: States → Cities → Branches → Agencies → Users.
export default function AdminPage() {
  const me = useUser();
  const canAll = atLeast(me, 'admin');
  const [tab, setTab] = useState(() => (atLeast(me, 'admin') ? 'states' : atLeast(me, 'city_admin') ? 'branches' : 'users'));
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  // One call (about 3 reads). No auto refresh.
  const load = useCallback(async () => {
    setError('');
    try {
      setData((await api.adminData()).data);
    } catch (err) {
      setError(err.message);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function run(task, done) {
    setBusy(true);
    setError('');
    setNote('');
    try {
      const r = await task();
      setNote(done(r));
      setForm(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const branchName = id => { const b = data && data.branches.find(x => String(x.ROWID) === String(id)); return b ? b.branch_name + (b.area ? ' (' + b.area + ')' : '') + ' · ' + b.city : ''; };
  const agencyName = id => ((data && data.agencies.find(a => String(a.ROWID) === String(id))) || {}).agency_name || '';
  const area = u => u.role === 'city_admin' ? u.city : u.role === 'branch_admin' ? branchName(u.branch_id) : u.role === 'supervisor' ? branchName(u.branch_id) + ' · ' + agencyName(u.agency_id) : 'All';
  const canCity = atLeast(me, 'city_admin');

  function open(kind, row) {
    setError('');
    setNote('');
    setForm({ kind, ...row });
    window.scrollTo({ top: 0 });
  }

  function saveUser(e) {
    e.preventDefault();
    const body = { ROWID: form.ROWID, email: form.email, name: form.name, role: form.role, city: form.city, branch_id: form.branch_id, agency_id: form.agency_id };
    if (form.ROWID) run(() => api.userUpdate(body), () => '✅ ' + form.name + ' saved.');
    else run(() => api.userAdd(body), r => '✅ ' + form.name + ' added. ' + MAIL_TEXT[r.data.mail]);
  }
  function saveBranch(e) {
    e.preventDefault();
    const { kind, ...body } = form;
    run(() => api.branchSave({ ...body, is_active: form.is_active === undefined ? true : isOn(form.is_active) }), () => '✅ ' + form.branch_name + ' saved.');
  }
  function saveState(e) {
    e.preventDefault();
    run(() => api.stateSave({ ROWID: form.ROWID, state_name: form.state_name, country: form.country || 'India', is_active: form.is_active === undefined ? true : isOn(form.is_active) }), () => '✅ ' + form.state_name + ' saved.');
  }
  function saveCity(e) {
    e.preventDefault();
    run(() => api.citySave({ ROWID: form.ROWID, city_name: form.city_name, state_id: form.state_id, is_active: form.is_active === undefined ? true : isOn(form.is_active) }), () => '✅ ' + form.city_name + ' saved.');
  }
  function saveAgency(e) {
    e.preventDefault();
    const { kind, ...body } = form;
    run(() => api.agencySave({ ...body, is_active: form.is_active === undefined ? true : isOn(form.is_active) }), () => '✅ ' + form.agency_name + ' saved.');
  }

  const cities = data ? uniq(data.cities.filter(c => isOn(c.is_active)).map(c => c.city_name)) : [];
  const stateName = id => ((data && data.states.find(x => String(x.ROWID) === String(id))) || {}).state_name || '';
  const cityOf = id => (data && data.cities.find(c => String(c.ROWID) === String(id))) || null;
  const tabBtn = (key, label) => <button className={'btn' + (tab === key ? '' : ' secondary')} onClick={() => { setTab(key); setForm(null); }}>{label}</button>;
  const activeBranches = data ? data.branches.filter(b => isOn(b.is_active)) : [];

  return (
    <>
      <div className="titlebar">
        <h1>⚙️ Admin</h1>
      </div>

      <div className="toolbar no-print">
        {canAll && tabBtn('states', '1 🗺️ States')}
        {canAll && tabBtn('cities', '2 🏙️ Cities')}
        {canCity && tabBtn('branches', (canAll ? '3 ' : '') + '🏢 Branches')}
        {canCity && tabBtn('agencies', (canAll ? '4 ' : '') + '🛡️ Agencies')}
        {tabBtn('users', (canAll ? '5 ' : '') + '👤 Users')}
        <div className="spacer"></div>
        {tab === 'states' && <button className="btn secondary" onClick={() => open('state', { state_name: '', country: 'India' })}>➕ Add state</button>}
        {tab === 'cities' && <button className="btn secondary" onClick={() => open('city', { city_name: '', state_id: '' })} disabled={!data || !data.states.length}>➕ Add city</button>}
        {tab === 'users' && <button className="btn secondary" onClick={() => open('user', { ...BLANK_USER, role: data && data.roles.length ? data.roles[data.roles.length - 1].code : '' })} disabled={!data}>➕ Add user</button>}
        {tab === 'branches' && <button className="btn secondary" disabled={!data || !data.cities.length} onClick={() => {
          const own = me.role === 'city_admin' && data.cities[0];
          open('branch', { ...BLANK_BRANCH, state_id: own ? String(own.state_id) : '', city_id: own ? String(own.ROWID) : '' });
        }}>➕ Add branch</button>}
        {tab === 'agencies' && <button className="btn secondary" onClick={() => open('agency', { ...BLANK_AGENCY })}>➕ Add agency</button>}
        <button className="btn" onClick={load}>🔄 Refresh</button>
      </div>

      <div className="dash">
        {error && <div className="trip-error">{error}</div>}
        {note && <div className="sim-push">{note}</div>}
        {!data && !error && <div className="loading-message">Loading...</div>}

        {data && form && form.kind === 'user' && (
          <form className="master-form" onSubmit={saveUser}>
            <div className="master-form-title">{form.ROWID ? '✏️ Edit ' + form.name : '➕ New user'}</div>
            <div className="master-grid">
              <label>Email (they sign in with it)<input type="email" value={form.email} onChange={e => set('email', e.target.value)} disabled={!!form.ROWID} required /></label>
              <label>Name (guards see it)<input value={form.name} onChange={e => set('name', e.target.value)} maxLength={100} required /></label>
              <label>Role
                <select value={form.role} onChange={e => set('role', e.target.value)} required>
                  {data.roles.map(r => <option key={r.code} value={r.code}>{r.name}</option>)}
                </select>
              </label>
              {form.role === 'city_admin' && (
                <label>City
                  <select value={form.city} onChange={e => set('city', e.target.value)} required>
                    <option value="">Pick the city</option>
                    {cities.map(c => <option key={c}>{c}</option>)}
                  </select>
                </label>
              )}
              {(form.role === 'branch_admin' || form.role === 'supervisor') && (
                <label>Branch
                  <select value={form.branch_id} onChange={e => set('branch_id', e.target.value)} required>
                    <option value="">Pick the branch</option>
                    {activeBranches.map(b => <option key={b.ROWID} value={b.ROWID}>{branchName(b.ROWID)}</option>)}
                  </select>
                </label>
              )}
              {form.role === 'supervisor' && (
                <label>Agency
                  <select value={form.agency_id} onChange={e => set('agency_id', e.target.value)} required>
                    <option value="">Pick the agency</option>
                    {data.agencies.filter(a => isOn(a.is_active) && worksIn(a, form.branch_id)).map(a => <option key={a.ROWID} value={a.ROWID}>{a.agency_name}</option>)}
                  </select>
                </label>
              )}
            </div>
            <div className="sim-note">{ROLE_HELP[form.role]}{form.ROWID ? '' : ' A new user gets a mail to set their password.'}</div>
            <div className="link-actions">
              <button className="btn" type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save user'}</button>
              <button className="btn secondary" type="button" onClick={() => setForm(null)}>Cancel</button>
            </div>
          </form>
        )}

        {data && form && form.kind === 'branch' && (
          <form className="master-form" onSubmit={saveBranch}>
            <div className="master-form-title">{form.ROWID ? '✏️ Edit ' + form.branch_name : '➕ New branch'}</div>
            <div className="master-grid">
              <label>State
                <select value={form.state_id} onChange={e => setForm(f => ({ ...f, state_id: e.target.value, city_id: '' }))} disabled={me.role === 'city_admin'} required>
                  <option value="">Pick the state</option>
                  {data.states.filter(x => isOn(x.is_active) || String(x.ROWID) === String(form.state_id)).map(x => <option key={x.ROWID} value={x.ROWID}>{x.state_name}</option>)}
                </select>
              </label>
              <label>City
                <select value={form.city_id} onChange={e => set('city_id', e.target.value)} disabled={me.role === 'city_admin' || !form.state_id} required>
                  <option value="">{form.state_id ? 'Pick the city' : 'Pick the state first'}</option>
                  {data.cities.filter(c => String(c.state_id) === String(form.state_id) && (isOn(c.is_active) || String(c.ROWID) === String(form.city_id))).map(c => <option key={c.ROWID} value={c.ROWID}>{c.city_name}</option>)}
                </select>
              </label>
              <label>Branch name<input value={form.branch_name} onChange={e => set('branch_name', e.target.value)} placeholder="Beach" required /></label>
              <label>Branch code<input value={form.branch_code} onChange={e => set('branch_code', e.target.value.toUpperCase())} placeholder="TN-CHN-BCH" required /></label>
            </div>
            <div className="link-actions">
              <button className="btn" type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save branch'}</button>
              <button className="btn secondary" type="button" onClick={() => setForm(null)}>Cancel</button>
            </div>
          </form>
        )}

        {data && form && form.kind === 'state' && (
          <form className="master-form" onSubmit={saveState}>
            <div className="master-form-title">{form.ROWID ? '✏️ Edit ' + form.state_name : '➕ New state'}</div>
            <div className="master-grid">
              <label>State name<input value={form.state_name} onChange={e => set('state_name', e.target.value)} placeholder="Tamil Nadu" maxLength={100} required /></label>
              <label>Country<input value={form.country || ''} onChange={e => set('country', e.target.value)} required /></label>
            </div>
            <div className="link-actions">
              <button className="btn" type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save state'}</button>
              <button className="btn secondary" type="button" onClick={() => setForm(null)}>Cancel</button>
            </div>
          </form>
        )}

        {data && form && form.kind === 'city' && (
          <form className="master-form" onSubmit={saveCity}>
            <div className="master-form-title">{form.ROWID ? '✏️ Edit ' + form.city_name : '➕ New city'}</div>
            <div className="master-grid">
              <label>State
                <select value={form.state_id} onChange={e => set('state_id', e.target.value)} required>
                  <option value="">Pick the state</option>
                  {data.states.filter(x => isOn(x.is_active) || String(x.ROWID) === String(form.state_id)).map(x => <option key={x.ROWID} value={x.ROWID}>{x.state_name}</option>)}
                </select>
              </label>
              <label>City name<input value={form.city_name} onChange={e => set('city_name', e.target.value)} placeholder="Chennai" maxLength={100} required /></label>
            </div>
            <div className="link-actions">
              <button className="btn" type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save city'}</button>
              <button className="btn secondary" type="button" onClick={() => setForm(null)}>Cancel</button>
            </div>
          </form>
        )}

        {data && tab === 'states' && (
          <div className="dash-scroll">
            <table className="dash-table adm-table">
              <thead><tr><th>State</th><th>Country</th><th>Cities</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {data.states.map(x => {
                  const off = !isOn(x.is_active);
                  return (
                    <tr key={x.ROWID} className={off ? 'master-left' : ''}>
                      <td className="left">{x.state_name}</td>
                      <td>{x.country}</td>
                      <td>{data.cities.filter(c => String(c.state_id) === String(x.ROWID)).length}</td>
                      <td><Toggle on={!off} label={x.state_name} disabled={busy} onChange={() => run(() => api.stateSave({ ...x, is_active: off }), () => x.state_name + (off ? ' is on again.' : ' is switched off.'))} /></td>
                      <td className="adm-actions"><IconBtn icon="✏️" label={'Edit ' + x.state_name} onClick={() => open('state', { ...x })} /></td>
                    </tr>
                  );
                })}
                {data.states.length === 0 && <tr><td colSpan="5">No states yet. Press ➕ Add state (e.g. Tamil Nadu).</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {data && tab === 'cities' && (
          <div className="dash-scroll">
            <table className="dash-table adm-table">
              <thead><tr><th>City</th><th>State</th><th>Branches</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {data.cities.map(c => {
                  const off = !isOn(c.is_active);
                  return (
                    <tr key={c.ROWID} className={off ? 'master-left' : ''}>
                      <td className="left">{c.city_name}</td>
                      <td>{stateName(c.state_id)}</td>
                      <td>{data.branches.filter(b => String(b.city_id) === String(c.ROWID)).length}</td>
                      <td><Toggle on={!off} label={c.city_name} disabled={busy} onChange={() => run(() => api.citySave({ ...c, is_active: off }), () => c.city_name + (off ? ' is on again.' : ' is switched off.'))} /></td>
                      <td className="adm-actions"><IconBtn icon="✏️" label={'Edit ' + c.city_name} onClick={() => open('city', { ...c, state_id: String(c.state_id) })} /></td>
                    </tr>
                  );
                })}
                {data.cities.length === 0 && <tr><td colSpan="5">{data.states.length ? 'No cities yet. Press ➕ Add city.' : 'Add a state first (tab 1).'}</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {data && form && form.kind === 'agency' && (
          <form className="master-form" onSubmit={saveAgency}>
            <div className="master-form-title">{form.ROWID ? '✏️ Edit ' + form.agency_name : '➕ New agency'}</div>
            <div className="master-grid">
              <label>Agency name<input value={form.agency_name} onChange={e => set('agency_name', e.target.value)} placeholder="Eagle Eye Services" maxLength={100} required /></label>
            </div>
            <div className="master-form-title">Works in these branches</div>
            <div className="agency-branches">
              {activeBranches.map(b => (
                <label key={b.ROWID} className="master-check">
                  <input type="checkbox" checked={form.branch_ids.includes(String(b.ROWID))}
                    onChange={e => set('branch_ids', e.target.checked ? [...form.branch_ids, String(b.ROWID)] : form.branch_ids.filter(id => id !== String(b.ROWID)))} />
                  {branchName(b.ROWID)}
                </label>
              ))}
              {activeBranches.length === 0 && <span className="pd-muted">Add a branch first (tab 3).</span>}
            </div>
            <div className="sim-note">Posts, guards and supervisors of a branch can pick only the agencies ticked here.</div>
            <div className="link-actions">
              <button className="btn" type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save agency'}</button>
              <button className="btn secondary" type="button" onClick={() => setForm(null)}>Cancel</button>
            </div>
          </form>
        )}

        {data && tab === 'users' && (
          <div className="dash-scroll">
            <table className="dash-table adm-table">
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Area</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {data.users.map(u => {
                  const self = u.email === me.email;
                  const off = !isOn(u.is_active);
                  return (
                    <tr key={u.ROWID} className={off ? 'master-left' : ''}>
                      <td className="left">{u.name}{self ? ' (you)' : ''}</td>
                      <td className="left">{u.email}</td>
                      <td>{u.owner ? '👑 Owner · ' : ''}{ROLE_NAME[u.role]}</td>
                      <td className="left">{area(u)}</td>
                      <td><Toggle on={!off} label={u.name} disabled={busy || !u.canEdit} onChange={() => run(() => api.userActive(u.ROWID, off), () => off ? '↩️ ' + u.name + ' can sign in again.' : '🚫 ' + u.name + ' cannot sign in now.')} /></td>
                      <td className="adm-actions">
                        {u.canEdit && !off && <>
                          <IconBtn icon="✏️" label={'Edit ' + u.name} onClick={() => open('user', { ...BLANK_USER, ...u, city: u.city || '', branch_id: u.branch_id || '', agency_id: u.agency_id || '' })} />
                          <IconBtn icon="📧" label={'Mail ' + u.name + ' again'} disabled={busy} onClick={() => run(() => api.userMail(u.ROWID), r => '📧 ' + u.name + ': ' + MAIL_TEXT[r.data.mail])} />
                        </>}
                      </td>
                    </tr>
                  );
                })}
                {data.users.length === 0 && <tr><td colSpan="6">No users yet. Press ➕ Add user.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {data && tab === 'branches' && (
          <div className="dash-scroll">
            <table className="dash-table adm-table">
              <thead><tr><th>State</th><th>City</th><th>Branch</th><th>Code</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {data.branches.length === 0 && <tr><td colSpan="6">{data.cities.length ? 'No branches yet. Press ➕ Add branch.' : 'Add a state and a city first (tabs 1 and 2).'}</td></tr>}
                {data.branches.slice().sort((x, y) => (x.state + x.city + x.branch_name).localeCompare(y.state + y.city + y.branch_name)).map(b => {
                  const off = !isOn(b.is_active);
                  return (
                    <tr key={b.ROWID} className={off ? 'master-left' : ''}>
                      <td>{b.state}</td>
                      <td>{b.city}</td>
                      <td className="left">{b.branch_name}</td>
                      <td>{b.branch_code}</td>
                      <td><Toggle on={!off} label={b.branch_name} disabled={busy} onChange={() => run(() => api.branchSave({ ...b, city_id: b.city_id, is_active: off }), () => b.branch_name + (off ? ' is open again.' : ' is switched off.'))} /></td>
                      <td className="adm-actions"><IconBtn icon="✏️" label={'Edit ' + b.branch_name} onClick={() => { const c = cityOf(b.city_id); open('branch', { ...BLANK_BRANCH, ...b, city_id: c ? String(c.ROWID) : '', state_id: c ? String(c.state_id) : '' }); }} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {data && tab === 'agencies' && (
          <div className="dash-scroll">
            <table className="dash-table adm-table">
              <thead><tr><th>Agency</th><th>Branches</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {data.agencies.map(a => {
                  const off = !isOn(a.is_active);
                  return (
                    <tr key={a.ROWID} className={off ? 'master-left' : ''}>
                      <td className="left">{a.agency_name}</td>
                      <td className="left">{agencyBranches(a).map(branchName).filter(Boolean).join(', ') || '⚠️ None ticked'}</td>
                      <td><Toggle on={!off} label={a.agency_name} disabled={busy} onChange={() => run(() => api.agencySave({ ...a, is_active: off }), () => a.agency_name + (off ? ' is on again.' : ' is switched off.'))} /></td>
                      <td className="adm-actions"><IconBtn icon="✏️" label={'Edit ' + a.agency_name} onClick={() => open('agency', { ...BLANK_AGENCY, ...a, branch_ids: agencyBranches(a) })} /></td>
                    </tr>
                  );
                })}
                {data.agencies.length === 0 && <tr><td colSpan="4">No agencies yet. Press ➕ Add agency.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
