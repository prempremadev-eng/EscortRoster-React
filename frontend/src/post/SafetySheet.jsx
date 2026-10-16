import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { Icon } from './icons.jsx';

const fmtDate = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

// Screen 5j: "Safety today", the safety person of each shift at this post.
// Adding again makes a new entry (old ones are kept); the latest one is shown.
export default function SafetySheet({ token, post, onClose }) {
  const [data, setData] = useState(null);
  const [adding, setAdding] = useState(null);
  const [form, setForm] = useState({ name: '', phone: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setData((await api.safety(token, post)).data);
    } catch (err) {
      setError(err.message);
    }
  }, [token, post]);

  useEffect(() => { load(); }, [load]);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.addSafety(token, { shift_code: adding, ...form }, post);
      setAdding(null);
      setForm({ name: '', phone: '' });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="pd-sheet-title">Safety today</div>
      {data && <div className="pd-muted pd-small">{fmtDate(data.date)}</div>}
      {!data && !error && <div className="pd-muted">Loading...</div>}
      {error && <div className="pd-card pd-bad">{error}</div>}
      {data && data.shifts.map(sh => (
        <div key={sh.code} className={'pd-safety ' + (sh.entry ? '' : 'pd-safety-empty')}>
          <div className="pd-safety-shift"><b>{sh.code}</b><span>{sh.start}–{sh.end}</span></div>
          {adding === sh.code ? (
            <form className="pd-safety-form" onSubmit={save}>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Name" maxLength={100} required aria-label="Safety person name" />
              <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="Phone" inputMode="tel" maxLength={20} aria-label="Safety person phone" />
              <div className="pd-row-between">
                <button type="button" className="pd-link" onClick={() => setAdding(null)}>Cancel</button>
                <button className="pd-chip pd-chip-primary" type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save'}</button>
              </div>
            </form>
          ) : (
            <>
              <div className="pd-grow">
                <div className="pd-safety-name">
                  {sh.entry ? sh.entry.name : <span className="pd-muted">No safety added</span>}
                  {sh.now && <span className="pd-pill pd-pill-sm pd-green">Now</span>}
                </div>
                {sh.entry && sh.entry.phone && <div className="pd-muted pd-small">{sh.entry.phone}</div>}
              </div>
              {sh.entry && sh.entry.phone && <a className="pd-call" href={'tel:' + sh.entry.phone} aria-label={'Call ' + sh.entry.name}>{Icon.phone}</a>}
              <button className="pd-chip" onClick={() => { setAdding(sh.code); setForm({ name: '', phone: '' }); }}>{sh.entry ? 'Change' : 'Add'}</button>
            </>
          )}
        </div>
      ))}
      <button className="pd-link" onClick={onClose}>Close</button>
    </>
  );
}
