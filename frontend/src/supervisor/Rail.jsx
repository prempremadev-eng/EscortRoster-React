import { Icon, initials } from '../post/icons.jsx';
import { useUser, atLeast, signOut } from '../auth/user.js';

// Dark icon rail on the left of every supervisor screen, in the order of the supervisor's work:
// 1 Month roster (once a month) → 2 Schedule (every day) → 3 Live board → 4 Posts (messages).
// The round button at the bottom is the signed-in person: tap → sign out.
export default function Rail({ active }) {
  const user = useUser();
  const item = (key, href, label, icon, step) => (
    <a className={'sup-rail-btn sup-rail-lbl' + (active === key ? ' sup-rail-on' : '')} href={href} aria-label={label} title={label}>
      {icon}<span>{step ? step + ' ' : ''}{label}</span>
    </a>
  );
  return (
    <nav className="sup-rail">
      {item('roster', '#roster', 'Roster', Icon.history, 1)}
      {item('schedule', '#schedule', 'Schedule', Icon.calendar, 2)}
      {item('board', '#board', 'Live', Icon.grid, 3)}
      {item('posts', '#supervisor', 'Posts', Icon.chat, 4)}
      <div className="sup-rail-gap"></div>
      {item('guards', '#master', 'Guards', Icon.shield)}
      {atLeast(user, 'branch_admin') && item('admin', '#admin', 'Admin', Icon.wrench)}
      <div className="pd-grow"></div>
      {user && <button className="sup-rail-btn sup-rail-me" title={user.name + ' · ' + user.roleName + ' · tap to sign out'} onClick={() => { if (window.confirm('Sign out ' + user.name + '?')) signOut(); }}>{initials(user.name)}</button>}
    </nav>
  );
}
