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
      <span className="setup-flow-title">Setup</span>
      {steps.map((s, i) => [
        i > 0 && <span key={s.key + '-arrow'} className="sc-arrow">→</span>,
        <a key={s.key} href={s.href} className={'sc-step' + (i === at ? ' sc-step-now' : i < at ? ' sc-step-done' : '')} title={s.hint}>
          <b>{s.step}</b>{s.label}
        </a>
      ])}
    </div>
  );
}
