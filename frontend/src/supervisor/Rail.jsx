import { Icon, initials } from '../post/icons.jsx';
import { useUser, atLeast, signOut } from '../auth/user.js';

// The one menu of every signed-in page (Prem, 25 Oct: the top bar plus the rail, 13 buttons in no order,
// confused even him). Three groups in the order of the work:
//   Daily work: 1 Roster (once a month) → 2 Schedule → 3 Live board → 4 Posts → 5 Escort → 6 Vehicles
//   Reports:    Shift report, Duty history
//   Setup:      Guards, Post setup, Guard links, Admin (Branch Admin and above), Card simulator (Admin and above)
// The round button at the bottom is the signed-in person: tap → sign out.
export default function Rail({ active }) {
  const user = useUser();
  const item = (key, href, label, icon, step) => (
    <a key={key} className={'sup-rail-btn sup-rail-lbl' + (active === key ? ' sup-rail-on' : '')} href={href} aria-label={label} title={label}>
      {icon}<span>{step ? step + ' ' : ''}{label}</span>
    </a>
  );
  const head = text => <div className="sup-rail-head">{text}</div>;
  return (
    <nav className="sup-rail">
      {head('Daily')}
      {item('roster', '#roster', 'Roster', Icon.history, 1)}
      {item('schedule', '#schedule', 'Schedule', Icon.calendar, 2)}
      {item('board', '#board', 'Live', Icon.grid, 3)}
      {item('posts', '#supervisor', 'Posts', Icon.chat, 4)}
      {item('escort', '#', 'Escort', Icon.car, 5)}
      {item('vehicles', '#vehicles', 'Vehicles', Icon.gate, 6)}
      {head('Reports')}
      {item('report', '#report', 'Report', Icon.clip)}
      {item('history', '#history', 'History', Icon.check)}
      {head('Setup')}
      {item('guards', '#master', 'Guards', Icon.shield)}
      {item('postsetup', '#posts', 'Post setup', Icon.pin)}
      {item('links', '#links', 'Links', Icon.send)}
      {atLeast(user, 'branch_admin') && item('admin', '#admin', 'Admin', Icon.wrench)}
      {atLeast(user, 'admin') && item('simulator', '#simulator', 'Card test', Icon.bell)}
      <div className="pd-grow"></div>
      {user && <button className="sup-rail-btn sup-rail-me" title={user.name + ' · ' + user.roleName + ' · tap to sign out'} onClick={() => { if (window.confirm('Sign out ' + user.name + '?')) signOut(); }}>{initials(user.name)}</button>}
    </nav>
  );
}
