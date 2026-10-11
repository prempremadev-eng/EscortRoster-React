import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import Dashboard from './components/Dashboard.jsx';
import CardSimulator from './components/CardSimulator.jsx';
import GuardLinks from './components/GuardLinks.jsx';
import GuardSetup from './components/GuardSetup.jsx';
import GuardPage from './components/GuardPage.jsx';
import './style.css';

// Pages without a router: the duty sheet, #dashboard, #simulator, #links (supervisor)
// and #setup/<token>, #guard/<token> (guard's phone).
// The browser Back button works because each page is a URL hash.
function Root() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  if (hash === '#dashboard') return <Dashboard />;
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
