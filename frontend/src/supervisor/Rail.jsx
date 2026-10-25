import { useState } from 'react';
import { Icon, initials } from '../post/icons.jsx';
import { useUser, atLeast, signOut } from '../auth/user.js';

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
      ['roster', '#roster', 'Roster', Icon.history, 1],
      ['schedule', '#schedule', 'Schedule', Icon.calendar, 2],
      ['board', '#board', 'Live', Icon.grid, 3],
      ['posts', '#supervisor', 'Posts', Icon.chat, 4],
      ['escort', '#', 'Escort', Icon.car, 5],
      ['vehicles', '#vehicles', 'Vehicles', Icon.gate, 6]
    ]],
    ['Reports', [
      ['report', '#report', 'Report', Icon.clip],
      ['history', '#history', 'History', Icon.check]
    ]],
    ['Setup', [
      ['guards', '#master', 'Guards', Icon.shield],
      ['postsetup', '#posts', 'Post setup', Icon.pin],
      ['links', '#links', 'Links', Icon.send],
      atLeast(user, 'branch_admin') && ['admin', '#admin', 'Admin', Icon.wrench],
      atLeast(user, 'admin') && ['simulator', '#simulator', 'Card test', Icon.bell]
    ].filter(Boolean)]
  ];
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
