import { Icon } from '../post/icons.jsx';
import { useUser, atLeast } from '../auth/user.js';

// Setup in the order it has to be done (Prem, 27 Oct: "Guards, Post setup, Links … very confusing"):
//   S1 Admin (branch, agency, logins) → S2 Posts → S3 Guards → S4 Links (guard phones) → S5 Card test.
// The same list feeds the side menu, so the menu and this strip always agree. Admin needs Branch Admin,
// Card test needs Admin; the numbers follow what this login can see.
export function setupSteps(user) {
  const steps = [
    atLeast(user, 'branch_admin') && ['admin', '#admin', 'Admin', 'Branch, agency, logins'],
    ['postsetup', '#posts', 'Posts', 'Posts and their shifts'],
    ['guards', '#master', 'Guards', 'Who works for the agency'],
    ['links', '#links', 'Links', 'Each guard’s phone link'],
    atLeast(user, 'admin') && ['simulator', '#simulator', 'Card test', 'Try card IN / OUT']
  ].filter(Boolean);
  return steps.map((s, i) => ({ key: s[0], href: s[1], label: s[2], hint: s[3], step: 'S' + (i + 1) }));
}

export default function SetupSteps({ active }) {
  const steps = setupSteps(useUser());
  const at = steps.findIndex(s => s.key === active);
  return (
    <div className="sc-flow setup-flow no-print">
      <a className="setup-flow-title" href="#setup">⚙️ Setup</a>
      {steps.map((s, i) => [
        i > 0 && <span key={s.key + '-arrow'} className="sc-arrow">→</span>,
        <a key={s.key} href={s.href} className={'sc-step' + (i === at ? ' sc-step-now' : i < at ? ' sc-step-done' : '')} title={s.hint}>
          <b>{s.step}</b>{s.label}
        </a>
      ])}
    </div>
  );
}

// The Setup screen (#setup, Prem 27 Oct: one Setup button in the menu instead of five): the steps as big
// cards in order, so it can be explained in one look.
export function SetupHome() {
  const steps = setupSteps(useUser());
  const ICON = { admin: '🏢', postsetup: '📍', guards: '🛡️', links: '🔗', simulator: '🪪' };
  const MORE = {
    admin: 'States, cities, branches, agencies and who may sign in (roles).',
    postsetup: 'Every post of the branch and the shifts it needs (A, B, C, G).',
    guards: 'ID, card, name and ⭐ shift incharge for each guard of the agency.',
    links: 'One link / QR per guard: opened once on the guard’s phone for notifications.',
    simulator: 'Press IN / OUT like the card machine to test a guard’s page.'
  };
  return (
    <>
      <div className="titlebar"><h1>⚙️ Setup</h1></div>
      <div className="hub-home">
        <p className="hub-note">Do these once, in this order. Daily work (roster, schedule …) starts after them.</p>
        {steps.map(s => (
          <a key={s.key} href={s.href} className="hub-card">
            <span className="hub-card-step">{s.step}</span>
            <span className="hub-card-icon">{ICON[s.key]}</span>
            <span className="hub-card-text"><b>{s.label}</b><span>{MORE[s.key]}</span></span>
            <span className="hub-card-go">›</span>
          </a>
        ))}
        <a href="#relievers" className="hub-card">
          <span className="hub-card-step">QR</span>
          <span className="hub-card-icon">🔁</span>
          <span className="hub-card-text"><b>Relievers</b><span>Relievers at a QR gate (Cumbum): photo, phone, how often they came.</span></span>
          <span className="hub-card-go">›</span>
        </a>
      </div>
    </>
  );
}

// The Reports screen (#reports, Prem 27 Oct: Report and History behind one button).
export function ReportsHome() {
  const items = [
    ['#report', '📋', 'Shift report', 'Each shift: posts, IN, late, absent, leave, off, vacant (to send to the Branch Admin).'],
    ['#history', '📖', 'Duty history', 'Who was at which post on past days; open any shift.']
  ];
  return (
    <>
      <div className="titlebar"><h1>📊 Reports</h1></div>
      <div className="hub-home">
        {items.map(([href, icon, label, more]) => (
          <a key={href} href={href} className="hub-card">
            <span className="hub-card-icon">{icon}</span>
            <span className="hub-card-text"><b>{label}</b><span>{more}</span></span>
            <span className="hub-card-go">›</span>
          </a>
        ))}
      </div>
    </>
  );
}

// The More screen (#more, Prem 27 Oct: "Escort & Vehicles, Reports, Setup in one button, the menu looks
// less crowded"). The menu keeps only the daily four; everything else is one tap away here, in groups.
export function MoreHome() {
  // Line icons on a soft colour tile, one colour per group (Prem, 27 Oct: "design it a bit better").
  const groups = [
    ['Escort & Vehicles', [
      ['#escort', Icon.escort, 'Escort', 'The escort duty sheet: trips, seats, who is on escort today.'],
      ['#vehicles', Icon.barrier, 'Vehicles', 'Vehicle IN / OUT at the gates: scan, mark OUT, list of today.']
    ]],
    ['Reports', [
      ['#report', Icon.report, 'Shift report', 'Each shift: posts, IN, late, absent, leave, off, vacant (to send to the Branch Admin).'],
      ['#history', Icon.history, 'Duty history', 'Who was at which post on past days; open any shift.']
    ]],
    ['Setup', [
      ['#setup', Icon.gear, 'Setup', 'Admin, posts, guards, guard links, card test: done once, in order.']
    ]]
  ];
  return (
    <>
      <div className="titlebar"><h1>☰ More</h1></div>
      <div className="hub-home">
        {groups.map(([head, items], g) => [
          <h2 key={head} className="hub-head">{head}</h2>,
          ...items.map(([href, icon, label, more]) => (
            <a key={href} href={href} className="hub-card">
              <span className={'hub-tile hub-tile-' + g}>{icon}</span>
              <span className="hub-card-text"><b>{label}</b><span>{more}</span></span>
              <span className="hub-card-go">›</span>
            </a>
          ))
        ])}
      </div>
    </>
  );
}
