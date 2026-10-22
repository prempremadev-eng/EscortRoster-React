import { useState } from 'react';
import { Icon } from '../post/icons.jsx';
import '../post/post.css';

// Escort guard after card IN, in the same look as the post guard's screens (src/post/PostDuty.jsx):
//   Screen 1 "Your seat" → Next → Screen 2 the escort duty rules → Start duty → the escort sheet.
// Start is remembered on this phone for that IN only (no server write): a reload goes straight to the
// sheet, but after a card OUT and a new IN the screens come again with the new IN time.
const RULES = [
  ['🚗', 'Wear your seat belt on every trip, the whole time.'],
  ['🪪', 'Keep your ID card visible. Sit in the front seat next to the driver.'],
  ['📝', 'Before each trip check the cab number and the driver, and write them in your trip.'],
  ['🏠', 'Drop each employee at their gate and wait until they are safely inside.'],
  ['⏱️', 'Write Out and In time as soon as each trip ends. Any problem on the road: call your supervisor at once.']
];

const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
const keyOf = (token, date, inAt) => 'esc-start-' + token + '-' + date + '-' + (inAt || '');
export const escortStarted = (token, date, inAt) => { try { return !!localStorage.getItem(keyOf(token, date, inAt)); } catch { return false; } };

export default function EscortIntro({ token, data, seat, onStart }) {
  const [view, setView] = useState('seat');
  const shift = data.shift || {};
  const list = (data.postName || '').replace(/^Escort · /, '');
  const start = () => {
    try { localStorage.setItem(keyOf(token, data.dutyDate, data.lastIn || data.inTime), new Date().toTimeString().slice(0, 5)); } catch { /* private window: show the sheet anyway */ }
    onStart();
  };

  if (view === 'seat') {
    return (
      <div className="pd pd-page">
        <div className="pd-top">
          <div className="pd-brand">Escort duty</div>
          <div className="pd-muted">{data.dutyDate.split('-').reverse().join('-')}</div>
        </div>
        <div className="pd-notice">
          {Icon.bell}
          <div>
            <div className="pd-notice-sub">Card IN · {data.lastIn || data.inTime}</div>
            <div className="pd-notice-main">Your escort seat for today is ready</div>
          </div>
        </div>
        <div className="pd-muted">{greeting()}, <span className="guard-name">{data.name}</span></div>
        <div className="pd-card pd-post">
          <div className="pd-label">YOUR SEAT</div>
          <div className="pd-post-name">S.No {seat}</div>
          <div className="pd-tiles">
            <div className="pd-tile"><div className="pd-tile-k">List</div><div className="pd-tile-v">{list || 'Escort'}</div></div>
            <div className="pd-tile"><div className="pd-tile-k">Shift</div><div className="pd-tile-v">{shift.code ? shift.code + ' · ' + shift.start + ' – ' + shift.end : 'C'}</div></div>
          </div>
        </div>
        <div className="pd-grow"></div>
        <button className="pd-btn pd-btn-primary" onClick={() => setView('rules')}>Next</button>
      </div>
    );
  }

  return (
    <div className="pd pd-page">
      <div className="pd-head-row">
        <div>
          <div className="pd-title">Escort duty · S.No {seat}</div>
          <div className="pd-muted pd-small">{list}{shift.code ? ' · Shift ' + shift.code : ''}</div>
        </div>
        <div className="pd-pill pd-neutral">Not started</div>
      </div>
      <div className="pd-card">
        <div className="pd-label">BEFORE YOU START</div>
        {RULES.map(([icon, text], i) => (
          <div key={i} className="esc-rule"><span className="esc-rule-no">{i + 1}</span><span className="esc-rule-icon">{icon}</span><span>{text}</span></div>
        ))}
      </div>
      <div className="pd-grow"></div>
      <div className="pd-muted pd-small pd-center">Press after you have read all 5 points</div>
      <button className="pd-btn pd-btn-primary" onClick={start}>Start duty</button>
      <button className="pd-btn pd-btn-outline" onClick={() => setView('seat')}>Back</button>
    </div>
  );
}
