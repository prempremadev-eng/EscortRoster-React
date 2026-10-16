import { Icon, initials } from '../post/icons.jsx';

// Dark icon rail on the left of every supervisor screen.
export default function Rail({ active, name, onChangeName }) {
  const item = (key, href, label, icon) => (
    <a className={'sup-rail-btn' + (active === key ? ' sup-rail-on' : '')} href={href} aria-label={label} title={label}>{icon}</a>
  );
  return (
    <nav className="sup-rail">
      {item('posts', '#supervisor', 'Posts', Icon.chat)}
      {item('board', '#board', 'Live board', Icon.grid)}
      {item('schedule', '#schedule', 'Schedule', Icon.calendar)}
      {item('guards', '#master', 'Guard Master', Icon.shield)}
      <div className="pd-grow"></div>
      {name && <button className="sup-rail-btn sup-rail-me" title={'Signed as ' + name + ' · change'} onClick={onChangeName}>{initials(name)}</button>}
    </nav>
  );
}
