import { useState } from 'react';
import { api } from '../api.js';
import { Icon } from './icons.jsx';

// Screen 5: a contractor's work at the post. Time and guard are saved by the server.
// Photos (permit, work area) come with the photo step.
export default function AddWork({ token, duty, onClose }) {
  const [form, setForm] = useState({ contractor: '', permit_from: '09:00', permit_to: '17:00', persons: 1, description: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.addWork(token, form);
      onClose(true);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form className="pd pd-page pd-form" onSubmit={save}>
      <div className="pd-form-head">
        <button type="button" className="pd-icon-btn" onClick={() => onClose(false)} aria-label="Back">{Icon.back}</button>
        <div>
          <div className="pd-title pd-title-sm">Add work update</div>
          <div className="pd-muted pd-small">{duty.post}</div>
        </div>
      </div>

      <label htmlFor="w-contractor">Contractor / company</label>
      <input id="w-contractor" value={form.contractor} onChange={e => set('contractor', e.target.value)} placeholder="ABC Electricals" maxLength={100} required />

      <div className="pd-field-title">Permit time</div>
      <div className="pd-two">
        <div><label htmlFor="w-from">From</label><input id="w-from" type="time" value={form.permit_from} onChange={e => set('permit_from', e.target.value)} required /></div>
        <div><label htmlFor="w-to">To</label><input id="w-to" type="time" value={form.permit_to} onChange={e => set('permit_to', e.target.value)} required /></div>
      </div>

      <div className="pd-field-title">Number of persons</div>
      <div className="pd-stepper">
        <button type="button" onClick={() => set('persons', Math.max(1, form.persons - 1))} aria-label="Decrease">−</button>
        <div>{form.persons}</div>
        <button type="button" onClick={() => set('persons', form.persons + 1)} aria-label="Increase">+</button>
      </div>

      <label htmlFor="w-desc">What work?</label>
      <textarea id="w-desc" value={form.description} onChange={e => set('description', e.target.value)} placeholder="Panel room cabling" maxLength={255} rows={3} />

      {error && <div className="pd-card pd-bad">{error}</div>}
      <div className="pd-grow"></div>
      <div className="pd-muted pd-small pd-center">Time and your name are saved automatically</div>
      <button className="pd-btn pd-btn-primary" type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save update'}</button>
    </form>
  );
}
