import { useRef } from 'react';

// Controlled text field that saves only when the value is "committed"
// (blur or Enter) — same moment the old app's `change` event fired.
export default function Field({ value, onChange, onCommit, textarea, filter, ...rest }) {
  const startValue = useRef(value);
  const Tag = textarea ? 'textarea' : 'input';

  function commit() {
    if (value !== startValue.current) {
      startValue.current = value;
      onCommit && onCommit(value);
    }
  }

  return (
    <Tag
      type={textarea ? undefined : 'text'}
      {...rest}
      value={value || ''}
      onFocus={() => { startValue.current = value; }}
      onChange={e => onChange(filter ? filter(e.target.value) : e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (!textarea && e.key === 'Enter') e.currentTarget.blur(); }}
    />
  );
}
