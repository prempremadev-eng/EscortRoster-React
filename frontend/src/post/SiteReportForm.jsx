import { useEffect, useState } from 'react';
import { api } from '../api.js';

// 📋 Site report on the guard's phone (Prem, 5 Nov): the counts they used to type in WhatsApp
// (MLCP car floors, two wheeler basements, Lancor vendor parking, employee strength), as a form.
// Pick the report time, type the numbers (or + / −), totals count themselves, Send. The server
// posts the same message on the post chat; 📋 Copy gives the WhatsApp text too.
export default function SiteReportForm({ token, onClose }) {
  const [data, setData] = useState(null);
  const [slot, setSlot] = useState('');
  const [values, setValues] = useState({});
  const [texts, setTexts] = useState({});
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(null);

  useEffect(() => {
    api.siteReportForm(token).then(r => {
      setData(r.data);
      setSlot(r.data.pick);
    }).catch(err => setError(err.message));
  }, [token]);

  // A slot already sent opens with its numbers (send again = update).
  useEffect(() => {
    if (!data) return;
    const s = data.slots.find(x => x.slot === slot);
    const v = (s && s.sent && s.sent.values) || {};
    const nums = {}, txt = {};
    data.form.sections.forEach(sec => sec.fields.forEach(f => { nums[f.k] = v[f.k] === undefined ? '' : String(v[f.k]); }));
    data.form.texts.forEach(t => { txt[t.k] = v[t.k] || ''; });
    setValues(nums);
    setTexts(txt);
    setRemarks((s && s.sent && s.sent.remarks) || '');
    setSent(null);
  }, [data, slot]);

  const num = k => parseInt(values[k], 10) || 0;
  const setNum = (k, v) => setValues(m => ({ ...m, [k]: String(v).replace(/[^0-9]/g, '').slice(0, 6) }));
  const sectionTotal = sec => sec.fields.reduce((n, f) => n + num(f.k), 0);
  // Same totals as the server (fields grouped by tag: cars, bikes, employees…).
  const totals = data ? data.form.totals.map(t => [t.label, data.form.sections.reduce((n, sec) => n + sec.fields.filter(f => t.tags.includes(f.tag)).reduce((m, f) => m + num(f.k), 0), 0)]) : [];

  async function send() {
    setBusy(true);
    setError('');
    try {
      const r = (await api.siteReportSend({ t: token, slot, values, texts, remarks })).data;
      setSent(r);
      setData(d => ({ ...d, slots: d.slots.map(s => (s.slot === slot ? { ...s, state: 'sent', sent: { values: { ...values, ...texts }, remarks } } : s)) }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function copy() {
    try { navigator.clipboard.writeText(sent.text); } catch { /* old phone */ }
  }

  const STATE = { sent: '✅', late: '🟡', missed: '🔴', due: '⏰', later: '·' };

  return (
    <div className="sr">
      <div className="sr-head">
        <button type="button" className="sr-back" onClick={() => onClose(!!sent)} aria-label="Back">←</button>
        <div>
          <div className="sr-title">{data ? data.form.icon + ' ' + data.form.label : '📋 Site report'}</div>
          {data && <div className="sr-sub">{data.post} · {data.date}</div>}
        </div>
      </div>

      <div className="sr-body">
        {!data && !error && <div className="sr-muted">Loading…</div>}
        {error && <div className="trip-error">{error}</div>}

        {data && data.together && data.together.length > 1 && (
          <div className="sr-together">🤝 One report for <b>{data.together.join(' + ')}</b>. Fill your part; the other numbers are what the others sent. Totals add up.</div>
        )}
        {data && (
          <>
            <div className="sr-label">Report time</div>
            <div className="sr-slots">
              {data.slots.map(s => (
                <button type="button" key={s.slot} className={'sr-slot sr-' + s.state + (slot === s.slot ? ' on' : '')} onClick={() => setSlot(s.slot)}>
                  <b>{s.slot}</b><small>{STATE[s.state]} {s.state === 'later' ? 'later' : s.state}</small>
                </button>
              ))}
            </div>

            {data.form.sections.map(sec => (
              <section className="sr-card" key={sec.title}>
                <div className="sr-card-head"><span>{sec.title}</span><span className="sr-sum">{sectionTotal(sec)}</span></div>
                <div className={'sr-grid' + (sec.fields.length > 6 ? ' many' : '')}>
                  {sec.fields.map(f => (
                    <label key={f.k} className="sr-field">
                      <span>{f.label}</span>
                      <span className="sr-num">
                        <button type="button" onClick={() => setNum(f.k, Math.max(0, num(f.k) - 1))} aria-label={'Less ' + f.label}>−</button>
                        <input inputMode="numeric" value={values[f.k] || ''} placeholder="0" onChange={e => setNum(f.k, e.target.value)} />
                        <button type="button" onClick={() => setNum(f.k, num(f.k) + 1)} aria-label={'More ' + f.label}>+</button>
                      </span>
                    </label>
                  ))}
                </div>
              </section>
            ))}

            {data.form.texts.map(t => (
              <label key={t.k} className="sr-text">{t.label}
                <input value={texts[t.k] || ''} onChange={e => setTexts(m => ({ ...m, [t.k]: e.target.value }))} placeholder={t.label} />
              </label>
            ))}
            <label className="sr-text">Remarks
              <textarea rows={2} value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="All area rounds checked, everything normal." />
            </label>

            {sent && (
              <div className="sr-sent">
                <div>✅ Sent at {slot}. It is on your post chat too.</div>
                <pre>{sent.text}</pre>
                <button type="button" className="sr-btn" onClick={copy}>📋 Copy for WhatsApp</button>
              </div>
            )}
          </>
        )}
      </div>

      {data && (
        <div className="sr-foot">
          <div className="sr-totals">{totals.map(([label, n]) => <div key={label} className="sr-total"><small>{label}</small><b>{n}</b></div>)}</div>
          <button type="button" className="sr-send" onClick={send} disabled={busy || !slot}>
            {busy ? 'Sending…' : (data.slots.find(s => s.slot === slot) || {}).sent ? '↻ Send again · ' + slot : '✓ Send · ' + slot}
          </button>
        </div>
      )}
    </div>
  );
}
