import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useUser, atLeast } from '../auth/user.js';
import { worksIn } from '../agency.js';
import { Toggle, IconBtn } from './RowControls.jsx';

const BLANK_POST = { post_name: '', post_type: 'POST', agency_id: '', vehicle_entry: false };
const isOn = v => v === true || v === 'true';

// The places of each branch where a guard can be put: Gate 3, Lobby, Escort…
// A post is switched off, never deleted, because old duty charts point to it.
export default function PostsPage() {
  // Supervisors only look; a branch admin or higher adds and changes posts.
  const canEdit = atLeast(useUser(), 'branch_admin');
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading');
  const [branch, setBranch] = useState('');
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  // No auto-refresh: every load costs Data Store reads. Use 🔄 instead.
  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const d = (await api.getPosts()).data;
      setData(d);
      setBranch(b => b || (d.branches[0] ? String(d.branches[0].ROWID) : ''));
      setStatus('ok');
    } catch (err) {
      console.error('Posts load failed:', err);
      setStatus('error');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const posts = data ? data.posts.filter(p => String(p.branch_id) === branch) : [];

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
      const body = { branch_id: branch, post_name: form.post_name, post_type: form.post_type, agency_id: form.agency_id, vehicle_entry: isOn(form.vehicle_entry) };
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
      putRow((await api.updatePost({ ...p, vehicle_entry: isOn(p.vehicle_entry), is_active: active })).data);
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
        <a className="btn secondary" href="#chart">📅 Duty Chart</a>
        {data && (
          <div>
            <label htmlFor="p-branch">Branch:</label>
            <select id="p-branch" value={branch} onChange={e => { setBranch(e.target.value); setForm(null); }}>
              {data.branches.map(b => <option key={b.ROWID} value={b.ROWID}>{branchLabel(b)}</option>)}
            </select>
          </div>
        )}
        <div className="spacer"></div>
        {canEdit && <button className="btn secondary" onClick={() => { setError(''); setNote(''); setForm({ ...BLANK_POST }); }}>➕ Add post</button>}
        <button className="btn" onClick={load}>🔄 Refresh</button>
      </div>

      <div className="dash">
        <div className="sim-note">Places in this branch where a guard stands. 🚐 ESCORT = the guard goes on the escort duty sheet.</div>
        {error && <div className="trip-error">{error}</div>}
        {note && <div className="sim-push">{note}</div>}

        {form && (
          <form className="master-form" onSubmit={save}>
            <div className="master-form-title">{form.ROWID ? '✏️ Edit ' + form.post_name : '➕ New post'}</div>
            <div className="master-grid">
              <label>Post name<input id="p-name" value={form.post_name} onChange={e => setForm(f => ({ ...f, post_name: e.target.value }))} placeholder="Gate 3" required /></label>
              <label>Type
                <select id="p-type" value={form.post_type} onChange={e => setForm(f => ({ ...f, post_type: e.target.value }))}>
                  <option value="POST">📍 POST (stands at a place)</option>
                  <option value="ESCORT">🚐 ESCORT (cab trips, escort duty sheet)</option>
                </select>
              </label>
              <label>Agency (one agency per post)
                <select id="p-agency" value={form.agency_id || ''} onChange={e => setForm(f => ({ ...f, agency_id: e.target.value }))} required>
                  <option value="">Pick the agency</option>
                  {data.agencies.filter(a => (isOn(a.is_active) && worksIn(a, branch)) || String(a.ROWID) === String(form.agency_id)).map(a => <option key={a.ROWID} value={a.ROWID}>{a.agency_name}</option>)}
                </select>
              </label>
              <label className="master-check">
                <input type="checkbox" checked={isOn(form.vehicle_entry)} onChange={e => setForm(f => ({ ...f, vehicle_entry: e.target.checked }))} />
                🚗 Visitor / vehicle entry at this post
              </label>
            </div>
            <div className="link-actions">
              <button className="btn" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save post'}</button>
              <button className="btn secondary" type="button" onClick={() => setForm(null)}>Cancel</button>
            </div>
          </form>
        )}

        {status === 'loading' && <div className="loading-message">Loading...</div>}
        {status === 'error' && <div className="loading-message">Could not load. Check your connection and press Refresh.</div>}

        {status === 'ok' && (
          <div className="dash-scroll">
            <table className="dash-table adm-table">
              <thead>
                <tr><th>Post</th><th>Type</th><th>Agency</th><th>Vehicle entry</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {posts.map(p => {
                  const off = p.is_active !== 'true';
                  return (
                    <tr key={p.ROWID} className={off ? 'master-left' : ''}>
                      <td className="left">{p.post_name}</td>
                      <td>{p.post_type === 'ESCORT' ? '🚐 ESCORT' : '📍 POST'}</td>
                      <td>{agencyName(p.agency_id)}</td>
                      <td>{isOn(p.vehicle_entry) ? '🚗 Yes' : '—'}</td>
                      <td><Toggle on={!off} label={p.post_name} disabled={!canEdit} onChange={() => setActive(p, off)} /></td>
                      <td className="adm-actions">{canEdit && !off && <IconBtn icon="✏️" label={'Edit ' + p.post_name} onClick={() => { setError(''); setNote(''); setForm({ ...p }); window.scrollTo({ top: 0 }); }} />}</td>
                    </tr>
                  );
                })}
                {posts.length === 0 && <tr><td colSpan="6">No posts in this branch yet. Press ➕ Add post.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
