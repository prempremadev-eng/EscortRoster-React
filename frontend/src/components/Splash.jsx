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
// round like a real owl (Prem, 4 Nov: "neck da suththudhu, eye mattum illa"). Soft "clay" look
// (Prem's prompt: cute 3D owl, sits still, head turns all the way round): every part has a light
// top-left, dark bottom-right gradient, glossy eyes, a shadow and a glow behind.
const GRAD = [
  ['b', 'radial', '#FDBA74', '#F97316', '#B93C0B'],   // body / head
  ['y', 'radial', '#FFFBF5', '#FED7AA', '#F5A962'],   // belly
  ['e', 'radial', '#FFFFFF', '#FFFFFF', '#CBD5E1'],   // eye white
  ['p', 'radial', '#4B5563', '#111827', '#000000'],   // pupil
  ['k', 'radial', '#FEF08A', '#FACC15', '#CA8A04'],   // beak / feet
  ['w', 'radial', '#EA580C', '#C2410C', '#7C2D12'],   // wings / ears
  ['r', 'linear', '#A16207', '#78350F', '#451A03'],   // branch
];
function Defs({ id }) {
  return (
    <defs>
      {GRAD.map(([k, t, a, m, z]) => {
        const stops = [<stop key="a" offset="0" stopColor={a} />, <stop key="m" offset=".5" stopColor={m} />, <stop key="z" offset="1" stopColor={z} />];
        return t === 'radial'
          ? <radialGradient key={k} id={id + k} cx=".35" cy=".3" r=".8">{stops}</radialGradient>
          : <linearGradient key={k} id={id + k} x1="0" y1="0" x2="0" y2="1">{stops}</linearGradient>;
      })}
    </defs>
  );
}
const F = (id, k) => 'url(#' + id + k + ')';

export function Owl() {
  const head = (back) => {
    const id = back ? 'owlB' : 'owlF';
    return (
      <svg viewBox="130 90 252 240" aria-hidden="true">
        <Defs id={id} />
        <path d="M150 104Q170 140 218 156L168 188Q146 150 150 104Z M362 104Q342 140 294 156L344 188Q366 150 362 104Z" fill={F(id, 'w')} />
        <circle cx="256" cy="215" r="105" fill={F(id, 'b')} />
        {back
          ? <path d="M206 170q25 18 50 0q25 18 50 0M196 205q30 20 60 0q30 20 60 0M211 240q22 14 45 0q22 14 45 0" stroke="#B93C0B" strokeWidth="7" fill="none" strokeLinecap="round" opacity=".8" />
          : <>
            <ellipse cx="256" cy="226" rx="92" ry="64" fill="#FDBA74" opacity=".55" />
            <g className="owl-eyes">
              <circle cx="212" cy="210" r="46" fill={F(id, 'e')} /><circle cx="300" cy="210" r="46" fill={F(id, 'e')} />
              <circle cx="216" cy="214" r="25" fill={F(id, 'p')} /><circle cx="296" cy="214" r="25" fill={F(id, 'p')} />
              <circle cx="225" cy="202" r="9" fill="#fff" /><circle cx="305" cy="202" r="9" fill="#fff" />
              <circle cx="209" cy="224" r="4" fill="#fff" opacity=".8" /><circle cx="289" cy="224" r="4" fill="#fff" opacity=".8" />
            </g>
            <path d="M238 250Q256 246 274 250Q264 272 256 282Q248 272 238 250Z" fill={F(id, 'k')} />
            <ellipse cx="196" cy="252" rx="13" ry="7" fill="#FB7185" opacity=".45" /><ellipse cx="316" cy="252" rx="13" ry="7" fill="#FB7185" opacity=".45" />
          </>}
      </svg>
    );
  };
  const id = 'owlS';
  return (
    <div className="owl">
      <svg viewBox="0 0 512 512" aria-hidden="true">
        <Defs id={id} />
        <circle className="owl-star" cx="110" cy="96" r="5" fill="#FDE68A" />
        <circle className="owl-star" cx="160" cy="60" r="4" fill="#FDE68A" />
        <circle className="owl-star" cx="330" cy="58" r="4" fill="#FDE68A" />
        <path d="M405 62a40 40 0 1 0 35 66a46 46 0 0 1 -35 -66z" fill="#FDE68A" />
        <ellipse cx="256" cy="440" rx="150" ry="14" fill="#000" opacity=".25" />
        <rect x="96" y="400" width="320" height="22" rx="11" fill={F(id, 'r')} />
        <ellipse cx="256" cy="312" rx="118" ry="104" fill={F(id, 'b')} />
        <circle cx="256" cy="215" r="103" fill={F(id, 'b')} />
        <path d="M146 270Q120 340 172 398Q164 328 146 270Z M366 270Q392 340 340 398Q348 328 366 270Z" fill={F(id, 'w')} />
        <ellipse cx="256" cy="345" rx="68" ry="58" fill={F(id, 'y')} />
        <path d="M226 326q8 8 16 0M270 326q8 8 16 0M236 356q10 10 20 0q10 10 20 0" stroke="#F59E5B" strokeWidth="4" fill="none" strokeLinecap="round" />
        <g fill={F(id, 'k')}>
          <rect x="214" y="396" width="10" height="30" rx="5" /><rect x="229" y="396" width="10" height="30" rx="5" />
          <rect x="273" y="396" width="10" height="30" rx="5" /><rect x="288" y="396" width="10" height="30" rx="5" />
        </g>
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
