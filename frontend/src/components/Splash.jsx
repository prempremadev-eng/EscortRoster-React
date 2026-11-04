import { useEffect, useState } from 'react';

// The welcome when the app opens (Prem, 26 Oct), once per app open:
//   shift incharge → 📍 branch · agency, guard → "Welcome, <name>", admin → the logo (app name + shield
//   until a logo file is given). A page asks for it with showSplash({...}); this host plays it once.
const SHOWN = 'splash_shown';
export function showSplash(detail) {
  try { if (sessionStorage.getItem(SHOWN)) return; sessionStorage.setItem(SHOWN, '1'); } catch { /* private mode: show it */ }
  window.dispatchEvent(new CustomEvent('app-splash', { detail }));
}

// Owl intro on every app open (Prem, 4 Nov: "owl thalai suththanum", like an owl turning its head):
// the face slides round to the back of the head and comes back from the other side, then a blink.
// Plays first; a welcome asked meanwhile waits for it. Module level so StrictMode can't eat it.
const OWL = 'owl_shown';
const OWL_NOW = (() => { try { if (sessionStorage.getItem(OWL)) return false; sessionStorage.setItem(OWL, '1'); } catch { /* show it */ } return true; })();

// The head is its own 3D layer (front face + back of head) on the neck, so the WHOLE head turns
// round like a real owl (Prem, 4 Nov: "neck da suththudhu, eye mattum illa").
function Owl() {
  const head = (back) => (
    <svg viewBox="130 90 252 240" aria-hidden="true">
      <path d="M150 108L218 156L168 186Z M362 108L294 156L344 186Z" fill="#C2410C" />
      <circle cx="256" cy="215" r="105" fill="#F97316" />
      {back
        ? <path d="M206 170q25 18 50 0q25 18 50 0M196 205q30 20 60 0q30 20 60 0M211 240q22 14 45 0q22 14 45 0" stroke="#C2410C" strokeWidth="7" fill="none" strokeLinecap="round" />
        : <>
          <g className="owl-eyes">
            <circle cx="212" cy="210" r="46" fill="#fff" /><circle cx="300" cy="210" r="46" fill="#fff" />
            <circle cx="214" cy="214" r="23" fill="#111827" /><circle cx="298" cy="214" r="23" fill="#111827" />
            <circle cx="223" cy="204" r="8" fill="#fff" /><circle cx="307" cy="204" r="8" fill="#fff" />
          </g>
          <path d="M240 250L272 250L256 278Z" fill="#FACC15" />
        </>}
    </svg>
  );
  return (
    <div className="owl">
      <svg viewBox="0 0 512 512" aria-hidden="true">
        <circle className="owl-star" cx="110" cy="96" r="5" fill="#FDE68A" />
        <circle className="owl-star" cx="160" cy="60" r="4" fill="#FDE68A" />
        <circle className="owl-star" cx="330" cy="58" r="4" fill="#FDE68A" />
        <path d="M405 62a40 40 0 1 0 35 66a46 46 0 0 1 -35 -66z" fill="#FDE68A" />
        <rect x="96" y="400" width="320" height="20" rx="10" fill="#78350F" />
        <ellipse cx="256" cy="312" rx="118" ry="104" fill="#F97316" />
        <circle cx="256" cy="215" r="100" fill="#EA580C" />
        <path d="M146 280Q126 340 170 396Q162 330 146 280Z M366 280Q386 340 342 396Q350 330 366 280Z" fill="#C2410C" />
        <ellipse cx="256" cy="345" rx="68" ry="58" fill="#FED7AA" />
        <path d="M226 326q8 8 16 0M270 326q8 8 16 0M236 356q10 10 20 0q10 10 20 0" stroke="#FB923C" strokeWidth="4" fill="none" strokeLinecap="round" />
        <rect x="216" y="398" width="8" height="28" rx="4" fill="#FACC15" /><rect x="230" y="398" width="8" height="28" rx="4" fill="#FACC15" />
        <rect x="276" y="398" width="8" height="28" rx="4" fill="#FACC15" /><rect x="290" y="398" width="8" height="28" rx="4" fill="#FACC15" />
      </svg>
      <div className="owl-head">
        <div className="owl-side">{head(false)}</div>
        <div className="owl-side owl-side-back">{head(true)}</div>
      </div>
    </div>
  );
}

export default function SplashHost() {
  const [owl, setOwl] = useState(OWL_NOW ? 'on' : null);
  useEffect(() => {
    if (!owl) return undefined;
    const t = setTimeout(() => setOwl(owl === 'on' ? 'leaving' : null), owl === 'on' ? 3000 : 400);
    return () => clearTimeout(t);
  }, [owl]);
  const owlLayer = owl && (
    <div className={'splash splash-owl' + (owl === 'leaving' ? ' splash-out' : '')} onClick={() => setOwl('leaving')} role="status">
      <Owl />
      <div className="splash-title">NightOwl</div>
    </div>
  );
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
    if (!s || owl === 'on') return undefined;
    // 3.5 s for everyone (Prem, 26 Oct: the incharge's "Estancia · IPF" timing felt right).
    const stay = s.stay || 3500;
    const a = setTimeout(() => setLeaving(true), stay);
    const b = setTimeout(() => setS(null), stay + 400);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [s, owl === 'on']);
  if (!s) return owlLayer || null;
  if (owl === 'on') return owlLayer;
  return (<>
    <div className={'splash' + (s.place ? ' splash-place' : '') + (leaving ? ' splash-out' : '')} onClick={() => setLeaving(true)} role="status">
      {s.logo
        ? <div className="splash-logo" aria-label="Zoho">{logo && <span dangerouslySetInnerHTML={{ __html: logo }} />}</div>
        : s.appLogo
          // Our own app's logo (the home-screen icon) for shift incharges (Prem, 26 Oct).
          ? <img className="splash-app" src="icon-512.png" alt="NightOwl" />
          : !s.place && <div className="splash-icon">{s.icon || '🛡️'}</div>}
      {s.kicker && <div className="splash-kicker">{s.kicker}</div>}
      <div className="splash-title">{s.title}</div>
      {s.sub && <div className="splash-sub">{s.sub}</div>}
      {s.foot && <div className="splash-foot">{s.foot}</div>}
    </div>
    {owlLayer}
  </>);
}
