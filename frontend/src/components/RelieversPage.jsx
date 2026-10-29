import { useEffect, useState } from 'react';
import { api } from '../api.js';

// #relievers (Prem, 29 Oct): relievers at QR gates (Cumbum). The guard on duty adds them; the first IN registers
// the face. Not guards: they only show here, on the day schedule and under the month roster.
export default function RelieversPage() {
  const [branches, setBranches] = useState([]);
  const [branch, setBranch] = useState('');
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => {
    api.getPosts().then(r => { const b = r.data.branches; setBranches(b); if (b[0]) setBranch(String(b[0].ROWID)); }).catch(err => setError(err.message));
  }, []);
  useEffect(() => { if (branch) { setList(null); api.qrRelievers(branch).then(r => setList(r.data)).catch(err => setError(err.message)); } }, [branch]);
  // Remove fully: the reliever, their shifts and every photo (29 Oct: "she left, remove her details").
  async function remove(p) {
    if (!window.confirm('Remove ' + p.name + ' fully? Their photo, phone and all their relief shifts are deleted. This cannot be undone.')) return;
    try { const r = (await api.qrRelieverRemove(p.id)).data; setNote('🗑 ' + r.removed + ' removed (' + r.shifts + ' shift(s), ' + r.photos + ' photo(s)).'); setList(l => l.filter(x => x.id !== p.id)); } catch (err) { setError(err.message); }
  }
  return (
    <>
      <div className="titlebar"><h1>🔁 Relievers</h1></div>
      <div className="toolbar no-print">
        <div>
          <label htmlFor="rl-branch">Branch:</label>
          <select id="rl-branch" value={branch} onChange={e => setBranch(e.target.value)}>
            {branches.map(b => <option key={b.ROWID} value={b.ROWID}>{b.branch_name} · {b.city}</option>)}
          </select>
        </div>
      </div>
      <div className="dash">
        {error && <div className="trip-error">{error}</div>}
        {note && <div className="sim-push">{note}</div>}
        <div className="sim-note">Added by the guard on duty at the gate QR. The first IN saves the face; later the face finds them.</div>
        {!list && !error && <div className="loading-message">Loading...</div>}
        {list && list.length === 0 && <div className="sim-note">No relievers at this branch yet.</div>}
        {list && list.length > 0 && (
          <div className="gn-list">
            {list.map(p => (
              <div key={p.id} className="gn-card gn-rel">
                {p.photo ? <img src={p.photo} alt={'Photo of reliever ' + p.name} /> : <div className="gn-noimg">🔁</div>}
                <div className="gn-info">
                  <b>{p.name}</b>
                  <span>📞 {p.phone}</span>
                  <span>Came {p.visits}×{p.last ? ' · last ' + p.last : ''}</span>
                  {p.addedBy && <span>Added by {p.addedBy}</span>}
                  {!p.photo && <span>No face yet (not come yet)</span>}
                  <button className="btn secondary master-danger" onClick={() => remove(p)}>🗑 Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
