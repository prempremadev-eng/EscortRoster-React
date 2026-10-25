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
  // Office logins see the Zoho logo (Prem, 26 Oct; official file from zoho.com/branding in public/).
  // Put inline so each coloured part can pop in on its own.
  const [logo, setLogo] = useState('');
  useEffect(() => {
    if (!s || !s.logo || logo) return;
    fetch('zoho-logo.svg').then(r => (r.ok ? r.text() : '')).then(t => setLogo(t.startsWith('<svg') ? t : '')).catch(() => {});
  }, [s, logo]);
  useEffect(() => {
    const on = e => { setLeaving(false); setS(e.detail); };
    window.addEventListener('app-splash', on);
    return () => window.removeEventListener('app-splash', on);
  }, []);
  useEffect(() => {
    if (!s) return undefined;
    const stay = s.stay || (s.logo ? 2200 : 1600);
    const a = setTimeout(() => setLeaving(true), stay);
    const b = setTimeout(() => setS(null), stay + 400);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [s]);
  if (!s) return null;
  return (
    <div className={'splash' + (s.place ? ' splash-place' : '') + (leaving ? ' splash-out' : '')} onClick={() => setLeaving(true)} role="status">
      {s.logo
        ? <div className="splash-logo" aria-label="Zoho">{logo && <span dangerouslySetInnerHTML={{ __html: logo }} />}</div>
        : s.appLogo
          // Our own app's logo (the home-screen icon) for shift incharges (Prem, 26 Oct).
          ? <img className="splash-app" src="icon-512.png" alt="Escort Duty" />
          : !s.place && <div className="splash-icon">{s.icon || '🛡️'}</div>}
      {s.kicker && <div className="splash-kicker">{s.kicker}</div>}
      <div className="splash-title">{s.title}</div>
      {s.sub && <div className="splash-sub">{s.sub}</div>}
      {s.foot && <div className="splash-foot">{s.foot}</div>}
    </div>
  );
}
