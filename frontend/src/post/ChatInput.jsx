import { useEffect, useRef } from 'react';

// ✍️ The message box (Prem, 3 Nov: "Dear sir," + Enter sent the message). On a phone Enter makes a new line,
// like WhatsApp, and ➤ sends; on a computer Enter sends and Shift+Enter makes a new line. Grows to 5 lines.
const fineMouse = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: fine)').matches;

export default function ChatInput({ id, value, onChange, placeholder, maxLength = 255 }) {
  const ref = useRef(null);
  useEffect(() => {
    const t = ref.current;
    if (!t) return;
    t.style.height = 'auto';
    t.style.height = Math.min(t.scrollHeight, 5 * 22 + 12) + 'px';
  }, [value]);
  return (
    <textarea ref={ref} id={id} rows={1} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      maxLength={maxLength} autoComplete="off" className="pd-textarea"
      onKeyDown={e => {
        if (e.key === 'Enter' && !e.shiftKey && fineMouse()) { e.preventDefault(); if (e.currentTarget.form) e.currentTarget.form.requestSubmit(); }
      }} />
  );
}
