import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import './post.css';

// Thin line icons (the design uses no emoji).
const Icon = {
  bell: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path><path d="M10 21a2 2 0 0 0 4 0"></path></svg>,
  check: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"></path></svg>,
  pin: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 17v5"></path><path d="M9 3h6l-1 6 4 4H6l4-4z"></path></svg>,
  refresh: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"></path><path d="M21 3v5h-5"></path></svg>,
  send: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 2L11 13"></path><path d="M22 2l-7 20-4-9-9-4z"></path></svg>
};

const initials = name => String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

// The POST guard's phone, opened from the card IN notification.
//   Screen 1 "Duty assigned" → Go to my post
//   Screen 2 "Take over"     → Taken over (the guard before is handed over)
//   Screen 3 "Post timeline" → notes for this post; pin a note for the next guard
// No auto-refresh: every load costs Data Store reads. Use the refresh button instead.
export default function PostDuty({ token }) {
  const [duty, setDuty] = useState(null);
  const [view, setView] = useState('loading');
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState(null);
  const endRef = useRef(null);

  const loadTimeline = useCallback(async () => {
    setMessages((await api.postTimeline(token)).data);
  }, [token]);

  const load = useCallback(async () => {
    setError('');
    try {
      const d = (await api.postDuty(token)).data;
      setDuty(d);
      if (d.locked) return setView('locked');
      if (d.status === 'handed_over') return setView('done');
      if (d.status === 'on_duty') {
        await loadTimeline();
        return setView('timeline');
      }
      setView(v => (v === 'waiting' ? 'waiting' : 'main'));
    } catch (err) {
      setError(err.message);
      setView('error');
    }
  }, [token, loadTimeline]);

  useEffect(() => { load(); }, [load]);

  // New notes appear at the bottom, like a chat.
  useEffect(() => {
    if (view === 'timeline' && endRef.current) endRef.current.scrollIntoView({ block: 'end' });
  }, [messages, view]);

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

  async function send(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError('');
    try {
      await api.postMessage(token, text);
      setText('');
      await loadTimeline();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function pin(m, pinned) {
    setPicked(null);
    setError('');
    try {
      await api.pinMessage(token, m.ROWID, pinned);
      setMessages(list => list.map(x => (x.ROWID === m.ROWID ? { ...x, pinned } : x)));
    } catch (err) {
      setError(err.message);
    }
  }

  async function refresh() {
    setError('');
    try {
      await loadTimeline();
    } catch (err) {
      setError(err.message);
    }
  }

  const shift = duty && duty.shift;
  const shiftLine = shift ? 'Shift ' + shift.code + ' · ' + shift.start + ' – ' + shift.end : '';
  const callButton = duty && (duty.supervisorPhone
    ? <a className="pd-btn pd-btn-outline" href={'tel:' + duty.supervisorPhone}>Call supervisor</a>
    : <div className="pd-btn pd-btn-outline pd-btn-off">Supervisor number not set</div>);

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
        <div className="pd-card">Your post opens after your access card shows <b>IN</b> for today's duty.</div>
        <div className="pd-grow"></div>
        <button className="pd-btn pd-btn-outline" onClick={load}>Check again</button>
      </div>
    );
  }

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
        <div className="pd-card">Handed over at <b>{duty.handedOverAt}</b>. Your duty for today is over. You can leave.</div>
        <div className="pd-grow"></div>
        <button className="pd-btn pd-btn-outline" onClick={load}>Check again</button>
      </div>
    );
  }

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
  if (view === 'waiting') {
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
        {error && <div className="pd-card pd-bad">{error}</div>}
        <div className="pd-grow"></div>
        <div className="pd-muted pd-small pd-center">Press only after you reach the post{from ? ' and meet ' + from.name : ''}</div>
        <button className="pd-btn pd-btn-primary pd-btn-big" onClick={takeOver} disabled={busy}>{Icon.check}{busy ? 'Saving...' : 'Taken over'}</button>
        <button className="pd-link" onClick={() => setView('main')}>Back</button>
      </div>
    );
  }

  // Screen 3: Post timeline
  let lastDate = '';
  return (
    <div className="pd pd-chat">
      <div className="pd-chat-head">
        <div className="pd-avatar pd-avatar-on">{initials(duty.name)}</div>
        <div className="pd-chat-title">
          <div className="pd-title pd-title-sm">{duty.post}</div>
          <div className="pd-muted pd-small">{shiftLine} · {duty.name}</div>
        </div>
        <div className="pd-pill pd-green">On duty</div>
        <button className="pd-icon-btn" onClick={refresh} aria-label="Refresh">{Icon.refresh}</button>
      </div>

      <div className="pd-chat-body">
        {messages.length === 0 && <div className="pd-sys">No notes yet</div>}
        {messages.map(m => {
          const day = m.date !== lastDate ? m.date : null;
          lastDate = m.date;
          return (
            <div key={m.ROWID} className="pd-msg-wrap">
              {day && <div className="pd-day">{day}</div>}
              {m.kind === 'system'
                ? <div className="pd-sys pd-sys-green">{Icon.check}{m.text}</div>
                : (
                  <div className={'pd-bubble ' + (m.mine ? 'pd-bubble-me' : 'pd-bubble-other')} onClick={() => m.myShift && setPicked(m)}>
                    {!m.mine && <div className="pd-author">{m.author}</div>}
                    <div>{m.text}</div>
                    <div className="pd-meta">{m.pinned && <>{Icon.pin}Pinned for next guard · </>}{m.time}</div>
                  </div>
                )}
            </div>
          );
        })}
        <div ref={endRef}></div>
      </div>

      {error && <div className="pd-error-bar">{error}</div>}
      <form className="pd-composer" onSubmit={send}>
        <label htmlFor="pd-msg" className="pd-hidden">Write a note</label>
        <input id="pd-msg" value={text} onChange={e => setText(e.target.value)} placeholder="Write a note" maxLength={255} autoComplete="off" />
        <button className="pd-send" type="submit" disabled={busy || !text.trim()} aria-label="Send">{Icon.send}</button>
      </form>

      {picked && (
        <div className="pd-dim" onClick={() => setPicked(null)}>
          <div className="pd-sheet" onClick={e => e.stopPropagation()}>
            <div className="pd-grab"></div>
            <div className="pd-sheet-preview">{picked.text}</div>
            {picked.pinned
              ? <button className="pd-btn pd-btn-outline" onClick={() => pin(picked, false)}>Unpin</button>
              : <button className="pd-btn pd-btn-primary" onClick={() => pin(picked, true)}>{Icon.pin}Pin for next guard</button>}
            <button className="pd-link" onClick={() => setPicked(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
