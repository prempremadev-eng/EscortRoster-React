import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import Dashboard from './components/Dashboard.jsx';
import CardSimulator from './components/CardSimulator.jsx';
import GuardLinks from './components/GuardLinks.jsx';
import GuardMaster from './components/GuardMaster.jsx';
import PostsPage from './components/PostsPage.jsx';
import DutyHistory from './components/DutyHistory.jsx';
import ShiftReport from './components/ShiftReport.jsx';
import VehiclesPage from './components/VehiclesPage.jsx';
import GuardSetup from './components/GuardSetup.jsx';
import GuardPage from './components/GuardPage.jsx';
import SupervisorInbox from './supervisor/SupervisorInbox.jsx';
import SupervisorBoard from './supervisor/SupervisorBoard.jsx';
import SupervisorSchedule from './supervisor/SupervisorSchedule.jsx';
import AdminPage from './admin/AdminPage.jsx';
import AdminHome from './admin/AdminHome.jsx';
import { SetupHome, ReportsHome } from './components/SetupSteps.jsx';
import { useUser, atLeast } from './auth/user.js';
import RosterPage from './components/RosterPage.jsx';
import Rail from './supervisor/Rail.jsx';
import './post/post.css';
import './supervisor/supervisor.css';
import AuthGate from './auth/AuthGate.jsx';
import SplashHost from './components/Splash.jsx';
import GroupChat from './post/GroupChat.jsx';
import { api } from './api.js';

// The guard's team group ("IPF Schedule", 26 Oct): open with or without duty; ← goes to his duty page.
function GuardGroup({ token }) {
  const groupApi = React.useMemo(() => ({
    load: () => api.groupChat(token),
    send: (text, replyTo) => api.groupSend(token, text, replyTo),
    media: (blob, opts) => api.groupMedia(token, blob, opts)
  }), [token]);
  return <GroupChat api={groupApi} onBack={() => { window.location.hash = '#guard/' + token; }} />;
}
import './style.css';

const GUARD_TOKEN_KEY = 'guard_token';
const isHomeScreenApp = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

// Safety net for the Home Screen app: if it ever opens without the secret link,
// go back to the guard page this phone last used (supervisors use a normal tab, so not affected).
function rememberGuard(hash) {
  const m = hash.match(/^#(?:setup|guard|group)\/([0-9a-f]{32})/);
  try {
    if (m) {
      localStorage.setItem(GUARD_TOKEN_KEY, m[1]);
      // The Home Screen app installed from the setup page opened that page again every time (Prem, 26 Oct:
      // after Back the guard needed a notification to get in). Once notifications are allowed, the
      // icon goes straight to the guard's own page.
      if (hash.startsWith('#setup/') && isHomeScreenApp() && 'Notification' in window && Notification.permission === 'granted') return '#guard/' + m[1];
    } else if (hash === '#group') {
      // A group notification on a guard's phone: his own group page (his link is kept on this phone).
      const token = localStorage.getItem(GUARD_TOKEN_KEY);
      if (token) return '#group/' + token;
    } else if ((!hash || hash === '#') && isHomeScreenApp()) {
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
    // A notification just came in: the open page may refresh its data (see post/PostTimeline.jsx).
    if (e.data && e.data.type === 'push') {
      window.dispatchEvent(new CustomEvent('guard-push', { detail: e.data }));
      return;
    }
    const url = e.data && e.data.type === 'open' && String(e.data.url || '');
    if (!url || !url.startsWith(window.location.origin + '/')) return;
    if (url === window.location.href) window.location.reload();
    else window.location.href = url;
  });
}

// New version deployed while a phone kept the old page open (guards never press reload; on 23 Oct even
// Prem's phone stayed on the old build twice). When the page comes back to the screen, the app asks the
// server which build is current (index.html names its script file) and reloads itself if it changed.
// index.html is a small static file, no Data Store read. Asked at most once a minute.
const myScript = (document.querySelector('script[type="module"][src*="assets/index-"]') || {}).src || '';
let lastCheck = 0;
async function newVersion() {
  if (!myScript || Date.now() - lastCheck < 60000) return false;
  lastCheck = Date.now();
  try {
    const html = await (await fetch('index.html?v=' + Date.now(), { cache: 'no-store' })).text();
    const m = html.match(/assets\/index-[^"']+\.js/);
    return !!m && !myScript.endsWith(m[0]);
  } catch {
    return false; // offline: keep the page as it is
  }
}
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && await newVersion()) window.location.reload();
});

// Pages without a router: the duty sheet, #dashboard, #master, #posts, #chart, #simulator, #links, #admin, #roster, #supervisor, #board, #schedule (supervisor)
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
  // Guard's phone: the secret link is the key, no login.
  if (hash.startsWith('#group/')) return <GuardGroup token={hash.slice('#group/'.length)} />;
  if (hash.startsWith('#setup/')) return <GuardSetup token={hash.slice('#setup/'.length)} />;
  if (hash.startsWith('#guard/')) {
    const [token, query] = hash.slice('#guard/'.length).split('?');
    return <><GuardPage token={token} testDate={new URLSearchParams(query || '').get('date')} /><a className="pd-group-fab" href={'#group/' + token}>👥 Group</a><SplashHost /></>;
  }
  // Everything else: signed in, with a role (auth/AuthGate.jsx). One side menu on every page (Rail),
  // no top bar any more (Prem, 25 Oct).
  return <><AuthGate bar={false}>{page(hash)}</AuthGate><SplashHost /></>;
}

// An older full-width page (Month roster) shown with the supervisor rail, so the supervisor
// moves Roster → Schedule → Live board without the top bar.
function SupFrame({ active, children }) {
  return <div className="pd sup"><Rail active={active} /><main className="sup-page">{children}</main></div>;
}

function page(hash) {
  if (hash === '#dashboard') return <SupFrame active="escort"><Dashboard /></SupFrame>;
  if (hash === '#master') return <SupFrame active="guards"><GuardMaster /></SupFrame>;
  if (hash === '#posts') return <SupFrame active="postsetup"><PostsPage /></SupFrame>;
  // The weekly Duty Chart page is gone (Prem, 22 Oct); an old #chart link opens Duty History.
  // #vehicles/add/<post>: the + of the office chat opens the IN form of that post.
  if (hash === '#vehicles' || hash.startsWith('#vehicles/add/')) return <SupFrame active="vehicles"><VehiclesPage addFor={hash.split('/')[2] || ''} /></SupFrame>;
  if (hash === '#report') return <SupFrame active="report"><ShiftReport /></SupFrame>;
  if (hash === '#history' || hash === '#chart') return <SupFrame active="history"><DutyHistory /></SupFrame>;
  if (hash === '#simulator') return <SupFrame active="simulator"><CardSimulator /></SupFrame>;
  if (hash === '#links') return <SupFrame active="links"><GuardLinks /></SupFrame>;
  if (hash === '#admin') return <SupFrame active="admin"><AdminPage /></SupFrame>;
  if (hash === '#roster' || hash.startsWith('#roster/')) return <SupFrame active="roster"><RosterPage key={hash} initialMonth={hash.split('/')[1] || null} /></SupFrame>;
  // #supervisor/<post> comes from a supervisor notification: opens that post.
  if (hash === '#supervisor' || hash.startsWith('#supervisor/')) return <SupervisorInbox key={hash} initialPost={hash.split('/')[1] || null} />;
  if (hash === '#board') return <SupervisorBoard />;
  if (hash === '#schedule') return <SupervisorSchedule />;
  if (hash === '#reports') return <SupFrame active="reports"><ReportsHome /></SupFrame>;
  if (hash === '#setup') return <SupFrame active="setup"><SetupHome /></SupFrame>;
  if (hash === '#escort') return <SupFrame active="escort"><App /></SupFrame>;
  if (hash === '#home' || hash.startsWith('#home/')) return <SupFrame active="home"><AdminHome hash={hash} /></SupFrame>;
  return <Landing />;
}

// The first page (Prem, 26 Oct): Branch Admin and above → the strength overview; a shift incharge → Posts.
function Landing() {
  const user = useUser();
  if (atLeast(user, 'branch_admin')) return <SupFrame active="home"><AdminHome hash="#home" /></SupFrame>;
  return <SupervisorInbox key="home" initialPost={null} />;
}

createRoot(document.getElementById('root')).render(<Root />);
