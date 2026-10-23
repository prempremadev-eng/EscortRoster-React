import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { shortDate, plusDay } from '../utils.js';
import useFullView from './useFullView.js';
import { useUser } from '../auth/user.js';
import { VehicleForm, PhotoView, BLANK, TYPES, whoOf, dayWord } from '../post/VehicleEntry.jsx';

// Vehicles (supervisor and every admin): one day's vehicle entries of the posts with vehicle entry on,
// plus vehicles still inside from earlier days. "+ New entry" lets a supervisor / admin enter one too
// (to test, or when the guard's phone is down); OUT can be marked here as well.
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
function remember(k, fallback) {
  try { const v = localStorage.getItem(k); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
}

export default function VehiclesPage() {
  const [branches, setBranches] = useState([]);
  const [branch, setBranch] = useState('');
  const [date, setDate] = useState(today);
  const [data, setData] = useState(null);
  const [full, toggleFull] = useFullView('full-' + 'Vehicles');
  const [post, setPost] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [addPost, setAddPost] = useState('');
  const [photo, setPhoto] = useState(null);
  // Vehicles seen before at the picked post's branch (number suggestions in "+ New entry").
  const [known, setKnown] = useState([]);
  useEffect(() => {
    if (!adding || !addPost) { setKnown([]); return; }
    api.vehicleKnownAt(addPost).then(r => setKnown(r.data)).catch(() => setKnown([]));
  }, [adding, addPost]);
  const [showPhoto, setShowPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    api.getPosts().then(r => {
      const b = r.data.branches;
      setBranches(b);
      const last = String(remember('sup_branch', ''));
      setBranch(b.some(x => String(x.ROWID) === last) ? last : (b[0] ? String(b[0].ROWID) : ''));
    }).catch(err => setError(err.message));
  }, []);

  // One load per date (no timer): every load costs Data Store reads.
  const load = useCallback(async () => {
    if (!branch || !date) return;
    setError('');
    try {
      setData((await api.vehicleList(branch, date)).data);
    } catch (err) {
      setError(err.message);
    }
  }, [branch, date]);
  useEffect(() => { setData(null); load(); }, [load]);

  const many = branch === 'ALL';
  const entries = data ? data.entries : [];
  const base = useMemo(() => entries.filter(e => (!post || e.postId === post) && (!type || e.type === type)
    && (!q.trim() || (e.vehicleNo + ' ' + e.name + ' ' + e.empNo + ' ' + e.phone + ' ' + e.from + ' ' + e.meet + ' ' + e.by).toLowerCase().includes(q.trim().toLowerCase()))), [entries, post, type, q]);
  const shown = base.filter(e => !status || e.status === status);
  const count = s => base.filter(e => e.status === s).length;

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setFormError('');
    try {
      const saved = (await api.vehicleAdd({ ...form, post_id: addPost })).data;
      if (photo) {
        try {
          await api.vehiclePhotoAdd(saved.id, photo);
        } catch (err) {
          setError('IN is saved, but the photo was not: ' + err.message);
        }
      }
      setAdding(false);
      setForm(BLANK);
      setPhoto(null);
      await load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // Delete a wrong entry: Branch Admin (and the Super Admin) only; the others only see.
  const me = useUser();
  const canDelete = !!me && (me.role === 'branch_admin' || me.role === 'super_admin');
  async function remove(x) {
    if (!window.confirm('Delete ' + x.vehicleNo + ' (' + x.type + ', IN ' + x.in + ')? This cannot be undone.')) return;
    setBusy(true);
    try {
      await api.vehicleDelete(x.id);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function markOut(x) {
    if (!window.confirm('Mark ' + x.vehicleNo + ' OUT now?')) return;
    setBusy(true);
    try {
      await api.vehicleMarkOut(x.id);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function openAdd() {
    const posts = data ? data.posts : [];
    setAddPost(post || (posts.length === 1 ? posts[0].id : ''));
    setForm(BLANK);
    setPhoto(null);
    setFormError('');
    setAdding(true);
  }

  const dayText = d => d.split('-').reverse().join('-');

  return (
    <>
      {full ? (
        <div className="full-bar no-print">
          <div className="full-date">{shortDate(date)}</div>
          <h1 className="full-title">🚗 Vehicles</h1>
          <div className="full-btns">
            <button className="btn secondary" onClick={() => setDate(d => plusDay(d, -1))} aria-label="Previous day">‹</button>
            <button className="btn secondary" onClick={() => setDate(d => plusDay(d, 1))} aria-label="Next day">›</button>
            <button className="btn secondary" onClick={toggleFull} title="Show the buttons and filters">▾</button>
          </div>
        </div>
      ) : <>
      <div className="titlebar">
        <h1>🚗 Vehicles</h1>
      </div>

      <div className="toolbar no-print">
        <div className="tb-date">
          <button className="btn secondary tb-day" onClick={() => setDate(d => plusDay(d, -1))} aria-label="Previous day">‹</button>
          <b className="tb-day-text">{shortDate(date)}</b>
          <button className="btn secondary tb-day" onClick={() => setDate(d => plusDay(d, 1))} aria-label="Next day">›</button>
          <input type="date" value={date} onChange={e => e.target.value && setDate(e.target.value)} aria-label="Pick a date" />
        </div>
        {branches.length > 1 && (
          <select value={branch} onChange={e => { setBranch(e.target.value); setPost(''); }} aria-label="Branch">
            <option value="ALL">All my branches ({branches.length})</option>
            {branches.map(b => <option key={b.ROWID} value={b.ROWID}>{b.branch_name} · {b.city}</option>)}
          </select>
        )}
        <div className="spacer"></div>
        <button className="btn" onClick={openAdd} disabled={!data || !data.posts.length}>+ New entry</button>
        <button className="btn secondary" onClick={() => window.print()}>🖨️ Print</button>
        <button className="btn secondary" onClick={load}>🔄 Refresh</button>
        <button className="btn secondary" onClick={toggleFull} title="Hide the buttons and filters (full page)">▴</button>
      </div>
      </>}

      <div className={'dash' + (full ? ' dash-full' : '')}>
        {error && <div className="trip-error">{error}</div>}
        {!data && !error && <div className="loading-message">Loading...</div>}
        {data && data.posts.length === 0 && <div className="dash-empty">No post has vehicle entry on. Turn it on in Post setup (🚗 Vehicle entry).</div>}
        {data && data.posts.length > 0 && (
          <>
            {!full && <>
            <div className="dh-chips no-print">
              <button className={'dh-chip' + (!status ? ' on' : '')} onClick={() => setStatus('')}>All <b>{base.length}</b></button>
              <button className={'dh-chip dh-late' + (status === 'IN' ? ' on' : '')} onClick={() => setStatus(status === 'IN' ? '' : 'IN')}>Inside <b>{count('IN')}</b></button>
              <button className={'dh-chip dh-ok' + (status === 'OUT' ? ' on' : '')} onClick={() => setStatus(status === 'OUT' ? '' : 'OUT')}>Out <b>{count('OUT')}</b></button>
            </div>
            <div className="master-filters no-print">
              <label>Post
                <select value={post} onChange={e => setPost(e.target.value)}>
                  <option value="">All vehicle posts ({data.posts.length})</option>
                  {data.posts.map(p => <option key={p.id} value={p.id}>{p.name}{many ? ' · ' + p.branch : ''}</option>)}
                </select>
              </label>
              <label>Type
                <select value={type} onChange={e => setType(e.target.value)}>
                  <option value="">All types</option>
                  {TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </label>
              <label className="master-search">Search vehicle / name / phone
                <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="TN 09, name, Emp ID" />
              </label>
            </div>
            </>}
            <div className="dash-range-label">{dayText(date)} · entries of the day and vehicles still inside</div>
            <div className="dash-scroll">
              <table className="dash-table dh-table ve-table">
                <thead>
                  <tr><th>#</th>{many && <th>Branch</th>}<th>Post</th><th>Vehicle</th><th>Photo</th><th>Type</th><th>Who</th><th>Phone</th><th>To meet</th><th>IN</th><th>OUT</th><th>Entered by</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {shown.map((x, i) => (
                    <tr key={x.id}>
                      <td>{i + 1}</td>
                      {many && <td className="left">{x.branch}</td>}
                      <td className="left">{x.post}</td>
                      <td className="left"><b className="ve-plate-text">{x.vehicleNo}</b></td>
                      <td>{x.hasPhoto ? <button className="btn secondary ve-out-btn" onClick={() => setShowPhoto(x)} title="Show photo">📷</button> : '—'}</td>
                      <td><span className={'ve-tag ve-' + x.type}>{x.type}</span></td>
                      <td className="left">{whoOf(x)}</td>
                      <td>{x.phone || '—'}</td>
                      <td className="left">{x.meet || '—'}</td>
                      <td>{x.in}{x.date !== date ? <div className="ve-small">{dayWord(x.date, data.today) || 'Today'}</div> : null}</td>
                      <td>{x.out || '—'}</td>
                      <td className="left">{x.by}{x.outBy ? <div className="ve-small">OUT: {x.outBy}</div> : null}</td>
                      <td>{x.status === 'IN'
                        ? <button className="btn secondary ve-out-btn no-print" onClick={() => markOut(x)} disabled={busy} title="Mark OUT now">Inside · OUT</button>
                        : <span className="dh-status dh-ok">Out</span>}
                        {canDelete && <button className="btn secondary ve-out-btn no-print ve-del" onClick={() => remove(x)} disabled={busy} title="Delete this wrong entry">🗑</button>}</td>
                    </tr>
                  ))}
                  {shown.length === 0 && <tr><td colSpan={many ? 13 : 12} className="dash-empty">No vehicles.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {adding && (
        <div className="ve-dim" onClick={() => setAdding(false)}>
          <div className="pd ve-modal" onClick={e => e.stopPropagation()}>
            <div className="pd-row-between">
              <div className="pd-title pd-title-sm">New vehicle entry</div>
              <button className="pd-link" onClick={() => setAdding(false)}>Close</button>
            </div>
            {formError && <div className="pd-card pd-bad">{formError}</div>}
            <VehicleForm form={form} setForm={setForm} photo={photo} setPhoto={setPhoto} scan={api.vehiclePlateScan} voice={api.vehicleVoiceText} known={known}
              inside={entries.filter(x => x.status === 'IN' && x.postId === addPost)} onOut={async x => { setAdding(false); await markOut(x); }} busy={busy} onSubmit={save} submitLabel="Save IN">
              <label htmlFor="ve-post">Post</label>
              <select id="ve-post" className="ve-select" value={addPost} onChange={e => setAddPost(e.target.value)} required>
                <option value="">Pick the post</option>
                {data.posts.map(p => <option key={p.id} value={p.id}>{p.name}{many ? ' · ' + p.branch : ''}</option>)}
              </select>
            </VehicleForm>
            <div className="pd-muted pd-small pd-center">Saved with your name and the time now</div>
          </div>
        </div>
      )}
      {showPhoto && <PhotoView getUrl={() => api.vehiclePhotoUrl(showPhoto.id)} onClose={() => setShowPhoto(null)} />}
    </>
  );
}
