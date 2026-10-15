import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import Dashboard from './components/Dashboard.jsx';
import CardSimulator from './components/CardSimulator.jsx';
import GuardLinks from './components/GuardLinks.jsx';
import GuardMaster from './components/GuardMaster.jsx';
import GuardSetup from './components/GuardSetup.jsx';
import GuardPage from './components/GuardPage.jsx';
import './style.css';

const GUARD_TOKEN_KEY = 'guard_token';
const isHomeScreenApp = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

// Safety net for the Home Screen app: if it ever opens without the secret link,
// go back to the guard page this phone last used (supervisors use a normal tab, so not affected).
function rememberGuard(hash) {
  const m = hash.match(/^#(?:setup|guard)\/([0-9a-f]{32})/);
  try {
    if (m) localStorage.setItem(GUARD_TOKEN_KEY, m[1]);
    else if (!hash && isHomeScreenApp()) {
      const token = localStorage.getItem(GUARD_TOKEN_KEY);
      if (token) return '#guard/' + token;
    }
  } catch {
    // Storage blocked (private mode): the link in the address still works.
  }
  return null;
}

// A tapped notification asks an already open tab to go to its page (see public/sw.js).
// Same page again → reload, so the guard sees fresh data.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', e => {
    const url = e.data && e.data.type === 'open' && String(e.data.url || '');
    if (!url || !url.startsWith(window.location.origin + '/')) return;
    if (url === window.location.href) window.location.reload();
    else window.location.href = url;
  });
}

// Pages without a router: the duty sheet, #dashboard, #master, #simulator, #links (supervisor)
// and #setup/<token>, #guard/<token> (guard's phone).
// The browser Back button works because each page is a URL hash.
function Root() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const jump = rememberGuard(window.location.hash);
    if (jump) window.location.hash = jump;
  }, [hash]);
  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  if (hash === '#dashboard') return <Dashboard />;
  if (hash === '#master') return <GuardMaster />;
  if (hash === '#simulator') return <CardSimulator />;
  if (hash === '#links') return <GuardLinks />;
  if (hash.startsWith('#setup/')) return <GuardSetup token={hash.slice('#setup/'.length)} />;
  if (hash.startsWith('#guard/')) {
    const [token, query] = hash.slice('#guard/'.length).split('?');
    return <GuardPage token={token} testDate={new URLSearchParams(query || '').get('date')} />;
  }
  return <App />;
}

createRoot(document.getElementById('root')).render(<Root />);
