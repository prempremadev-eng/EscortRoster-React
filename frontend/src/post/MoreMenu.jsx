import { useEffect, useRef, useState } from 'react';

// ⋮ next to refresh in a chat header (Prem, 26 Oct: Duty history out of the header row).
// items: [[label, onClick, className?], …]. Closes on a pick or a tap outside. `label` shows a named button
// (the schedule's "⋯ More") instead of the ⋮ icon.
export default function MoreMenu({ items, label }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = e => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);
  return (
    <div className="pd-more" ref={box}>
      {label
        ? <button className="pd-chip" onClick={() => setOpen(v => !v)} aria-expanded={open}>{label} {open ? '▴' : '▾'}</button>
        : <button className="pd-icon-btn" onClick={() => setOpen(v => !v)} aria-label="More" aria-expanded={open}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><circle cx="12" cy="5" r="2"></circle><circle cx="12" cy="12" r="2"></circle><circle cx="12" cy="19" r="2"></circle></svg>
        </button>}
      {open && (
        <div className="pd-more-menu" role="menu">
          {items.filter(Boolean).map(([text, onClick, cls]) => (
            <button key={text} role="menuitem" className={cls || ''} onClick={() => { setOpen(false); onClick(); }}>{text}</button>
          ))}
        </div>
      )}
    </div>
  );
}
