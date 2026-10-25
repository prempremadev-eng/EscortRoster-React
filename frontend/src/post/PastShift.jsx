import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Icon, initials } from './icons.jsx';
import { clock } from './media.js';
import VoiceNote from './VoiceNote.jsx';

const toMin = stamp => Date.parse(stamp.replace(' ', 'T') + ':00Z') / 60000;
const hhmm = stamp => stamp.slice(11, 16);

// Screen 9: one past shift, view only. The bar shows who stood at the post minute by minute
// (blue = main guard, orange = cover, gap = nobody), and "Who was here at" answers for any time.
export default function PastShift({ token, post, logId, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [at, setAt] = useState('');

  useEffect(() => {
    api.pastShift(token, logId, post).then(r => {
      setData(r.data);
      setAt(hhmm(r.data.start));
    }).catch(err => setError(err.message));
  }, [token, logId, post]);

  if (!data) {
    return (
      <div className="pd pd-page">
        <button className="pd-icon-btn" onClick={onClose} aria-label="Back">{Icon.back}</button>
        {error ? <div className="pd-card pd-bad">{error}</div> : <div className="pd-muted">Loading...</div>}
      </div>
    );
  }

  const s = toMin(data.start);
  const e = Math.max(toMin(data.end), s + 1);
  const pct = m => ((m - s) / (e - s)) * 100;
  const segs = data.presence.filter(p => toMin(p.to) > toMin(p.from) || p.from === p.to);

  // "Who was here at hh:mm": the time is on the shift's day, or the next day for a night shift.
  function whoAt() {
    if (!at) return '';
    let stamp = data.start.slice(0, 10) + ' ' + at;
    if (toMin(stamp) < s) {
      const d = new Date(data.start.slice(0, 10) + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + 1);
      stamp = d.toISOString().slice(0, 10) + ' ' + at;
    }
    const m = toMin(stamp);
    if (m < s || m > e) return 'outside this shift';
    const here = data.presence.filter(p => toMin(p.from) <= m && m < toMin(p.to));
    return here.length ? here.map(p => p.name + (p.kind === 'cover' ? ' (cover)' : '')).join(', ') : 'nobody (post empty)';
  }

  return (
    <div className="pd pd-page pd-history">
      <div className="pd-form-head">
        <button className="pd-icon-btn" onClick={onClose} aria-label="Back to duty history">{Icon.back}</button>
        <span className="pd-avatar">{initials(data.name)}</span>
        <div>
          <div className="pd-title pd-title-sm">{data.name} · Shift {data.shift.code}{data.open ? ' · now' : ''}</div>
          <div className="pd-muted pd-small">{data.start.slice(0, 10)} {hhmm(data.start)} – {data.open ? 'now' : hhmm(data.end)}</div>
        </div>
      </div>

      <div className="pd-card pd-gap8">
        <div className="pd-row-between">
          <div className="pd-label">WHO WAS AT THIS POST</div>
          {data.open && <span className="pd-pill pd-pill-sm pd-green">Live till now</span>}
        </div>
        <div className="pd-bar">
          {segs.map((p, i) => (
            <div key={i} className={'pd-bar-seg ' + (p.kind === 'cover' ? 'pd-bar-cover' : 'pd-bar-main')}
              style={{ left: pct(toMin(p.from)) + '%', width: Math.max(1, pct(toMin(p.to)) - pct(toMin(p.from))) + '%' }}></div>
          ))}
        </div>
        <div className="pd-row-between pd-small pd-muted"><span>{hhmm(data.start)}</span><span>{data.open ? 'now' : hhmm(data.end)}</span></div>
        {segs.map((p, i) => (
          <div key={i} className="pd-seg-row">
            <span className={'pd-dot ' + (p.kind === 'cover' ? 'pd-dot-amber' : 'pd-dot-blue')}></span>
            <span className="pd-grow">{p.name}{p.kind === 'cover' ? ' · covering' : ''}</span>
            <span className="pd-small pd-muted">{hhmm(p.from)} – {hhmm(p.to)}</span>
          </div>
        ))}
        {segs.length === 0 && <div className="pd-muted pd-small">No presence recorded for this shift.</div>}
        <div className="pd-who">
          <span>Who was here at</span>
          <input type="time" value={at} onChange={ev => setAt(ev.target.value)} aria-label="Time" />
          <b>→ {whoAt()}</b>
        </div>
      </div>

      <div className="pd-label">TIMELINE</div>
      {data.messages.length === 0 && <div className="pd-muted">No notes in this shift.</div>}
      {data.messages.map(m => (
        <div key={m.ROWID} className="pd-past-msg">
          {m.kind === 'system' && <div className="pd-sys pd-sys-green">{m.text}</div>}
          {m.kind === 'system_red' && <div className="pd-sys pd-sys-red">{m.text}</div>}
          {m.kind !== 'system' && m.kind !== 'system_red' && (
            <div className="pd-card pd-past-card">
              <div className="pd-row-between pd-small"><b>{m.author}</b><span className="pd-muted">{m.time} · {m.kind === 'text' ? 'note' : m.kind}</span></div>
              {m.work && <div><b>{m.work.contractor} · {m.work.persons} persons</b><div className="pd-small pd-muted">{m.work.description}{m.work.finished ? ' · finished ' + m.work.finished : ''}</div></div>}
              {m.media && m.media.url && m.kind === 'photo' && <img src={m.media.url} alt="Photo from the post" className="pd-media-img" />}
              {m.media && m.media.url && m.kind === 'video' && <video src={m.media.url} controls playsInline preload="metadata" className="pd-media-img" />}
              {m.media && m.media.url && m.kind === 'voice' && <VoiceNote url={m.media.url} duration={m.media.duration} />}
              {m.media && m.media.duration > 0 && m.kind !== 'voice' && <span className="pd-tag">{clock(m.media.duration)}</span>}
              {!m.work && !m.media && <div>{m.text}</div>}
              {m.pinned && <div className="pd-small pd-muted">{Icon.pin} Pinned for next guard</div>}
            </div>
          )}
        </div>
      ))}
      <div className="pd-past-foot">{data.open ? 'Shift still going on · view only here' : 'Past shift · view only'}</div>
    </div>
  );
}
