import { useRef, useState } from 'react';

// Swipe a chat bubble right to reply, like WhatsApp (Prem, 26 Oct): the bubble follows the finger,
// a ↩ shows behind it, and letting go past REPLY_AT starts the reply. A vertical move is a scroll,
// not a swipe. onLong (optional): holding still opens the message menu.
const REPLY_AT = 60;
const MAX_PULL = 80;

export function useSwipeReply(onReply, onLong) {
  const touch = useRef(null);
  const pull = useRef(0);
  const [dx, setDx] = useState(0);
  const set = v => { pull.current = v; setDx(v); };

  function onTouchStart(e) {
    const t = e.touches[0];
    touch.current = {
      x: t.clientX, y: t.clientY, swiping: false,
      timer: onLong ? setTimeout(() => { touch.current = null; set(0); onLong(); }, 500) : null
    };
  }
  function onTouchMove(e) {
    const c = touch.current;
    if (!c) return;
    const t = e.touches[0];
    const x = t.clientX - c.x;
    const y = Math.abs(t.clientY - c.y);
    if (!c.swiping && (y > 12 || x < -12)) { clearTimeout(c.timer); touch.current = null; set(0); return; }
    if (x > 8) { c.swiping = true; clearTimeout(c.timer); }
    if (c.swiping) set(Math.max(0, Math.min(x, MAX_PULL)));
  }
  function onTouchEnd() {
    const c = touch.current;
    if (c) clearTimeout(c.timer);
    touch.current = null;
    const go = pull.current >= REPLY_AT;
    set(0);
    if (go) onReply();
  }

  return {
    handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd },
    style: dx ? { transform: 'translateX(' + dx + 'px)', transition: 'none' } : undefined,
    icon: <span className="pd-swipe-icon" style={{ opacity: Math.min(1, dx / REPLY_AT) }} aria-hidden="true">↩</span>
  };
}
