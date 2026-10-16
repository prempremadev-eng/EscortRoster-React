import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { Icon, initials } from './icons.jsx';
import AddWork from './AddWork.jsx';
import SafetySheet from './SafetySheet.jsx';

const QUICK_REPLIES = ['OK', 'Noted', 'Done'];
const ALERT_WAIT_MIN = 5;

// A text bubble: hold it (or right-click) for the menu, swipe it right to reply (WhatsApp style).
function Bubble({ m, onMenu, onReply }) {
  const touch = useRef(null);

  function start(e) {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY, timer: setTimeout(() => { touch.current = null; onMenu(m); }, 500) };
  }
  function move(e) {
    if (!touch.current) return;
    const t = e.touches[0];
    const dx = t.clientX - touch.current.x;
    const dy = Math.abs(t.clientY - touch.current.y);
    if (dy > 12 || dx < -12) { clearTimeout(touch.current.timer); touch.current = null; return; }
    if (dx > 60) { clearTimeout(touch.current.timer); touch.current = null; onReply(m); }
  }
  function end() {
    if (touch.current) clearTimeout(touch.current.timer);
    touch.current = null;
  }

  return (
    <div
      className={'pd-bubble ' + (m.mine ? 'pd-bubble-me' : 'pd-bubble-other')}
      onTouchStart={start} onTouchMove={move} onTouchEnd={end} onTouchCancel={end}
      onContextMenu={e => { e.preventDefault(); onMenu(m); }}
    >
      {!m.mine && <div className="pd-author">{m.author}</div>}
      {m.reply && (
        <div className="pd-quote">
          <div className="pd-quote-name">{m.reply.author}</div>
          <div className="pd-quote-text">{m.reply.text}</div>
        </div>
      )}
      <div>{m.text}</div>
      <div className="pd-meta">
        {m.pinned && <>{Icon.pin}Pinned for next guard · </>}
        {m.forwarded && <>Sent to supervisor · </>}
        {m.time}
      </div>
    </div>
  );
}

function WorkCard({ m, onFinish, busy }) {
  const w = m.work;
  if (!w) return null;
  const state = w.finished ? 'done' : w.expired ? 'expired' : 'open';
  return (
    <div id={'work-' + w.ROWID} className={'pd-work pd-work-' + state}>
      <div className="pd-row-between">
        <div className="pd-work-label">WORK UPDATE · {m.time}</div>
        <div className={'pd-pill pd-pill-sm ' + (state === 'done' ? 'pd-green' : state === 'expired' ? 'pd-red' : 'pd-amber')}>
          {state === 'done' ? 'Finished ' + w.finished : state === 'expired' ? 'Permit expired' : 'In progress'}
        </div>
      </div>
      <div className="pd-work-title">{w.contractor} · {w.persons} persons</div>
      {w.description && <div className="pd-work-desc">{w.description}</div>}
      {state !== 'done' && <div className="pd-muted pd-small">Permit {w.from} – {w.to}</div>}
      {state !== 'done' && (
        <button className="pd-btn pd-btn-green-outline" onClick={() => onFinish(w)} disabled={busy}>{Icon.check}Work finished</button>
      )}
    </div>
  );
}

function AlertCard({ m, duty, onCancel }) {
  const a = m.alert;
  if (!a) return null;
  const late = a.status === 'sent' && a.waitMin >= ALERT_WAIT_MIN;
  return (
    <div className="pd-alert">
      <div className="pd-alert-head"><span>ALERT TO SUPERVISOR</span><span>{m.time}</span></div>
      <div className="pd-alert-body">
        <div>{m.text}</div>
        <div className="pd-muted pd-small">Sent · {a.sent}</div>
        {a.status === 'seen' && <div className="pd-alert-seen">{Icon.check}Seen by {a.seenBy} · {a.seen}</div>}
        {a.status === 'cancelled' && <div className="pd-muted pd-small">Cancelled · {a.cancelled}</div>}
        {a.status === 'sent' && !late && <div className="pd-muted pd-small">Not seen yet</div>}
        {late && (
          <>
            <div className="pd-alert-late">Not seen yet · {a.waitMin} min</div>
            <div className="pd-alert-panel">
              <div className="pd-alert-panel-title">Supervisor has not seen your alert</div>
              {duty.supervisorPhone
                ? <a className="pd-btn pd-btn-red" href={'tel:' + duty.supervisorPhone}>{Icon.phone}Call supervisor</a>
                : <div className="pd-btn pd-btn-red pd-btn-off">Supervisor number not set</div>}
              <button className="pd-btn pd-btn-outline" onClick={() => onCancel(a)}>Cancel</button>
              <div className="pd-muted pd-small">Cancel only if the problem is solved. Your name and time are saved.</div>
            </div>
          </>
        )}
        {a.status === 'sent' && !late && <button className="pd-link pd-link-left" onClick={() => onCancel(a)}>Cancel alert</button>}
      </div>
    </div>
  );
}

// Screen 3: the post timeline of the guard on duty.
export default function PostTimeline({ token, duty, shiftLine }) {
  const [messages, setMessages] = useState([]);
  const [openWorks, setOpenWorks] = useState([]);
  const [status, setStatus] = useState('loading');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [sheet, setSheet] = useState(null); // 'menu' | 'alert' | 'safety' | message object
  const [page, setPage] = useState(null); // 'work'
  const [alertText, setAlertText] = useState('');
  const endRef = useRef(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const d = (await api.postTimeline(token)).data;
      setMessages(d.messages);
      setOpenWorks(d.openWorks);
      setStatus('ok');
    } catch (err) {
      setError(err.message);
      setStatus('ok');
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  // New notes appear at the bottom, like a chat.
  useEffect(() => {
    if (endRef.current) endRef.current.scrollIntoView({ block: 'end' });
  }, [messages]);

  function say(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }

  // Every write: busy while it runs, show the error, reload the timeline after.
  async function run(task, done) {
    setBusy(true);
    setError('');
    try {
      await task();
      if (done) done();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function send(e, quick) {
    if (e) e.preventDefault();
    const body = quick || text;
    if (!body.trim()) return;
    run(() => api.postMessage(token, body, replyTo ? replyTo.ROWID : null), () => {
      if (!quick) setText('');
      setReplyTo(null);
    });
  }

  function pin(m, pinned) {
    setSheet(null);
    run(() => api.pinMessage(token, m.ROWID, pinned));
  }

  function forward(m) {
    setSheet(null);
    run(() => api.forwardMessage(token, m.ROWID), () => say('Sent to supervisor'));
  }

  async function copy(m) {
    setSheet(null);
    try {
      await navigator.clipboard.writeText(m.text);
      say('Copied');
    } catch {
      say('Could not copy');
    }
  }

  function finishWork(w) {
    run(() => api.finishWork(token, w.ROWID));
  }

  function sendAlert(e) {
    e.preventDefault();
    run(() => api.sendAlert(token, alertText), () => { setAlertText(''); setSheet(null); });
  }

  function cancelAlert(a) {
    run(() => api.cancelAlert(token, a.ROWID));
  }

  function showWork(w) {
    const el = document.getElementById('work-' + w.ROWID);
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  if (page === 'work') {
    return <AddWork token={token} duty={duty} onClose={saved => { setPage(null); if (saved) load(); }} />;
  }

  const expired = openWorks.filter(w => w.expired);
  let lastDate = '';

  return (
    <div className="pd pd-chat">
      <div className="pd-chat-top">
        <div className="pd-chat-head">
          <div className="pd-avatar pd-avatar-on">{initials(duty.name)}</div>
          <div className="pd-chat-title">
            <div className="pd-title pd-title-sm">{duty.post}</div>
            <div className="pd-muted pd-small">{shiftLine} · {duty.name}</div>
          </div>
          <div className="pd-pill pd-green">On duty</div>
          <button className="pd-icon-btn" onClick={load} aria-label="Refresh">{Icon.refresh}</button>
        </div>
        <button className="pd-safety-row" onClick={() => setSheet('safety')}>
          <span className="pd-safety-icon">{Icon.shield}</span><span className="pd-grow">Safety</span>{Icon.chevron}
        </button>
        {expired.length > 0 ? (
          <button className="pd-strip pd-strip-red" onClick={() => showWork(expired[0])}>
            <span><b>Permit expired {expired[0].to}</b> · {expired[0].contractor} still working</span><b>View</b>
          </button>
        ) : openWorks.length > 0 && (
          <button className="pd-strip pd-strip-amber" onClick={() => showWork(openWorks[0])}>
            <span><b>{openWorks.length} work still going on</b> · {openWorks.map(w => w.contractor).join(', ')}</span><b>View</b>
          </button>
        )}
      </div>

      <div className="pd-chat-body">
        {status === 'loading' && <div className="pd-sys">Loading...</div>}
        {status === 'ok' && messages.length === 0 && <div className="pd-sys">No notes yet</div>}
        {messages.map(m => {
          const day = m.date !== lastDate ? m.date : null;
          lastDate = m.date;
          return (
            <div key={m.ROWID} className="pd-msg-wrap">
              {day && <div className="pd-day">{day}</div>}
              {m.kind === 'system' && <div className="pd-sys pd-sys-green">{Icon.check}{m.text}</div>}
              {m.kind === 'system_red' && <div className="pd-sys pd-sys-red">{m.text}</div>}
              {m.kind === 'work' && <WorkCard m={m} onFinish={finishWork} busy={busy} />}
              {m.kind === 'alert' && <AlertCard m={m} duty={duty} onCancel={cancelAlert} />}
              {m.kind === 'text' && <Bubble m={m} onMenu={x => setSheet(x)} onReply={x => setReplyTo(x)} />}
            </div>
          );
        })}
        <div ref={endRef}></div>
      </div>

      {error && <div className="pd-error-bar">{error}</div>}
      {toast && <div className="pd-toast">{toast}</div>}

      {replyTo && (
        <div className="pd-reply-bar">
          <div className="pd-row-between">
            <div className="pd-quote-name">Replying to {replyTo.mine ? 'yourself' : replyTo.author}</div>
            <button className="pd-x" onClick={() => setReplyTo(null)} aria-label="Cancel reply">×</button>
          </div>
          <div className="pd-quote-text">{replyTo.text}</div>
          <div className="pd-quick">
            {QUICK_REPLIES.map(q => <button key={q} className="pd-chip" onClick={() => send(null, q)} disabled={busy}>{q}</button>)}
          </div>
        </div>
      )}

      <form className="pd-composer" onSubmit={send}>
        <button type="button" className="pd-plus" onClick={() => setSheet('menu')} aria-label="Add work update or alert">{Icon.plus}</button>
        <label htmlFor="pd-msg" className="pd-hidden">Write a note</label>
        <input id="pd-msg" value={text} onChange={e => setText(e.target.value)} placeholder={replyTo ? 'Write a reply' : 'Write a note'} maxLength={255} autoComplete="off" />
        <button className="pd-send" type="submit" disabled={busy || !text.trim()} aria-label="Send">{Icon.send}</button>
      </form>

      {sheet && (
        <div className="pd-dim" onClick={() => setSheet(null)}>
          <div className="pd-sheet" onClick={e => e.stopPropagation()}>
            <div className="pd-grab"></div>

            {sheet === 'menu' && (
              <>
                <div className="pd-sheet-title">Add to {duty.post}</div>
                <button className="pd-option pd-option-primary" onClick={() => { setSheet(null); setPage('work'); }}>
                  {Icon.wrench}<span><b>Work update</b><span>Contractor, persons, permit time</span></span>
                </button>
                <button className="pd-option pd-option-off" disabled>
                  {Icon.car}<span><b>Visitor / vehicle entry</b><span>Link to the entry app comes later</span></span>
                </button>
                <button className="pd-option pd-option-red" onClick={() => setSheet('alert')}>
                  {Icon.alert}<span><b>Alert supervisor</b><span>Urgent problem, message now</span></span>
                </button>
                <button className="pd-link" onClick={() => setSheet(null)}>Cancel</button>
              </>
            )}

            {sheet === 'alert' && (
              <form className="pd-form" onSubmit={sendAlert}>
                <div className="pd-sheet-title pd-red-text">Alert supervisor</div>
                <label htmlFor="pd-alert">What is the problem?</label>
                <textarea id="pd-alert" value={alertText} onChange={e => setAlertText(e.target.value)} maxLength={255} rows={3} placeholder="Gate 2 lock broken, shutter half open." />
                <button className="pd-btn pd-btn-red" type="submit" disabled={busy || !alertText.trim()}>{busy ? 'Sending...' : 'Send alert'}</button>
                <button type="button" className="pd-link" onClick={() => setSheet(null)}>Cancel</button>
              </form>
            )}

            {sheet === 'safety' && <SafetySheet token={token} onClose={() => setSheet(null)} />}

            {typeof sheet === 'object' && (
              <>
                <div className="pd-sheet-preview">{sheet.text}</div>
                {sheet.myShift && (sheet.pinned
                  ? <button className="pd-option" onClick={() => pin(sheet, false)}>{Icon.pin}<span><b>Unpin</b><span>Next guard will not see it</span></span></button>
                  : <button className="pd-option pd-option-primary" onClick={() => pin(sheet, true)}>{Icon.pin}<span><b>Pin for next guard</b><span>Shows on their take over screen</span></span></button>)}
                <button className="pd-option" onClick={() => { setReplyTo(sheet); setSheet(null); }}>{Icon.reply}<span><b>Reply</b><span>OK / Noted / Done or your words</span></span></button>
                <button className="pd-option" onClick={() => forward(sheet)} disabled={sheet.forwarded}>{Icon.forward}<span><b>Send to supervisor</b><span>{sheet.forwarded ? 'Already sent' : 'Shows in the supervisor inbox'}</span></span></button>
                <button className="pd-option" onClick={() => copy(sheet)}>{Icon.copy}<span><b>Copy</b></span></button>
                <button className="pd-link" onClick={() => setSheet(null)}>Cancel</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
