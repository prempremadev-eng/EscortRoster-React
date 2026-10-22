import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { UserContext, atLeast, signOut } from './user.js';

// Catalyst Web SDK, loaded only for the signed-in pages (guards' phones never need it).
// Order matters: init.js uses what catalystWebSDK.js sets up.
const SDK = ['https://static.zohocdn.com/catalyst/sdk/js/4.6.2/catalystWebSDK.js', '/__catalyst/sdk/init.js'];
let sdkPromise = null;
function loadSdk() {
  if (!sdkPromise) {
    sdkPromise = SDK.reduce((chain, src) => chain.then(() => new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Could not load the login page. Check the internet and reload.'));
      document.head.appendChild(s);
    })), Promise.resolve());
  }
  return sdkPromise;
}

// Right after a page load the SDK can say "not signed in" for a moment; ask a few times.
async function isSignedIn() {
  for (let i = 0; i < 4; i++) {
    try {
      await window.catalyst.auth.isUserAuthenticated();
      return true;
    } catch {
      await new Promise(r => setTimeout(r, 200));
    }
  }
  return false;
}

// Links on the top bar, by role (the server checks the role again on every call). The supervisor's
// steps come first, numbered like the rail (notes/SUPERVISOR-FLOW.md), then the other pages.
function links(user) {
  const l = [['#roster', '1 Month roster'], ['#schedule', '2 Schedule'], ['#board', '3 Live board'], ['#supervisor', '4 Posts'],
    ['#', 'Escort sheet'], ['#master', 'Guards'], ['#posts', 'Post setup'], ['#history', 'Duty history'], ['#links', 'Guard links']];
  if (atLeast(user, 'admin')) l.push(['#simulator', 'Card simulator']);
  if (atLeast(user, 'branch_admin')) l.push(['#admin', 'Admin']);
  return l;
}

// Every page except the guard's own pages sits behind this: login → role → page.
export default function AuthGate({ children, bar = true }) {
  const [step, setStep] = useState('loading');
  const [user, setUser] = useState(null);
  const [error, setError] = useState('');
  const widget = useRef(false);

  async function check() {
    setError('');
    try {
      await loadSdk();
      if (!(await isSignedIn())) return setStep('login');
      const me = (await api.me()).data;
      setUser(me);
      setStep(me.role ? 'ready' : 'norole');
    } catch (err) {
      setError(err.message);
      setStep('error');
    }
  }

  useEffect(() => {
    check();
    const relogin = () => setStep('login');
    window.addEventListener('need-login', relogin);
    return () => window.removeEventListener('need-login', relogin);
  }, []);

  // Embedded Catalyst login inside our own card; after sign-in it comes back to this same page.
  useEffect(() => {
    if (step !== 'login' || widget.current) return;
    widget.current = true;
    loadSdk().then(() => {
      window.catalyst.auth.signIn('login-box', { service_url: window.location.pathname + window.location.hash });
    }).catch(err => { setError(err.message); setStep('error'); });
  }, [step]);

  if (step === 'loading') return <div className="loading-message">Loading...</div>;
  if (step === 'error') {
    return (
      <div className="setup">
        <div className="setup-card bad">❌ {error}</div>
        <button className="btn setup-btn" onClick={() => window.location.reload()}>Reload</button>
      </div>
    );
  }
  if (step === 'login') {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>🛡️ Guard Duty</h1>
          <p className="login-sub">Admins and supervisors sign in here. Guards use their own link.</p>
          <div id="login-box" className="login-box"></div>
        </div>
      </div>
    );
  }
  if (step === 'norole') {
    return (
      <div className="setup">
        <div className="setup-card">
          <div className="setup-hello">Hi {user.name || user.email} 👋</div>
          <p>You are signed in as <b>{user.email}</b>, but this login has no access yet. Ask your admin to add you.</p>
          <button className="btn secondary setup-btn" onClick={signOut}>Sign out</button>
        </div>
      </div>
    );
  }

  return (
    <UserContext.Provider value={user}>
      {bar && (
        <div className="userbar no-print">
          <nav className="userbar-links">
            {links(user).map(([href, label]) => (
              <a key={href} href={href} className={window.location.hash === href || (!window.location.hash && href === '#') ? 'on' : ''}>{label}</a>
            ))}
          </nav>
          <span className="userbar-me" title={user.email}>{user.name} · {user.roleName}</span>
          <button className="userbar-out" onClick={signOut}>Sign out</button>
        </div>
      )}
      {children}
    </UserContext.Provider>
  );
}
