import { useEffect, useState } from 'react';
import { api } from '../api.js';

// 📦 Move setup (Prem, 30 Oct: going to Production). Development: 📤 Export setup saves one file. Production
// (empty): 📥 Import setup reads it and adds everything with new ROWIDs. Server: functions/escortAPI/setupMove.js.
const PARTS = ['States', 'Cities', 'Branches', 'Shifts', 'Agencies', 'Guards', 'Posts', 'UserRoles'];
const LABEL = { States: 'States', Cities: 'Cities', Branches: 'Branches', Shifts: 'Shifts', Agencies: 'Agencies', Guards: 'Guards', Posts: 'Posts', UserRoles: 'Office logins' };

export default function SetupMove() {
  const [file, setFile] = useState(null); // { name, data }
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  // On Slate the page's address says nothing; the function's address does (….development.catalystserverless…).
  const here = /\.development\./.test(window.location.hostname + ' ' + (import.meta.env.VITE_API_BASE || '')) ? 'Development' : 'Production';
  // One branch or all (Prem, 30 Oct: Cumbum goes live first).
  const [branches, setBranches] = useState([]);
  const [branch, setBranch] = useState('');
  useEffect(() => { api.getPosts().then(r => setBranches(r.data.branches || [])).catch(() => {}); }, []);

  async function exportSetup() {
    setError(''); setNote(''); setBusy(true);
    try {
      const data = (await api.setupExport(branch)).data;
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      const b = branches.find(x => String(x.ROWID) === branch);
      a.download = 'nightowl-setup-' + (b ? b.branch_name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' : '') + data.at.slice(0, 10) + '.json';
      a.click();
      URL.revokeObjectURL(a.href);
      setNote('📤 Saved ' + a.download + ': ' + PARTS.map(p => (data[p] || []).length + ' ' + LABEL[p].toLowerCase()).join(' · ') + '.');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  async function pickFile(e) {
    const f = e.target.files[0];
    e.target.value = '';
    setError(''); setNote('');
    if (!f) return;
    try { setFile({ name: f.name, data: JSON.parse(await f.text()) }); } catch { setError('"' + f.name + '" is not a setup file.'); }
  }

  async function importSetup() {
    if (!window.confirm('Add everything from ' + file.name + ' to ' + here + '? Do this only once, into an empty place.')) return;
    setError(''); setBusy(true);
    try {
      const r = (await api.setupImport(file.data)).data;
      setNote('📥 Done: ' + PARTS.filter(p => r.counts[p] !== undefined).map(p => r.counts[p] + ' ' + LABEL[p].toLowerCase()).join(' · ') + '. Refresh the page.');
      setFile(null);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <div className="dash">
      {error && <div className="trip-error">{error}</div>}
      {note && <div className="sim-push">{note}</div>}
      <div className="sim-note">You are in <b>{here}</b>. Moves: states, cities, branches, shifts, agencies, active guards, incharges, posts and office logins. Not moved: photos, Aadhaar, guard links, QR keys, API keys, rosters, schedules, swipes, chats.</div>
      <div className="move-cards">
        <div className="move-card">
          <b>1 · 📤 Export setup</b>
          <span>In <b>Development</b>. Saves one file with the setup. Keep it private (it has phone numbers) and delete it after the import.</span>
          <select value={branch} onChange={e => setBranch(e.target.value)} aria-label="Branch to export">
            <option value="">All branches</option>
            {branches.map(b => <option key={b.ROWID} value={b.ROWID}>{b.branch_name} · {b.city}</option>)}
          </select>
          <button className="btn" onClick={exportSetup} disabled={busy}>📤 Export setup</button>
        </div>
        <div className="move-card">
          <b>2 · 📥 Import setup</b>
          <span>In an <b>empty Production</b>, once. Office logins also need a Production login (Authentication → Users).</span>
          <label className="btn secondary">📂 Pick the setup file<input type="file" accept=".json,application/json" hidden onChange={pickFile} /></label>
          {file && (
            <div className="move-preview">
              <div>{file.name}: {PARTS.map(p => (file.data[p] || []).length + ' ' + LABEL[p].toLowerCase()).join(' · ')}</div>
              <button className="btn" onClick={importSetup} disabled={busy}>{busy ? 'Importing…' : '📥 Import into ' + here}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
