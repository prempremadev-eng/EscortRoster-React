import { useEffect, useState } from 'react';
import { api } from '../api.js';
import TimePicker from '../components/TimePicker.jsx';

// 🚑 ERT incident report on the guard's phone (Prem, 5 Nov). What happened, where, when, who, what was
// done. Sent to the post chat, the team group and the office (urgent). Recent incidents of this post can
// be opened again to correct or close them.
const blank = (d) => ({ rowid: null, date: d.today, time: d.now, type: '', severity: 'Minor', place: '', what: '', actions: [], persons: [], hospital: '', vehicles: '', witness: '', informed: '', closed: false });

export default function ErtForm({ token, onClose }) {
  const [data, setData] = useState(null);
  const [f, setF] = useState(null);
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(null);

  const load = () => api.ertForm(token).then(r => { setData(r.data); setF(blank(r.data)); }).catch(err => setError(err.message));
  useEffect(() => { load(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const toggleAction = a => set('actions', f.actions.includes(a) ? f.actions.filter(x => x !== a) : [...f.actions, a]);
  const setPerson = (i, k, v) => set('persons', f.persons.map((p, j) => (j === i ? { ...p, [k]: v } : p)));

  async function send() {
    setBusy(true);
    setError('');
    try {
      const r = (await api.ertSend({ t: token, ...f })).data;
      setSent(r);
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function openOld(x) {
    setSent(null);
    setF({ ...blank(data), rowid: x.ROWID, date: x.date, time: x.time, type: x.type, severity: x.severity, place: x.place, what: x.what,
      actions: x.actions || [], persons: x.persons || [], hospital: x.hospital || '', vehicles: x.vehicles || '', witness: x.witness || '', informed: x.informed || '', closed: !!x.closed });
    window.scrollTo({ top: 0 });
  }

  return (
    <div className="sr ert">
      <div className="sr-head ert-head">
        <button type="button" className="sr-back" onClick={() => onClose(!!sent)} aria-label="Back">←</button>
        <div>
          <div className="sr-title">🚑 ERT Incident Report</div>
          {data && <div className="sr-sub">{data.post}{f && f.rowid ? ' · editing an earlier one' : ''}</div>}
        </div>
      </div>

      <div className="sr-body">
        {!data && !error && <div className="sr-muted">Loading…</div>}
        {error && <div className="trip-error">{error}</div>}

        {sent && (
          <div className="sr-sent">
            <div>✅ Sent. The office was told. It is on your post chat and team group too.</div>
            <pre>{sent.text}</pre>
            <button type="button" className="sr-btn" onClick={() => { try { navigator.clipboard.writeText(sent.text); } catch { /* old phone */ } }}>📋 Copy for WhatsApp</button>
            <button type="button" className="sr-btn" onClick={() => { setSent(null); load(); }}>➕ New incident</button>
          </div>
        )}

        {f && !sent && (
          <>
            <section className="sr-card">
              <div className="sr-card-head"><span>⚠️ What happened</span></div>
              <div className="ert-pad">
                <div className="ert-chips">
                  {data.lists.types.map(t => <button type="button" key={t} className={'ert-chip' + (f.type === t ? ' on' : '')} onClick={() => set('type', t)}>{t}</button>)}
                </div>
                <div className="ert-label">How serious</div>
                <div className="ert-seg">
                  {data.lists.severity.map(s => <button type="button" key={s} className={'ert-sev-' + s.toLowerCase() + (f.severity === s ? ' on' : '')} onClick={() => set('severity', s)}>{s}</button>)}
                </div>
              </div>
            </section>

            <section className="sr-card">
              <div className="sr-card-head"><span>📍 Where & when</span></div>
              <div className="ert-pad ert-two">
                <label className="sr-text ert-wide">Place<input value={f.place} onChange={e => set('place', e.target.value)} placeholder="e.g. MLCP basement 2, near lift" /></label>
                <label className="sr-text">Date<input type="date" value={f.date} onChange={e => e.target.value && set('date', e.target.value)} /></label>
                <label className="sr-text">Time<button type="button" className="trip-time-btn" onClick={() => setPicker(true)}>🕒 {f.time}</button></label>
              </div>
            </section>

            <section className="sr-card">
              <div className="sr-card-head"><span>👥 Persons involved</span><span className="sr-sum">{f.persons.length}</span></div>
              <div className="ert-pad">
                {f.persons.map((p, i) => (
                  <div key={i} className="ert-person">
                    <div className="ert-two">
                      <input value={p.name} onChange={e => setPerson(i, 'name', e.target.value)} placeholder="Name" />
                      <input value={p.id} onChange={e => setPerson(i, 'id', e.target.value)} placeholder="Emp ID / phone" />
                      <input value={p.company} onChange={e => setPerson(i, 'company', e.target.value)} placeholder="Company / vendor" />
                      <label className="ert-check"><input type="checkbox" checked={p.injured} onChange={e => setPerson(i, 'injured', e.target.checked)} /> 🩹 Injured</label>
                    </div>
                    <button type="button" className="ert-remove" onClick={() => set('persons', f.persons.filter((_, j) => j !== i))}>✕ Remove</button>
                  </div>
                ))}
                <button type="button" className="sr-btn" onClick={() => set('persons', [...f.persons, { name: '', id: '', company: '', injured: false }])}>➕ Add person</button>
              </div>
            </section>

            <label className="sr-text">📝 Details: what happened, how
              <textarea rows={4} value={f.what} onChange={e => set('what', e.target.value)} placeholder="Write what happened, step by step." />
            </label>

            <section className="sr-card">
              <div className="sr-card-head"><span>✅ Action taken</span></div>
              <div className="ert-pad">
                <div className="ert-chips">
                  {data.lists.actions.map(a => <button type="button" key={a} className={'ert-chip' + (f.actions.includes(a) ? ' on' : '')} onClick={() => toggleAction(a)}>{f.actions.includes(a) ? '✓ ' : ''}{a}</button>)}
                </div>
                <label className="sr-text">🏥 Hospital / ambulance<input value={f.hospital} onChange={e => set('hospital', e.target.value)} placeholder="Hospital name, ambulance no." /></label>
                <label className="sr-text">🚗 Vehicle numbers<input value={f.vehicles} onChange={e => set('vehicles', e.target.value.toUpperCase())} placeholder="TN XX XX XXXX" /></label>
                <label className="sr-text">👀 Witness<input value={f.witness} onChange={e => set('witness', e.target.value)} placeholder="Name, phone" /></label>
                <label className="sr-text">📞 Informed to<input value={f.informed} onChange={e => set('informed', e.target.value)} placeholder="Supervisor, HR, admin…" /></label>
              </div>
            </section>

            <label className="ert-close"><input type="checkbox" checked={f.closed} onChange={e => set('closed', e.target.checked)} /> ✅ Incident closed (nothing more to do)</label>

            {data.recent.length > 0 && (
              <section className="sr-card">
                <div className="sr-card-head"><span>🕘 This post · last 7 days</span></div>
                <div className="ert-pad">
                  {data.recent.map(x => (
                    <button type="button" key={x.ROWID} className="ert-old" onClick={() => openOld(x)}>
                      <b>{x.closed ? '✅' : '🔴'} {x.type} · {x.severity}</b>
                      <small>{x.date} {x.time} · {x.place} · {x.by}</small>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {f && !sent && (
        <div className="sr-foot">
          {f.rowid && <button type="button" className="sr-btn" onClick={() => setF(blank(data))}>New</button>}
          <div className="sr-totals" />
          <button type="button" className="sr-send ert-send" onClick={send} disabled={busy || !f.type || !f.place.trim() || !f.what.trim()}>
            {busy ? 'Sending…' : f.rowid ? '↻ Update report' : '🚑 Send report'}
          </button>
        </div>
      )}
      {picker && <TimePicker label="Time of incident" value={f.time} onOk={v => set('time', v)} onClose={() => setPicker(false)} />}
    </div>
  );
}
