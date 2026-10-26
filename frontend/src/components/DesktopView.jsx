import { useEffect, useState } from 'react';

// "Desktop view" on a phone (Prem, 26 Oct: the escort sheet is a wide table): like Chrome's "Desktop site",
// the page is laid out 1280 px wide and the phone shows it zoomed out (pinch to zoom in). Remembered on
// this phone; leaving the page puts the normal phone view back.
const KEY = 'escort_desktop';
const WIDE = 'width=1280';
const NORMAL = 'width=device-width, initial-scale=1.0';
const isPhone = () => Math.min(window.screen.width, window.screen.height) <= 900;

function setViewport(content) {
  const meta = document.querySelector('meta[name="viewport"]');
  if (meta) meta.setAttribute('content', content);
}

export default function DesktopViewToggle() {
  const [on, setOn] = useState(() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } });
  useEffect(() => {
    if (!isPhone()) return undefined;
    setViewport(on ? WIDE : NORMAL);
    return () => setViewport(NORMAL);
  }, [on]);
  if (!isPhone()) return null;
  const flip = () => setOn(v => { try { localStorage.setItem(KEY, v ? '0' : '1'); } catch { /* private mode */ } return !v; });
  return (
    <button className={'btn ' + (on ? '' : 'secondary ') + 'desktop-toggle no-print'} onClick={flip}>
      {on ? '📱 Phone view' : '🖥️ Desktop view'}
    </button>
  );
}
