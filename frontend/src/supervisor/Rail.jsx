import { useState } from 'react';
import { Icon, initials } from '../post/icons.jsx';
import { useUser, atLeast, signOut } from '../auth/user.js';
import { setupSteps } from '../components/SetupSteps.jsx';


// The one menu of every signed-in page (Prem, 25 Oct: the top bar plus the rail, 13 buttons in no order,
// confused even him). Three groups in the order of the work:
//   Daily work: 1 Roster (once a month) → 2 Schedule → 3 Live board → 4 Posts → 5 Escort → 6 Vehicles
//   Reports:    Shift report, Duty history
//   Setup:      Guards, Post setup, Guard links, Admin (Branch Admin and above), Card simulator (Admin and above)
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
      ['posts', '#supervisor', 'Chats', Icon.chat, 4],
      ['escort', '#escort', 'Escort', Icon.car, 5],
      ['vehicles', '#vehicles', 'Vehicles', Icon.gate, 6]
    ].filter(Boolean)],
    // One Reports button: the Reports screen offers Shift report and Duty history.
    ['Reports', [['reports', '#reports', 'Reports', Icon.clip]]],
    // Setup in its order (S1 Admin → S2 Posts → S3 Guards → S4 Links → S5 Card test), same list as the
    // step strip on those pages (SetupSteps.jsx).
    // One Setup button (Prem, 27 Oct: five setup buttons confused people); the Setup screen lists the steps.
    ['Setup', [['setup', '#setup', 'Setup', Icon.wrench]]]
  ];
  // A setup page (Posts, Guards, Links, Admin, Card test) lights the one Setup button.
  if (setupSteps(user).some(s => s.key === active)) active = 'setup';
  if (active === 'roster') active = 'schedule';
  if (active === 'report' || active === 'history') active = 'reports';
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
