import { useEffect, useRef, useState } from 'react';

const pad = n => String(n).padStart(2, '0');

function initialTime(value) {
  const now = new Date();
  const raw = (value || '').replace(/[^0-9]/g, '');
  let hh = raw.length >= 3 ? parseInt(raw.slice(0, raw.length - 2)) : now.getHours();
  let mm = raw.length >= 3 ? parseInt(raw.slice(-2)) : now.getMinutes();
  if (isNaN(hh) || hh > 23) hh = now.getHours();
  if (isNaN(mm) || mm > 59) mm = now.getMinutes();
  return { hh, mm };
}

// Grid time picker: 24 hour buttons + scrollable minute list, "⚡ Now", Cancel / OK.
export default function TimePicker({ label, value, onOk, onClose }) {
  const [{ hh, mm }, setTime] = useState(() => initialTime(value));
  const hoursRef = useRef(null);
  const minutesRef = useRef(null);

  useEffect(() => {
    hoursRef.current?.querySelector('.selected')?.scrollIntoView({ block: 'center' });
    minutesRef.current?.querySelector('.selected')?.scrollIntoView({ block: 'center' });
  }, []);

  function setNow() {
    const d = new Date();
    setTime({ hh: d.getHours(), mm: d.getMinutes() });
    setTimeout(() => {
      hoursRef.current?.querySelector('.selected')?.scrollIntoView({ block: 'center' });
      minutesRef.current?.querySelector('.selected')?.scrollIntoView({ block: 'center' });
    }, 0);
  }

  return (
    <div className="grid-picker-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="grid-picker-box">
        <div className="grid-picker-header">
          <div className="gp-title-row">
            <div className="gp-title">{label || 'Time'}</div>
            <button type="button" className="gp-now" onClick={setNow}>⚡ Now</button>
          </div>
          <div className="gp-value">{pad(hh)}:{pad(mm)}</div>
        </div>
        <div className="grid-picker-body">
          <div className="gp-hours" ref={hoursRef}>
            {Array.from({ length: 24 }, (_, h) => (
              <button
                type="button"
                key={h}
                className={'gp-hour-btn' + (h === hh ? ' selected' : '')}
                onClick={() => setTime(t => ({ ...t, hh: h }))}
              >{pad(h)}</button>
            ))}
          </div>
          <div className="gp-minutes" ref={minutesRef}>
            {Array.from({ length: 60 }, (_, m) => (
              <div
                key={m}
                className={'gp-minute-item' + (m === mm ? ' selected' : '')}
                onClick={() => setTime(t => ({ ...t, mm: m }))}
              >{pad(m)}</div>
            ))}
          </div>
        </div>
        <div className="grid-picker-footer">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" className="gp-ok" onClick={() => { onOk(pad(hh) + ':' + pad(mm)); onClose(); }}>✓ OK</button>
        </div>
      </div>
    </div>
  );
}
