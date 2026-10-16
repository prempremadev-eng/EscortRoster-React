import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { Icon, initials } from './icons.jsx';
import PostTimeline from './PostTimeline.jsx';
import './post.css';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

// The POST guard's phone, opened from the card IN notification.
//   Screen 1 "Duty assigned" → Go to my post
//   Screen 2 "Take over"     → Taken over (the guard before is handed over)
//   Screen 3 "Post timeline" → PostTimeline.jsx
// No auto-refresh: every load costs Data Store reads. Use the refresh button instead.
export default function PostDuty({ token }) {
  const [duty, setDuty] = useState(null);
  const [view, setView] = useState('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const d = (await api.postDuty(token)).data;
      setDuty(d);
      if (d.locked) return setView('locked');
      if (d.status === 'handed_over') return setView('done');
      if (d.status === 'on_duty') return setView('timeline');
      setView(v => (v === 'waiting' ? 'waiting' : 'main'));
    } catch (err) {
      setError(err.message);
      setView('error');
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function takeOver() {
    setBusy(true);
    setError('');
    try {
      await api.takeOver(token);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const shift = duty && duty.shift;
  const shiftLine = shift ? 'Shift ' + shift.code + ' · ' + shift.start + ' – ' + shift.end : '';

  if (view === 'loading') return <div className="pd pd-page"><div className="pd-muted">Loading...</div></div>;

  if (view === 'error') {
    return (
      <div className="pd pd-page">
        <div className="pd-card pd-bad">{error}</div>
        <button className="pd-btn pd-btn-outline" onClick={load}>Try again</button>
      </div>
    );
  }

  if (view === 'locked') {
    return (
      <div className="pd pd-page">
        <div className="pd-top"><div className="pd-brand">Duty</div></div>
        <div className="pd-muted">Hi {duty.name}</div>
        <div className="pd-card"><div>Your post opens after your access card shows <b>IN</b> for today's duty.</div></div>
        <div className="pd-grow"></div>
        <button className="pd-btn pd-btn-outline" onClick={load}>Check again</button>
      </div>
    );
  }

  if (view === 'timeline') return <PostTimeline token={token} duty={duty} shiftLine={shiftLine} />;

  // The next guard took over: today's duty at this post is over.
  if (view === 'done') {
    return (
      <div className="pd pd-page">
        <div className="pd-head-row">
          <div>
            <div className="pd-title">{duty.post}</div>
            <div className="pd-muted pd-small">{shiftLine}</div>
          </div>
          <div className="pd-pill pd-neutral">Handed over</div>
        </div>
        <div className="pd-card"><div>Handed over at <b>{duty.handedOverAt}</b>. Your duty for today is over. You can leave.</div></div>
        <div className="pd-grow"></div>
        <button className="pd-btn pd-btn-outline" onClick={load}>Check again</button>
      </div>
    );
  }

  const callButton = duty.supervisorPhone
    ? <a className="pd-btn pd-btn-outline" href={'tel:' + duty.supervisorPhone}>Call supervisor</a>
    : <div className="pd-btn pd-btn-outline pd-btn-off">Supervisor number not set</div>;

  // Screen 1: Duty assigned
  if (view === 'main') {
    return (
      <div className="pd pd-page">
        <div className="pd-top">
          <div className="pd-brand">Duty</div>
          <div className="pd-muted">{duty.branch}</div>
        </div>
        <div className="pd-notice">
          {Icon.bell}
          <div>
            <div className="pd-notice-sub">Card IN · {duty.inAt}</div>
            <div className="pd-notice-main">Your post for today is ready</div>
          </div>
        </div>
        <div className="pd-muted">{greeting()}, {duty.name}</div>
        <div className="pd-card pd-post">
          <div className="pd-label">YOUR POST</div>
          <div className="pd-post-name">{duty.post}</div>
          <div className="pd-tiles">
            <div className="pd-tile"><div className="pd-tile-k">Shift</div><div className="pd-tile-v">{shift.code}</div></div>
            <div className="pd-tile"><div className="pd-tile-k">Timing</div><div className="pd-tile-v">{shift.start} – {shift.end}</div></div>
          </div>
        </div>
        <div className="pd-grow"></div>
        <button className="pd-btn pd-btn-primary" onClick={() => setView('waiting')}>Go to my post</button>
        {callButton}
      </div>
    );
  }

  // Screen 2: Take over
  const from = duty.from;
  return (
    <div className="pd pd-page">
      <div className="pd-head-row">
        <div>
          <div className="pd-title">{duty.post}</div>
          <div className="pd-muted pd-small">{shiftLine}</div>
        </div>
        <div className="pd-pill pd-amber">Waiting</div>
      </div>
      <div className="pd-card pd-from">
        <div className="pd-avatar">{from ? initials(from.name) : '–'}</div>
        <div>
          <div className="pd-muted pd-small">Taking over from</div>
          <div className="pd-from-name">{from ? from.name : 'No one on duty now'}</div>
          {from && <div className="pd-muted pd-small">Shift {from.shift}{from.since ? ' · on duty since ' + from.since : ''}</div>}
        </div>
      </div>
      <div className="pd-card">
        <div className="pd-label">HANDOVER NOTES</div>
        {duty.notes.length === 0 && <div className="pd-muted">No notes pinned for you.</div>}
        {duty.notes.map((n, i) => (
          <div key={i} className="pd-note">
            <div>{n.text}</div>
            <div className="pd-time">{n.time}</div>
          </div>
        ))}
      </div>
      {(duty.works || []).length > 0 && (
        <div className="pd-card pd-gap8">
          <div className="pd-label">WORK STILL GOING ON</div>
          {duty.works.map(w => (
            <div key={w.ROWID}>
              <div className="pd-row-between"><b>{w.contractor}</b><span className="pd-muted pd-small">{w.persons} persons</span></div>
              <div className="pd-muted pd-small">{w.description ? w.description + ' · ' : ''}started {w.started}</div>
            </div>
          ))}
        </div>
      )}
      {error && <div className="pd-card pd-bad">{error}</div>}
      <div className="pd-grow"></div>
      <div className="pd-muted pd-small pd-center">Press only after you reach the post{from ? ' and meet ' + from.name : ''}</div>
      <button className="pd-btn pd-btn-primary pd-btn-big" onClick={takeOver} disabled={busy}>{Icon.check}{busy ? 'Saving...' : 'Taken over'}</button>
      <button className="pd-link" onClick={() => setView('main')}>Back</button>
    </div>
  );
}
