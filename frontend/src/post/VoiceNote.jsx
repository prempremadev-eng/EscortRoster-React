import { useEffect, useRef, useState } from 'react';
import { clock, recorderType, MAX_VOICE_SECONDS } from './media.js';

// A voice note like WhatsApp (Prem, 25 Oct): round play button, bars that fill while it plays
// (tap a bar to jump there), and the time: the length before playing, the position while playing.
// The bars are not the real sound wave (that needs the whole file decoded); they come from the link,
// so the same note always looks the same.
const BARS = 28;
// Recording: slide the finger this far left from the mic to throw the note away.
export const SLIDE_CANCEL = 90;

// Takes the place of the message box while the mic is held: red dot, time, "‹ Slide to cancel"
// (it follows the finger and fades as it nears the cancel point).
export function RecordingRow({ secs, slide }) {
  const left = Math.min(slide, SLIDE_CANCEL);
  return (
    <div className="pd-rec">
      <span className="pd-voice-dot"></span>
      <span className="pd-rec-time">{clock(secs)}</span>
      <span className="pd-rec-cancel" style={{ transform: 'translateX(' + -left + 'px)', opacity: 1 - left / (SLIDE_CANCEL * 1.4) }}>‹ Slide to cancel</span>
    </div>
  );
}

function barsOf(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return Array.from({ length: BARS }, () => {
    h = (h * 1103515245 + 12345) >>> 0;
    return 25 + (h % 75);
  });
}

export default function VoiceNote({ url, duration = 0 }) {
  const audio = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  const [length, setLength] = useState(duration);
  const bars = useRef(barsOf(url || 'voice')).current;

  useEffect(() => () => { if (audio.current) audio.current.pause(); }, []);

  function toggle() {
    const a = audio.current;
    if (!a) return;
    if (a.paused) {
      // Only one note plays at a time, like WhatsApp.
      document.querySelectorAll('audio.pd-vn-audio').forEach(x => { if (x !== a) x.pause(); });
      a.play().catch(() => setPlaying(false));
    } else a.pause();
  }
  function seek(i) {
    const a = audio.current;
    if (!a || !length) return;
    a.currentTime = (i / BARS) * length;
    setAt(a.currentTime);
  }
  const done = length ? at / length : 0;

  return (
    <div className="pd-vn">
      <audio ref={audio} className="pd-vn-audio" src={url} preload="metadata"
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setAt(0); }}
        onTimeUpdate={e => setAt(e.currentTarget.currentTime)}
        onLoadedMetadata={e => { const d = e.currentTarget.duration; if (isFinite(d) && d > 0) setLength(d); }} />
      <button type="button" className="pd-vn-play" onClick={toggle} aria-label={playing ? 'Pause' : 'Play voice note'}>
        {playing
          ? <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"></rect><rect x="14" y="5" width="4" height="14" rx="1"></rect></svg>
          : <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"></path></svg>}
      </button>
      <div className="pd-vn-main">
        <div className="pd-vn-bars">
          {bars.map((h, i) => (
            <span key={i} className={'pd-vn-bar' + (i / BARS < done ? ' pd-vn-bar-on' : '')} style={{ height: h + '%' }} onClick={() => seek(i)}></span>
          ))}
        </div>
        <div className="pd-vn-time">{clock(playing || at > 0 ? at : length)}</div>
      </div>
    </div>
  );
}

// The mic of a message box, like WhatsApp (Prem, 25 Oct):
//   hold  → records, let go sends, slide left cancels;
//   touch → records on its own ("locked"): 🗑 throws it away, ⏸ pauses / goes on, ➤ sends.
// onDone(blob, seconds) gets the note; onError(text) a problem (no mic, blocked).
const TAP_MS = 350;
export function useVoiceRecorder(onDone, onError) {
  const rec = useRef(null);
  const holding = useRef(false);
  const lockedRef = useRef(false);
  const pressAt = useRef(0);
  const startX = useRef(0);
  const time = useRef({ acc: 0, from: 0 });
  const [secs, setSecs] = useState(null);
  const [slide, setSlide] = useState(0);
  const [locked, setLocked] = useState(false);
  const [paused, setPaused] = useState(false);
  const elapsed = () => time.current.acc + (time.current.from ? (Date.now() - time.current.from) / 1000 : 0);

  function finish(cancel) {
    holding.current = false;
    setSlide(0);
    const r = rec.current;
    if (!r) { lockedRef.current = false; setLocked(false); return; }
    rec.current = null;
    if (r.state === 'inactive') return;
    r.cancelled = cancel === true;
    r.stop();
  }

  async function down(e) {
    e.preventDefault();
    if (rec.current || lockedRef.current) return;
    holding.current = true;
    pressAt.current = Date.now();
    startX.current = e.clientX;
    setSlide(0);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* keep going without it */ }
    const type = recorderType('voice');
    if (type === null || !navigator.mediaDevices) { holding.current = false; return onError('This phone cannot record voice here.'); }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks = [];
      const r = new MediaRecorder(stream, type ? { mimeType: type } : {});
      r.ondataavailable = ev => { if (ev.data.size) chunks.push(ev.data); };
      r.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        clearInterval(r.timer);
        const length = elapsed();
        time.current = { acc: 0, from: 0 };
        lockedRef.current = false;
        setSecs(null);
        setLocked(false);
        setPaused(false);
        if (r.cancelled || length < 1) return;
        onDone(new Blob(chunks, { type: (r.mimeType || type || 'audio/webm').split(';')[0] }), Math.round(length));
      };
      r.timer = setInterval(() => {
        const s = elapsed();
        setSecs(s);
        if (s >= MAX_VOICE_SECONDS) finish(false);
      }, 250);
      rec.current = r;
      time.current = { acc: 0, from: Date.now() };
      setSecs(0);
      r.start();
      // Let go while the phone was still asking for the mic: a touch → locked; a slide away → nothing.
      if (!holding.current && !lockedRef.current) finish(true);
    } catch {
      holding.current = false;
      lockedRef.current = false;
      setLocked(false);
      onError('Microphone is blocked. Allow the microphone for this site.');
    }
  }
  function move(e) {
    if (!holding.current || lockedRef.current) return;
    const dx = Math.max(0, startX.current - e.clientX);
    setSlide(dx);
    if (dx > SLIDE_CANCEL) finish(true);
  }
  function up() {
    if (!holding.current || lockedRef.current) return;
    holding.current = false;
    setSlide(0);
    // A quick touch: keep recording without the finger (WhatsApp's "just touch the mic").
    if (Date.now() - pressAt.current < TAP_MS) { lockedRef.current = true; setLocked(true); return; }
    finish(false);
  }
  function pause() {
    const r = rec.current;
    if (!r) return;
    if (r.state === 'recording' && r.pause) {
      r.pause();
      time.current = { acc: elapsed(), from: 0 };
      setPaused(true);
    } else if (r.state === 'paused') {
      r.resume();
      time.current = { acc: time.current.acc, from: Date.now() };
      setPaused(false);
    }
  }
  const cancelPointer = () => { if (!lockedRef.current) finish(true); };
  useEffect(() => () => finish(true), []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    secs, slide, locked, paused, recording: secs !== null,
    micProps: { onPointerDown: down, onPointerMove: move, onPointerUp: up, onPointerCancel: cancelPointer, onContextMenu: e => e.preventDefault() },
    pause, send: () => finish(false), discard: () => finish(true)
  };
}

// Locked recording: takes the whole message box.
export function LockedRecorder({ r }) {
  return (
    <div className="pd-lock">
      <button type="button" className="pd-lock-del" onClick={r.discard} aria-label="Delete this voice note">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M6 7l1 13h10l1-13"></path><path d="M9 7V4h6v3"></path></svg>
      </button>
      <div className="pd-lock-mid">
        <span className={'pd-voice-dot' + (r.paused ? ' pd-voice-dot-off' : '')}></span>
        <span className="pd-rec-time">{clock(r.secs || 0)}</span>
        <button type="button" className="pd-lock-pause" onClick={r.pause}>{r.paused ? '● Resume' : '❚❚ Pause'}</button>
      </div>
      <button type="button" className="pd-send pd-lock-send" onClick={r.send} aria-label="Send this voice note">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M3.4 20.4l17.45-7.48a1 1 0 0 0 0-1.84L3.4 3.6a.993.993 0 0 0-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z"></path></svg>
      </button>
    </div>
  );
}
