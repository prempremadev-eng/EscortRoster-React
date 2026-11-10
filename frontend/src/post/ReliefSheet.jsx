import { useEffect, useState } from 'react';
import { api } from '../api.js';

// ☰ More → 🔁 Add reliever (Prem, 10 Nov): the guard on duty adds the reliever for the next shift from the chat,
// no gate walk and no face check (the duty link is theirs and they are IN). The office gets a notice.
export default function ReliefSheet({ token, onClose, onDone }) {
  const [info, setInfo] = useState(null);
  const [form, setForm] = useState({ pick: '', name: '', phone: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api.postRelief(token).then(r => setInfo(r.data)).catch(err => setMsg(err.message));
  }, [token]);

  async function add(e) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      const r = (await api.postReliefAdd(token, form.pick ? { reliever_id: form.pick } : { name: form.name, phone: form.phone })).data;
      onDone('✅ ' + r.name + ' · Shift ' + r.code + ' · office told');
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  const ready = form.pick || (form.name.trim() && form.phone.replace(/\D/g, '').length >= 10);
  return (
    <form className="pd-form" onSubmit={add}>
      <div className="pd-sheet-title">🔁 Add reliever</div>
      {!info && !msg && <div className="pd-muted">Loading...</div>}
      {info && !info.code && <div className="pd-muted">No next shift to add a reliever for.</div>}
      {info && info.code && (
        <>
          <div className="pd-small">For <b>Shift {info.code}</b> · {info.day}. Now: <b>{info.added || 'not added'}</b>{info.isIn ? ' · already IN' : ''}</div>
          {!info.isIn && (
            <>
              {info.list.length > 0 && (
                <>
                  <label htmlFor="pd-rel-pick">Came before</label>
                  <select id="pd-rel-pick" className="pd-search" value={form.pick} onChange={e => setForm({ ...form, pick: e.target.value })}>
                    <option value="">New reliever…</option>
                    {info.list.map(p => <option key={p.id} value={p.id}>{p.name} {p.phone}{p.visits ? ' · came ' + p.visits + '×' : ''}</option>)}
                  </select>
                </>
              )}
              {!form.pick && (
                <>
                  <label htmlFor="pd-rel-name">Name</label>
                  <input id="pd-rel-name" className="pd-search" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Reliever name" />
                  <label htmlFor="pd-rel-phone">Phone</label>
                  <input id="pd-rel-phone" className="pd-search" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} inputMode="tel" placeholder="10 digits" />
                </>
              )}
              <button className="pd-btn pd-btn-primary" type="submit" disabled={busy || !ready}>{busy ? 'Adding...' : 'Add reliever'}</button>
              <div className="pd-small pd-muted">They scan the gate QR → 🆕 New Registration → 🔁 Reliever when they come.</div>
            </>
          )}
        </>
      )}
      {msg && <div className="pd-small pd-red-text" style={{ whiteSpace: 'pre-line' }}>{msg}</div>}
      <button type="button" className="pd-link" onClick={onClose}>Close</button>
    </form>
  );
}
