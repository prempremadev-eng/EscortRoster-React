import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './icons.jsx';
import { compressImage, videoSeconds, MAX_VIDEO_SECONDS, MAX_VIDEO_MB } from './media.js';
import VoiceNote, { RecordingRow, LockedRecorder, useVoiceRecorder } from './VoiceNote.jsx';
import { useSwipeReply, jumpTo } from './swipe.jsx';

// The agency group ("IPF Schedule", Prem 26 Oct), the same screen for a guard (by his link) and the office
// (by login): the whole team and the office talk here, everyone can send and reply.
// api: { load(), send(text, replyTo), media(blob, opts) }. No timer: it reloads on a notification and
// when the page comes back to the screen (every load costs reads).
function Bubble({ m, onReply }) {
  const swipe = useSwipeReply(() => onReply(m));
  return (
    <div className={'pd-bubble ' + (m.mine ? 'pd-bubble-me' : 'pd-bubble-other') + (m.office ? ' pd-bubble-sup' : '')} {...swipe.handlers} style={swipe.style}>
      {swipe.icon}
      {!m.mine && <div className={'pd-author' + (m.office ? ' pd-author-sup' : '')}>{m.author}</div>}
      {m.reply && (
        <div className="pd-quote pd-quote-tap" onClick={e => { e.stopPropagation(); jumpTo(m.reply.id); }}>
          <div className="pd-quote-name">{m.reply.author}</div><div className="pd-quote-text">{m.reply.text}</div>
        </div>
      )}
      {m.media && m.media.url && m.kind === 'photo' && <a href={m.media.url} target="_blank" rel="noreferrer"><img src={m.media.url} alt="Photo" className="pd-media-img" /></a>}
      {m.media && m.media.url && m.kind === 'video' && <video src={m.media.url} controls playsInline preload="metadata" className="pd-media-img" />}
      {m.media && m.media.url && m.kind === 'voice' && <VoiceNote url={m.media.url} duration={m.media.duration} />}
      {m.text && <div>{m.text}</div>}
      <div className="pd-meta">{m.time}</div>
    </div>
  );
}

export default function GroupChat({ api, onBack, fill }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);
  const photoInput = useRef(null);
  const galleryInput = useRef(null);

  const load = useCallback(async () => {
    try {
      setData((await api.load()).data);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, [api]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onShow = () => { if (document.visibilityState === 'visible') load(); };
    window.addEventListener('guard-push', load);
    document.addEventListener('visibilitychange', onShow);
    return () => { window.removeEventListener('guard-push', load); document.removeEventListener('visibilitychange', onShow); };
  }, [load]);
  const count = data ? data.messages.length : 0;
  useEffect(() => { if (endRef.current) endRef.current.scrollIntoView({ block: 'end' }); }, [count]);

  async function run(fn) {
    setBusy(true);
    setError('');
    try {
      await fn();
      setReplyTo(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  const upload = (blob, kind, source, duration) => run(() => api.media(blob, { kind, source, duration, reply_to: replyTo ? replyTo.ROWID : null }));
  const rec = useVoiceRecorder((blob, secs) => upload(blob, 'voice', 'mic', secs), setError);

  function send(e) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    run(async () => { await api.send(body, replyTo ? replyTo.ROWID : null); setText(''); });
  }
  async function onPhoto(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) upload(await compressImage(file), 'photo', 'camera', 0);
  }
  async function onGallery(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.type.startsWith('image/')) return upload(await compressImage(file), 'photo', 'gallery', 0);
    if (!file.type.startsWith('video/')) return setError('Pick a photo or a video.');
    const secs = await videoSeconds(file);
    if (secs > MAX_VIDEO_SECONDS + 1) return setError('Video must be ' + MAX_VIDEO_SECONDS + ' seconds or less.');
    if (file.size > MAX_VIDEO_MB * 1048576) return setError('Video is too big (max ' + MAX_VIDEO_MB + ' MB).');
    upload(file, 'video', 'gallery', Math.round(secs));
  }

  let lastDate = '';
  return (
    <div className={'pd pd-chat pd-group' + (fill ? ' pd-group-fill' : '')}>
      <div className="pd-chat-top">
        <div className="pd-chat-head">
          {onBack && <button className="pd-icon-btn" onClick={onBack} aria-label="Back">{Icon.back}</button>}
          <div className="pd-avatar pd-avatar-on pd-group-avatar">👥</div>
          <div className="pd-chat-title">
            <div className="pd-title pd-title-sm">{data ? data.title : 'Team group'}</div>
            <div className="pd-muted pd-small">Everyone in the team and the office</div>
          </div>
          <button className="pd-icon-btn" onClick={load} aria-label="Refresh">{Icon.refresh}</button>
        </div>
      </div>
      <div className="pd-chat-body">
        {!data && !error && <div className="pd-sys">Loading...</div>}
        {data && data.messages.length === 0 && <div className="pd-sys">No messages yet. Say hello to the team 👋</div>}
        {data && data.messages.map(m => {
          const day = m.date !== lastDate ? m.date : null;
          lastDate = m.date;
          return (
            <div key={m.ROWID} id={'msg-' + m.ROWID} className="pd-msg-wrap">
              {day && <div className="pd-day">{day}</div>}
              <Bubble m={m} onReply={x => setReplyTo(x)} />
            </div>
          );
        })}
        <div ref={endRef}></div>
      </div>
      {error && <div className="pd-error-bar">{error}</div>}
      {replyTo && (
        <div className="pd-reply-bar">
          <div className="pd-row-between">
            <div className="pd-quote-name">Replying to {replyTo.mine ? 'yourself' : replyTo.author}</div>
            <button className="pd-x" onClick={() => setReplyTo(null)} aria-label="Cancel reply">×</button>
          </div>
          <div className="pd-quote-text">{replyTo.text || (replyTo.kind === 'voice' ? 'Voice note' : replyTo.kind === 'video' ? 'Video' : 'Photo')}</div>
        </div>
      )}
      <form className="pd-composer" onSubmit={send}>
        {rec.locked && <LockedRecorder r={rec} />}
        {rec.recording && !rec.locked && <RecordingRow secs={rec.secs} slide={rec.slide} />}
        <label htmlFor="grp-msg" className="pd-hidden">Message to the group</label>
        <div className="pd-input" hidden={rec.recording}>
          <input id="grp-msg" value={text} onChange={e => setText(e.target.value)} placeholder={replyTo ? 'Write a reply' : 'Message the team'} maxLength={255} autoComplete="off" />
          <button type="button" className="pd-in-btn" onClick={() => galleryInput.current.click()} disabled={busy} aria-label="Attach photo or video">{Icon.clip}</button>
          <button type="button" className="pd-in-btn" onClick={() => photoInput.current.click()} disabled={busy} aria-label="Take a photo">{Icon.camera}</button>
        </div>
        {text.trim()
          ? <button className="pd-send" type="submit" disabled={busy} aria-label="Send">{Icon.send}</button>
          : !rec.locked && <button type="button" className={'pd-mic' + (rec.recording ? ' pd-mic-on' : '')} {...rec.micProps} disabled={busy} aria-label="Touch or hold to record a voice note">{Icon.mic}</button>}
        <input ref={photoInput} type="file" accept="image/*" capture="environment" className="pd-file" onChange={onPhoto} />
        <input ref={galleryInput} type="file" accept="image/*,video/*" className="pd-file" onChange={onGallery} />
      </form>
    </div>
  );
}
