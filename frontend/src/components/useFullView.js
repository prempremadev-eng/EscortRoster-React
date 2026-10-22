import { useState } from 'react';

// ▴ / ▾ like the Schedule page: hide the title, buttons and filters so the table gets the whole
// screen. Remembered per page in this browser.
export default function useFullView(key) {
  const [full, setFull] = useState(() => { try { return localStorage.getItem(key) === 'on'; } catch { return false; } });
  const toggle = () => setFull(v => { try { localStorage.setItem(key, v ? 'off' : 'on'); } catch { /* private window */ } return !v; });
  return [full, toggle];
}
