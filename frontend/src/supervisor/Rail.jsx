import { Icon, initials } from '../post/icons.jsx';
import { useUser, atLeast, signOut } from '../auth/user.js';

// Dark icon rail on the left of every supervisor screen. The round button at the bottom is the
// signed-in person: tap → sign out.
export default function Rail({ active }) {
  const user = useUser();
  const item = (key, href, label, icon) => (
    <a className={'sup-rail-btn' + (active === key ? ' sup-rail-on' : '')} href={href} aria-label={label} title={label}>{icon}</a>
  );
  return (
    <nav className="sup-rail">
      {item('posts', '#supervisor', 'Posts', Icon.chat)}
      {item('board', '#board', 'Live board', Icon.grid)}
      {item('schedule', '#schedule', 'Schedule', Icon.calendar)}
      {item('guards', '#master', 'Guard Master', Icon.shield)}
      {atLeast(user, 'branch_admin') && <a className="sup-rail-btn sup-rail-txt" href="#admin" title="Admin: users, branches, agencies">Admin</a>}
      <div className="pd-grow"></div>
      {user && <button className="sup-rail-btn sup-rail-me" title={user.name + ' · ' + user.roleName + ' · tap to sign out'} onClick={() => { if (window.confirm('Sign out ' + user.name + '?')) signOut(); }}>{initials(user.name)}</button>}
    </nav>
  );
}
