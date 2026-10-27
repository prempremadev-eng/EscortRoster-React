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
      <div className="setup-home">
        <p className="setup-home-note">Do these once, in this order. Daily work (roster, schedule …) starts after them.</p>
        {steps.map(s => (
          <a key={s.key} href={s.href} className="setup-card">
            <span className="setup-card-step">{s.step}</span>
            <span className="setup-card-icon">{ICON[s.key]}</span>
            <span className="setup-card-text"><b>{s.label}</b><span>{MORE[s.key]}</span></span>
            <span className="setup-card-go">›</span>
          </a>
        ))}
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
      <div className="setup-home">
        {items.map(([href, icon, label, more]) => (
          <a key={href} href={href} className="setup-card">
            <span className="setup-card-icon">{icon}</span>
            <span className="setup-card-text"><b>{label}</b><span>{more}</span></span>
            <span className="setup-card-go">›</span>
          </a>
        ))}
      </div>
    </>
  );
}
