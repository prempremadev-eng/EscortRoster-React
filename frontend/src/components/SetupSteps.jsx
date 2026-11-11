import { useEffect } from 'react';
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
    atLeast(user, 'admin') && ['simulator', '#simulator', 'Card test', 'Try card IN / OUT'],
    ['relievers', '#relievers', 'Relievers', 'QR gate relievers: photo, phone, visits']
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

// #setup (Prem, 11 Nov: the Setup list and the strip showed the same steps twice): open the first step; the
// strip on every setup page is the one menu.
export function SetupHome() {
  const steps = setupSteps(useUser());
  const first = steps.length ? steps[0].href : "";
  useEffect(() => { if (first) window.location.replace(first); }, [first]);
  return null;
}

// The Reports screen (#reports, Prem 27 Oct: Report and History behind one button).
export function ReportsHome() {
  const items = [
    ['#report', '📋', 'Shift report', 'Each shift: posts, IN, late, absent, leave, off, vacant (to send to the Branch Admin).'],
    ['#history', '📖', 'Duty history', 'Who was at which post on past days; open any shift.'],
    ['#sitereports', '📝', 'Site reports', 'Parking / strength reports and ERT incidents sent by the guards.'],
    ['#auditlog', '🕘', 'Change log', 'Who changed what in the app, and when.']
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
      ['#auditlog', Icon.history, 'History log', 'Who changed what and when: publish, roster, posts, guards, logins (Admin + Branch Admin).'],
      ['#sitereports', Icon.report, 'Site reports', 'Parking and employee strength counts from the posts (11 · 15 · 23 · 03), history and Excel.'],
      ['#report', Icon.report, 'Shift report', 'Each shift: posts, IN, late, absent, leave, off, vacant (to send to the Branch Admin).'],
      ['#history', Icon.history, 'Duty history', 'Who was at which post on past days; open any shift.'],
      ['#attendance', Icon.calendar, 'Attendances', 'Every guard, every day: Present / Absent, entry and exit time. Export to Excel.']
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
