import { useEffect, useState } from 'react';

// The welcome when the app opens (Prem, 26 Oct), once per app open:
//   shift incharge → 📍 branch · agency, guard → "Welcome, <name>", admin → the logo (app name + shield
//   until a logo file is given). A page asks for it with showSplash({...}); this host plays it once.
const SHOWN = 'splash_shown';
export function showSplash(detail) {
  try { if (sessionStorage.getItem(SHOWN)) return; sessionStorage.setItem(SHOWN, '1'); } catch { /* private mode: show it */ }
  window.dispatchEvent(new CustomEvent('app-splash', { detail }));
}

export default function SplashHost() {
  const [s, setS] = useState(null);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const on = e => { setLeaving(false); setS(e.detail); };
    window.addEventListener('app-splash', on);
    return () => window.removeEventListener('app-splash', on);
  }, []);
  useEffect(() => {
    if (!s) return undefined;
    const a = setTimeout(() => setLeaving(true), 1600);
    const b = setTimeout(() => setS(null), 2000);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [s]);
  if (!s) return null;
  return (
    <div className={'splash' + (leaving ? ' splash-out' : '')} onClick={() => setLeaving(true)} role="status">
      <div className="splash-icon">{s.icon || '🛡️'}</div>
      {s.kicker && <div className="splash-kicker">{s.kicker}</div>}
      <div className="splash-title">{s.title}</div>
      {s.sub && <div className="splash-sub">{s.sub}</div>}
    </div>
  );
}
