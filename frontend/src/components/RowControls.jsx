// Row controls shared by the admin-style tables (admin/AdminPage.jsx, components/PostsPage.jsx).

// On / Off switch for a row (tap to flip). `disabled` = shown but cannot be changed.
export function Toggle({ on, onChange, disabled, label }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} title={disabled ? '' : on ? 'Tap to switch off' : 'Tap to switch on'}
      className={'adm-toggle' + (on ? ' adm-on' : '')} onClick={onChange} disabled={disabled}>
      <span className="adm-knob"></span>{on ? 'On' : 'Off'}
    </button>
  );
}
// Small icon button (edit, mail).
export const IconBtn = ({ icon, label, onClick, disabled }) => (
  <button type="button" className="adm-icon" title={label} aria-label={label} onClick={onClick} disabled={disabled}>{icon}</button>
);
