import { useState } from 'react';
import { Icon, initials } from '../post/icons.jsx';
import { useUser, atLeast, signOut } from '../auth/user.js';
import { setupSteps } from '../components/SetupSteps.jsx';


// The one menu of every signed-in page (Prem, 25 Oct: the top bar plus the rail, 13 buttons in no order,
// confused even him). Three groups in the order of the work:
//   Daily work: 1 Schedule → 2 Live → 3 Today → 4 Chats
//   More:       Escort & Vehicles, Reports, Setup (one screen, #more)
// The round button at the bottom is the signed-in person: tap → sign out.
// On a phone (Prem, 25 Oct: the manager looks on an iPhone) the rail hides behind a ☰ bar at the top,
// so the page gets the whole width; tapping ☰ slides the menu in.
export default function Rail({ active }) {
  const user = useUser();
  const [open, setOpen] = useState(false);
  const groups = [
    ['Daily', [
      // What the shift incharge opens every day, in order (Prem, 27 Oct). The month roster lives inside
      // Schedule (its "Month roster" button and step 1), so Schedule is one button.
      ['schedule', '#schedule', 'Schedule', Icon.calendar, 1],
      ['board', '#board', 'Live', Icon.grid, 2],
      ['home', '#home', 'Today', <svg key="h" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20V10"></path><path d="M10 20V4"></path><path d="M16 20v-7"></path><path d="M22 20H2"></path></svg>, 3],
      ['posts', '#supervisor', 'Chats', Icon.chat, 4]
    ].filter(Boolean)],
    // Escort & Vehicles, Reports and Setup sit behind one More button (Prem, 27 Oct: the menu looked
    // crowded); the More screen lists them in groups.
    ['More', [['more', '#more', 'More', <svg key="m" viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><circle cx="5" cy="12" r="2"></circle><circle cx="12" cy="12" r="2"></circle><circle cx="19" cy="12" r="2"></circle></svg>]]]
  ];
  // Every page behind More (setup pages, reports, escort, vehicles) lights the More button.
  if (active === 'roster') active = 'schedule';
  if (setupSteps(user).some(s => s.key === active) || ['setup', 'reports', 'report', 'history', 'gate', 'escort', 'vehicles'].includes(active)) active = 'more';
  const here = groups.flatMap(g => g[1]).find(i => i[0] === active);
  const item = ([key, href, label, icon, step]) => (
    <a key={key} className={'sup-rail-btn sup-rail-lbl' + (active === key ? ' sup-rail-on' : '')} href={href} aria-label={label} title={label} onClick={() => setOpen(false)}>
      {icon}<span>{step ? step + ' ' : ''}{label}</span>
    </a>
  );
  return (
    <>
      <div className="sup-mbar">
        <button className="sup-mbar-btn" onClick={() => setOpen(true)} aria-label="Open the menu">☰</button>
        <span className="sup-mbar-title">{here ? here[2] : ''}</span>
      </div>
      {open && <div className="sup-rail-dim" onClick={() => setOpen(false)}></div>}
      <nav className={'sup-rail' + (open ? ' sup-rail-open' : '')}>
        {groups.map(([head, items]) => [<div key={head} className="sup-rail-head">{head}</div>, ...items.map(item)])}
        <div className="pd-grow"></div>
        {user && <button className="sup-rail-btn sup-rail-me" title={user.name + ' · ' + user.roleName + ' · tap to sign out'} onClick={() => { if (window.confirm('Sign out ' + user.name + '?')) signOut(); }}>{initials(user.name)}</button>}
      </nav>
    </>
  );
}
