import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { initials } from './icons.jsx';

const TYPES = [['tea', 'Tea'], ['lunch', 'Lunch'], ['restroom', 'Restroom'], ['other', 'Other']];
const NO_ONE = 'none';

// Screen 5l "Go on break": break type, then who covers (guards on duty now in this branch).
// `current` = a break already asked (Someone else): same type, pick another guard.
export default function BreakSheet({ token, branch, current, onDone, onClose }) {
  const [type, setType] = useState(current ? current.type : 'tea');
  const [guards, setGuards] = useState(null);
  const [search, setSearch] = useState('');
  const [pick, setPick] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.coverCandidates(token).then(r => setGuards(r.data)).catch(err => setError(err.message));
  }, [token]);

  const typeName = (TYPES.find(t => t[0] === type) || TYPES[0])[1];
  const list = (guards || []).filter(g => (g.name + ' ' + g.post).toLowerCase().includes(search.trim().toLowerCase()));
  const picked = guards && guards.find(g => g.guardId === pick);

  async function start() {
    setBusy(true);
    setError('');
    try {
      await api.startBreak(token, type, pick === NO_ONE ? null : pick);
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <>
      <div className="pd-sheet-title">{current ? 'Ask someone else' : 'Go on break'}</div>
      <div className="pd-quick">
        {TYPES.map(([k, name]) => (
          <button key={k} className={'pd-chip' + (type === k ? ' pd-chip-primary' : '')} onClick={() => setType(k)}>{name}</button>
        ))}
      </div>

      <div className="pd-field-title">Who is covering?</div>
      <label htmlFor="b-search" className="pd-hidden">Search guard</label>
      <input id="b-search" className="pd-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search guard on site now" />

      <div className="pd-label">ON DUTY NOW{branch ? ' · ' + branch.toUpperCase() : ''}</div>
      {!guards && !error && <div className="pd-muted">Loading...</div>}
      {guards && list.length === 0 && <div className="pd-muted pd-small">No other guard on duty here now.</div>}
      {list.map(g => (
        <button key={g.guardId} className={'pd-person' + (pick === g.guardId ? ' pd-person-on' : '')} onClick={() => setPick(g.guardId)}>
          <span className="pd-avatar pd-avatar-sm">{initials(g.name)}</span>
          <span><b>{g.name}</b><span>{g.post} · on duty</span></span>
        </button>
      ))}
      <button className={'pd-person pd-person-none' + (pick === NO_ONE ? ' pd-person-on' : '')} onClick={() => setPick(NO_ONE)}>No one yet</button>
      {pick === NO_ONE && <div className="pd-warn">If you are alone at this post, your supervisor will be told the post is empty.</div>}

      {error && <div className="pd-card pd-bad">{error}</div>}
      <button className="pd-btn pd-btn-primary" onClick={start} disabled={busy || !pick}>
        {busy ? 'Please wait...' : !pick ? 'Pick who covers' : pick === NO_ONE ? 'Start ' + typeName.toLowerCase() + ' break' : 'Ask ' + picked.name + ' · start ' + typeName.toLowerCase() + ' break'}
      </button>
      <button className="pd-link" onClick={onClose}>Cancel</button>
    </>
  );
}
