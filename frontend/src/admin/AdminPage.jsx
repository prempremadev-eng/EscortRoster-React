import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useUser, atLeast } from '../auth/user.js';

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
const BLANK_BRANCH = { branch_code: '', branch_name: '', company: 'Nokia', country: 'India', state: '', city: '', area: '', supervisor_phone: '' };
const isOn = v => v === true || v === 'true';
const uniq = list => [...new Set(list.filter(Boolean))].sort();

// #admin: who may sign in (and what they see), the branches and the agencies.
export default function AdminPage() {
  const me = useUser();
  const [tab, setTab] = useState('users');
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
  function saveAgency(e) {
    e.preventDefault();
    run(() => api.agencySave({ ROWID: form.ROWID, agency_name: form.agency_name, is_active: form.is_active === undefined ? true : isOn(form.is_active) }), () => '✅ ' + form.agency_name + ' saved.');
  }

  const cities = data ? uniq(data.branches.map(b => b.city)) : [];
  const activeBranches = data ? data.branches.filter(b => isOn(b.is_active)) : [];

  return (
    <>
      <div className="titlebar">
        <h1>⚙️ Admin</h1>
      </div>

      <div className="toolbar no-print">
        <button className={'btn' + (tab === 'users' ? '' : ' secondary')} onClick={() => { setTab('users'); setForm(null); }}>👤 Users</button>
        {canCity && <button className={'btn' + (tab === 'branches' ? '' : ' secondary')} onClick={() => { setTab('branches'); setForm(null); }}>🏢 Branches</button>}
        {canCity && <button className={'btn' + (tab === 'agencies' ? '' : ' secondary')} onClick={() => { setTab('agencies'); setForm(null); }}>🛡️ Agencies</button>}
        <div className="spacer"></div>
        {tab === 'users' && <button className="btn secondary" onClick={() => open('user', { ...BLANK_USER, role: data && data.roles.length ? data.roles[data.roles.length - 1].code : '' })} disabled={!data}>➕ Add user</button>}
        {tab === 'branches' && <button className="btn secondary" onClick={() => open('branch', { ...BLANK_BRANCH, city: me.role === 'city_admin' ? me.city : '' })}>➕ Add branch</button>}
        {tab === 'agencies' && <button className="btn secondary" onClick={() => open('agency', { agency_name: '' })}>➕ Add agency</button>}
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
                    {data.agencies.filter(a => isOn(a.is_active)).map(a => <option key={a.ROWID} value={a.ROWID}>{a.agency_name}</option>)}
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
              <label>Branch code<input value={form.branch_code} onChange={e => set('branch_code', e.target.value.toUpperCase())} placeholder="TN-CHN-BCH" required /></label>
              <label>Branch name<input value={form.branch_name} onChange={e => set('branch_name', e.target.value)} placeholder="Beach" required /></label>
              <label>Company<input value={form.company || ''} onChange={e => set('company', e.target.value)} required /></label>
              <label>Country<input value={form.country || ''} onChange={e => set('country', e.target.value)} required /></label>
              <label>State<input value={form.state || ''} onChange={e => set('state', e.target.value)} list="a-states" required /></label>
              <label>City<input value={form.city || ''} onChange={e => set('city', e.target.value)} list="a-cities" disabled={me.role === 'city_admin'} required /></label>
              <label>Area (optional)<input value={form.area || ''} onChange={e => set('area', e.target.value)} /></label>
              <label>Supervisor phone (guards call it)<input value={form.supervisor_phone || ''} onChange={e => set('supervisor_phone', e.target.value)} inputMode="tel" /></label>
            </div>
            <datalist id="a-states">{uniq(data.branches.map(b => b.state)).map(s => <option key={s} value={s} />)}</datalist>
            <datalist id="a-cities">{cities.map(c => <option key={c} value={c} />)}</datalist>
            <div className="link-actions">
              <button className="btn" type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save branch'}</button>
              <button className="btn secondary" type="button" onClick={() => setForm(null)}>Cancel</button>
            </div>
          </form>
        )}

        {data && form && form.kind === 'agency' && (
          <form className="master-form" onSubmit={saveAgency}>
            <div className="master-form-title">{form.ROWID ? '✏️ Edit ' + form.agency_name : '➕ New agency'}</div>
            <div className="master-grid">
              <label>Agency name<input value={form.agency_name} onChange={e => set('agency_name', e.target.value)} placeholder="Eagle Eye Services" maxLength={100} required /></label>
            </div>
            <div className="link-actions">
              <button className="btn" type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save agency'}</button>
              <button className="btn secondary" type="button" onClick={() => setForm(null)}>Cancel</button>
            </div>
          </form>
        )}

        {data && tab === 'users' && (
          <div className="dash-scroll">
            <table className="dash-table">
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Area</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {data.users.map(u => {
                  const self = u.email === me.email;
                  const off = !isOn(u.is_active);
                  return (
                    <tr key={u.ROWID} className={off ? 'master-left' : ''}>
                      <td className="left">{u.name}{self ? ' (you)' : ''}</td>
                      <td className="left">{u.email}</td>
                      <td>{ROLE_NAME[u.role]}</td>
                      <td className="left">{area(u)}</td>
                      <td>{off ? '🚫 Off' : '✅ On'}</td>
                      <td className="master-actions">
                        {!self && (off
                          ? <button className="btn secondary" disabled={busy} onClick={() => run(() => api.userActive(u.ROWID, true), () => '↩️ ' + u.name + ' can sign in again.')}>↩️ Switch on</button>
                          : <>
                              <button className="btn secondary" onClick={() => open('user', { ...BLANK_USER, ...u, city: u.city || '', branch_id: u.branch_id || '', agency_id: u.agency_id || '' })}>✏️ Edit</button>
                              <button className="btn secondary" disabled={busy} onClick={() => run(() => api.userMail(u.ROWID), r => '📧 ' + u.name + ': ' + MAIL_TEXT[r.data.mail])}>📧 Mail again</button>
                              <button className="btn secondary master-danger" disabled={busy} onClick={() => run(() => api.userActive(u.ROWID, false), () => '🚫 ' + u.name + ' cannot sign in now.')}>🚫 Switch off</button>
                            </>)}
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
            <table className="dash-table">
              <thead><tr><th>Code</th><th>Branch</th><th>City</th><th>State</th><th>Company</th><th>Supervisor phone</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {data.branches.map(b => {
                  const off = !isOn(b.is_active);
                  return (
                    <tr key={b.ROWID} className={off ? 'master-left' : ''}>
                      <td>{b.branch_code}</td>
                      <td className="left">{b.branch_name}{b.area ? ' (' + b.area + ')' : ''}</td>
                      <td>{b.city}</td>
                      <td>{b.state}</td>
                      <td>{b.company}</td>
                      <td>{b.supervisor_phone || '—'}</td>
                      <td>{off ? '🚫 Off' : '✅ Open'}</td>
                      <td className="master-actions">
                        <button className="btn secondary" onClick={() => open('branch', { ...BLANK_BRANCH, ...b })}>✏️ Edit</button>
                        <button className={'btn secondary' + (off ? '' : ' master-danger')} disabled={busy} onClick={() => run(() => api.branchSave({ ...b, is_active: off }), () => b.branch_name + (off ? ' is open again.' : ' is switched off.'))}>{off ? '↩️ Open again' : '🚫 Switch off'}</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {data && tab === 'agencies' && (
          <div className="dash-scroll">
            <table className="dash-table">
              <thead><tr><th>Agency</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {data.agencies.map(a => {
                  const off = !isOn(a.is_active);
                  return (
                    <tr key={a.ROWID} className={off ? 'master-left' : ''}>
                      <td className="left">{a.agency_name}</td>
                      <td>{off ? '🚫 Off' : '✅ On'}</td>
                      <td className="master-actions">
                        <button className="btn secondary" onClick={() => open('agency', { ...a })}>✏️ Edit</button>
                        <button className={'btn secondary' + (off ? '' : ' master-danger')} disabled={busy} onClick={() => run(() => api.agencySave({ ...a, is_active: off }), () => a.agency_name + (off ? ' is on again.' : ' is switched off.'))}>{off ? '↩️ Switch on' : '🚫 Switch off'}</button>
                      </td>
                    </tr>
                  );
                })}
                {data.agencies.length === 0 && <tr><td colSpan="3">No agencies yet. Press ➕ Add agency.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
