import { useEffect, useRef, useState } from 'react';
import { clock } from './media.js';

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
