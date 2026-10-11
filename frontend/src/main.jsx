import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import Dashboard from './components/Dashboard.jsx';
import CardSimulator from './components/CardSimulator.jsx';
import './style.css';

// Pages without a router: the duty sheet, the dashboard at #dashboard, the card simulator at #simulator.
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
  return <App />;
}

createRoot(document.getElementById('root')).render(<Root />);
