import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { Icon, initials } from './icons.jsx';
import AddWork from './AddWork.jsx';
import SafetySheet from './SafetySheet.jsx';
import VideoRecorder from './VideoRecorder.jsx';
import { MAX_VIDEO_MB, MAX_VIDEO_SECONDS, MAX_VOICE_SECONDS, clock, compressImage, recorderType, videoSeconds } from './media.js';

const QUICK_REPLIES = ['OK', 'Noted', 'Done'];
// Shown as chat bubbles (with the hold menu and swipe to reply).
const BUBBLE_KINDS = ['text', 'photo', 'video', 'voice'];
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
      {m.media && <Media m={m} />}
      {m.text && <div>{m.text}</div>}
      <div className="pd-meta">
        {m.pinned && <>{Icon.pin}Pinned for next guard · </>}
        {m.forwarded && <>Sent to supervisor · </>}
        {m.time}
      </div>
    </div>
  );
}

// Photo / video / voice inside a bubble, with where it came from.
function Media({ m }) {
  const { url, source, duration } = m.media;
  if (!url) return <div className="pd-media-missing">{m.kind === 'voice' ? 'Voice note' : m.kind === 'video' ? 'Video' : 'Photo'} not available</div>;
  return (
    <div className="pd-media">
      {m.kind === 'photo' && <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Photo from the post" className="pd-media-img" /></a>}
      {m.kind === 'video' && <video src={url} controls playsInline preload="metadata" className="pd-media-img" />}
      {m.kind === 'voice' && <audio src={url} controls preload="metadata" className="pd-media-audio" />}
      <div className="pd-media-tags">
        {source === 'camera' && <span className="pd-tag pd-tag-green">Taken at post</span>}
        {source === 'gallery' && <span className="pd-tag pd-tag-amber">From gallery</span>}
        {duration > 0 && <span className="pd-tag">{clock(duration)}</span>}
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
  const [camera, setCamera] = useState(false);
  const [voice, setVoice] = useState(null); // seconds while recording
  const endRef = useRef(null);
  const photoInput = useRef(null);
  const galleryInput = useRef(null);
  const holdTimer = useRef(null);
  const voiceRec = useRef(null);
  const holdingMic = useRef(false);

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

  // Every photo / video / voice goes the same way: upload, then reload the timeline.
  function upload(blob, kind, source, duration) {
    const replying = replyTo ? replyTo.ROWID : null;
    say('Sending ' + (kind === 'voice' ? 'voice note' : kind) + '...');
    run(() => api.uploadMedia(token, blob, { kind, source, duration, reply_to: replying }), () => setReplyTo(null));
  }

  async function onPhotoTaken(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      upload(await compressImage(file), 'photo', 'camera', 0);
    } catch (err) {
      setError(err.message);
    }
  }

  async function onGalleryPick(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      if (file.type.startsWith('image/')) return upload(await compressImage(file), 'photo', 'gallery', 0);
      if (!file.type.startsWith('video/')) return setError('Pick a photo or a video.');
      const secs = await videoSeconds(file);
      if (secs > MAX_VIDEO_SECONDS + 1) return setError('Video must be ' + MAX_VIDEO_SECONDS + ' seconds or less.');
      if (file.size > MAX_VIDEO_MB * 1048576) return setError('Video is too big (max ' + MAX_VIDEO_MB + ' MB).');
      upload(file, 'video', 'gallery', Math.round(secs));
    } catch (err) {
      setError(err.message);
    }
  }

  // Camera button: tap = photo, hold = video.
  function cameraDown() {
    holdTimer.current = setTimeout(() => { holdTimer.current = null; setCamera(true); }, 450);
  }
  function cameraUp() {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
      photoInput.current.click();
    }
  }

  // Mic button: hold to record, let go to send (WhatsApp style).
  async function voiceDown(e) {
    e.preventDefault();
    holdingMic.current = true;
    const type = recorderType('voice');
    if (type === null || !navigator.mediaDevices) return setError('This phone cannot record voice here.');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks = [];
      const rec = new MediaRecorder(stream, type ? { mimeType: type } : {});
      const began = Date.now();
      rec.ondataavailable = ev => { if (ev.data.size) chunks.push(ev.data); };
      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        clearInterval(rec.timer);
        setVoice(null);
        const secs = (Date.now() - began) / 1000;
        if (rec.cancelled) return;
        if (secs < 1) return say('Hold the mic to record');
        upload(new Blob(chunks, { type: (rec.mimeType || type || 'audio/webm').split(';')[0] }), 'voice', 'mic', Math.round(secs));
      };
      rec.timer = setInterval(() => {
        const secs = (Date.now() - began) / 1000;
        setVoice(secs);
        if (secs >= MAX_VOICE_SECONDS) rec.stop();
      }, 250);
      voiceRec.current = rec;
      setVoice(0);
      rec.start();
      // Let go while the phone was still asking for the microphone: nothing to send.
      if (!holdingMic.current) voiceUp(true);
    } catch {
      setError('Microphone is blocked. Allow the microphone for this site.');
    }
  }
  function voiceUp(cancel) {
    holdingMic.current = false;
    const rec = voiceRec.current;
    voiceRec.current = null;
    if (!rec || rec.state !== 'recording') return;
    rec.cancelled = cancel === true;
    rec.stop();
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

  if (camera) {
    return (
      <div className="pd">
        <VideoRecorder onClose={() => setCamera(false)} onSend={(blob, secs) => { setCamera(false); upload(blob, 'video', 'camera', secs); }} />
      </div>
    );
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
              {BUBBLE_KINDS.includes(m.kind) && <Bubble m={m} onMenu={x => setSheet(x)} onReply={x => setReplyTo(x)} />}
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
          <div className="pd-quote-text">{replyTo.text || (replyTo.kind === 'voice' ? 'Voice note' : replyTo.kind === 'video' ? 'Video' : 'Photo')}</div>
          <div className="pd-quick">
            {QUICK_REPLIES.map(q => <button key={q} className="pd-chip" onClick={() => send(null, q)} disabled={busy}>{q}</button>)}
          </div>
        </div>
      )}

      {voice !== null && (
        <div className="pd-voice-bar">
          <span className="pd-voice-dot"></span>Recording {clock(voice)} · let go to send
          <button className="pd-link" onPointerDown={e => { e.stopPropagation(); voiceUp(true); }}>Cancel</button>
        </div>
      )}

      <form className="pd-composer" onSubmit={send}>
        <button type="button" className="pd-plus" onClick={() => setSheet('menu')} aria-label="Add work update or alert">{Icon.plus}</button>
        <label htmlFor="pd-msg" className="pd-hidden">Write a note</label>
        <div className="pd-input">
          <input id="pd-msg" value={text} onChange={e => setText(e.target.value)} placeholder={replyTo ? 'Write a reply' : 'Write a note'} maxLength={255} autoComplete="off" />
          <button type="button" className="pd-in-btn" onClick={() => galleryInput.current.click()} disabled={busy} aria-label="Attach photo or video from gallery">{Icon.clip}</button>
          <button type="button" className="pd-in-btn" onPointerDown={cameraDown} onPointerUp={cameraUp} onPointerLeave={() => { clearTimeout(holdTimer.current); holdTimer.current = null; }} onContextMenu={e => e.preventDefault()} disabled={busy} aria-label="Take photo, hold for video">{Icon.camera}</button>
        </div>
        {text.trim()
          ? <button className="pd-send" type="submit" disabled={busy} aria-label="Send">{Icon.send}</button>
          : <button type="button" className={'pd-mic' + (voice !== null ? ' pd-mic-on' : '')} onPointerDown={voiceDown} onPointerUp={() => voiceUp(false)} onContextMenu={e => e.preventDefault()} disabled={busy} aria-label="Hold to record a voice note">{Icon.mic}</button>}
        <input ref={photoInput} type="file" accept="image/*" capture="environment" className="pd-file" onChange={onPhotoTaken} />
        <input ref={galleryInput} type="file" accept="image/*,video/*" className="pd-file" onChange={onGalleryPick} />
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
                <div className="pd-sheet-preview">{sheet.text || (sheet.kind === 'voice' ? 'Voice note' : sheet.kind === 'video' ? 'Video' : 'Photo')}</div>
                {sheet.myShift && (sheet.pinned
                  ? <button className="pd-option" onClick={() => pin(sheet, false)}>{Icon.pin}<span><b>Unpin</b><span>Next guard will not see it</span></span></button>
                  : <button className="pd-option pd-option-primary" onClick={() => pin(sheet, true)}>{Icon.pin}<span><b>Pin for next guard</b><span>Shows on their take over screen</span></span></button>)}
                <button className="pd-option" onClick={() => { setReplyTo(sheet); setSheet(null); }}>{Icon.reply}<span><b>Reply</b><span>OK / Noted / Done or your words</span></span></button>
                <button className="pd-option" onClick={() => forward(sheet)} disabled={sheet.forwarded}>{Icon.forward}<span><b>Send to supervisor</b><span>{sheet.forwarded ? 'Already sent' : 'Shows in the supervisor inbox'}</span></span></button>
                {sheet.text && <button className="pd-option" onClick={() => copy(sheet)}>{Icon.copy}<span><b>Copy</b></span></button>}
                <button className="pd-link" onClick={() => setSheet(null)}>Cancel</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
