import { useState } from 'react';
import { Icon, Avatar } from '../post/icons.jsx';
import { compressImage } from '../post/media.js';
import { api } from '../api.js';
import { useUser, atLeast, signOut } from '../auth/user.js';
import { setupSteps } from '../components/SetupSteps.jsx';


// The one menu of every signed-in page (Prem, 25 Oct: the top bar plus the rail, 13 buttons in no order,
// confused even him). Three groups in the order of the work:
//   Daily work: Schedule → Today (Live inside) → Chats
//   More:       Escort & Vehicles, Reports, Setup (one screen, #more)
// The round button at the bottom is the signed-in person: tap → sign out.
// On a phone (Prem, 25 Oct: the manager looks on an iPhone) the rail hides behind a ☰ bar at the top,
// so the page gets the whole width; tapping ☰ slides the menu in.
export default function Rail({ active }) {
  const user = useUser();
  const [me, setMe] = useState(false);
  const [open, setOpen] = useState(false);
  // More opens a list of small buttons under it (Prem, 27 Oct: like the old menu); a second tap closes it.
  // Every page draws its own rail, so open / closed is kept in sessionStorage.
  const [moreOpen, setMoreOpen] = useState(() => { try { return sessionStorage.getItem('railMore') === '1'; } catch { return false; } });
  const toggleMore = (e) => {
    const next = !moreOpen;
    setMoreOpen(next);
    try { sessionStorage.setItem('railMore', next ? '1' : ''); } catch { /* private mode */ }
    if (!next) e.preventDefault(); // closing only folds the list, the page stays
  };
  const moreItems = [
    ['escort', '#escort', 'Escort', Icon.escort],
    ['vehicles', '#vehicles', 'Vehicles', Icon.barrier],
    ['report', '#report', 'Report', Icon.report],
    ['history', '#history', 'History', Icon.history],
    ['attendance', '#attendance', 'Attendance', Icon.calendar],
    ['setup', '#setup', 'Setup', Icon.gear]
  ];
  const groups = [
    ['Daily', [
      // What the shift incharge opens every day, in order (Prem, 27 Oct). The month roster lives inside
      // Schedule (its "Month roster" button and step 1), so Schedule is one button. The order shows the
      // flow; the menu shows no numbers (Prem, 27 Oct).
      ['schedule', '#schedule', 'Schedule', Icon.calendar, 1],
      ['home', '#home', 'Today', <svg key="h" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20V10"></path><path d="M10 20V4"></path><path d="M16 20v-7"></path><path d="M22 20H2"></path></svg>, 2],
      ['posts', '#supervisor', 'Chats', Icon.chat, 3]
    ].filter(Boolean)],
    // Escort & Vehicles, Reports and Setup sit behind one More button (Prem, 27 Oct: the menu looked
    // crowded); the More screen lists them in groups.
    ['More', [['more', '#more', 'More', <svg key="m" viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><circle cx="5" cy="12" r="2"></circle><circle cx="12" cy="12" r="2"></circle><circle cx="19" cy="12" r="2"></circle></svg>]]]
  ];
  // Every page behind More (setup pages, reports, escort, vehicles) lights the More button; the small
  // button of that page under More lights too.
  if (active === 'roster') active = 'schedule';
  // Live is opened from the Today page (its green Live button), so the Live board lights Today (Prem, 27 Oct).
  if (active === 'board') active = 'home';
  let sub = setupSteps(user).some(s => s.key === active) ? 'setup' : active === 'reports' ? '' : active;
  if (setupSteps(user).some(s => s.key === active) || ['setup', 'reports', 'report', 'history', 'attendance', 'escort', 'vehicles'].includes(active)) active = 'more';
  else sub = '';
  const here = groups.flatMap(g => g[1]).find(i => i[0] === active);
  const item = ([key, href, label, icon, step]) => key === 'more' ? [
    <a key={key} className={'sup-rail-btn sup-rail-lbl' + (active === key ? ' sup-rail-on' : '')} href={href} aria-label={label} title={label} aria-expanded={moreOpen} onClick={toggleMore}>
      {icon}<span>{label} {moreOpen ? '▴' : '▾'}</span>
    </a>,
    moreOpen && <div key="more-list" className="sup-rail-sublist">
      {moreItems.map(([k, h, l, ic]) => (
        <a key={k} className={'sup-rail-btn sup-rail-lbl sup-rail-sub' + (sub === k ? ' sup-rail-on' : '')} href={h} aria-label={l} title={l} onClick={() => setOpen(false)}>
          {ic}<span>{l}</span>
        </a>
      ))}
    </div>
  ] : (
    <a key={key} className={'sup-rail-btn sup-rail-lbl' + (active === key ? ' sup-rail-on' : '')} href={href} aria-label={label} title={label} onClick={() => setOpen(false)}>
      {icon}<span>{label}</span>
    </a>
  );
  return (
    <>
      <div className="sup-mbar">
        <button className="sup-mbar-btn" onClick={() => setOpen(true)} aria-label="Open the menu">☰</button>
        <span className="sup-mbar-title">{here ? here[2] : ''}</span>
        {user && <span className="sup-mbar-who">{user.name}</span>}
      </div>
      {open && <div className="sup-rail-dim" onClick={() => setOpen(false)}></div>}
      <nav className={'sup-rail' + (open ? ' sup-rail-open' : '')}>
        {groups.map(([head, items]) => [<div key={head} className="sup-rail-head">{head}</div>, ...items.map(item)])}
        <div className="pd-grow"></div>
        {/* 👤 Tap: profile photo or sign out (Prem, 2 Nov). */}
        {user && <Avatar name={user.name} photo={user.photo} className="sup-rail-btn sup-rail-me" title={user.name + ' · ' + user.roleName} onClick={() => setMe(!me)} />}
        {user && me && (
          <div className="sup-me-menu">
            <label className="sup-me-item">📷 Profile photo<input type="file" accept="image/*" hidden onChange={async e => {
              const f = e.target.files[0]; e.target.value = '';
              if (!f) return;
              try { await api.myProfile('', await compressImage(f, 480, 0.8)); window.location.reload(); } catch (err) { window.alert(err.message); }
            }} /></label>
            <button className="sup-me-item" onClick={() => { if (window.confirm('Sign out ' + user.name + '?')) signOut(); }}>🚪 Sign out</button>
          </div>
        )}
        {/* Who is signed in, on every page (Prem, 28 Oct: "IS" alone did not say which login). */}
        {user && <div className="sup-rail-who" title={user.name + ' · ' + user.roleName}><b>{user.name}</b><span>{user.roleName}</span></div>}
      </nav>
    </>
  );
}
