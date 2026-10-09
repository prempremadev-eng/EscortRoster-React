import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import Dashboard from './components/Dashboard.jsx';
import './style.css';

// Two pages without a router: the duty sheet, and the dashboard at #dashboard.
// The browser Back button works because each page is a URL hash.
function Root() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return hash === '#dashboard' ? <Dashboard /> : <App />;
}

createRoot(document.getElementById('root')).render(<Root />);
