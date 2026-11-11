import { useEffect, useState } from 'react';
import { api } from '../api.js';

// 📅 My attendance on the guard's phone (Prem, 5 Nov): his own month as a calendar, big and simple.
// Green = present (shift letter), red = absent, yellow = leave, grey = week off. Tap a day for IN / OUT.
// #myatt/<token>; server: attendance.js /myAttendance (same numbers as the office Month view).
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const thisMonth = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 7);
const shiftMonth = (m, n) => { const d = new Date(m + '-01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7); };
const nice = m => new Date(m + '-01T00:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
const hm = mins => Math.floor(mins / 60) + 'h ' + String(mins % 60).padStart(2, '0') + 'm';
const WORD = { P: 'Present', AB: 'Absent', L: 'Leave', WO: 'Week off' };

export default function MyAttendance({ token }) {
  const [month, setMonth] = useState(thisMonth);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [day, setDay] = useState(null);

  useEffect(() => {
    setData(null); setError(''); setDay(null);
    api.myAttendance(token, month).then(r => setData(r.data)).catch(err => setError(err.message));
  }, [token, month]);

  const me = data && data.rows[0];
  const first = new Date(month + '-01T00:00:00Z').getUTCDay();
  const pc = me && day ? me.cells[day - 1] : null;

  return (
    <div className="ma">
      <div className="ma-head">
        <a className="sr-back" href={'#guard/' + token} aria-label="Back">←</a>
        <div>
          <div className="ma-title">📅 My attendance</div>
          {me && <div className="ma-sub">{me.name}{me.team ? ' · ' + me.team : ''}</div>}
        </div>
      </div>

      <div className="ma-body">
        <div className="ma-month">
          <button onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Month before">‹</button>
          <b>{nice(month)}</b>
          <button onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= thisMonth()} aria-label="Next month">›</button>
        </div>

        {error && <div className="trip-error">{error}</div>}
        {!data && !error && <div className="sr-muted">Loading…</div>}
        {data && !me && <div className="sr-muted">No attendance this month.</div>}

        {me && (
          <>
            <div className="ma-tiles">
              <div className="ma-tile ma-t-p"><b>{me.tot.P}</b><small>Present</small></div>
              <div className="ma-tile ma-t-ab"><b>{me.tot.AB}</b><small>Absent</small></div>
              <div className="ma-tile ma-t-l"><b>{me.tot.L}</b><small>Leave</small></div>
              <div className="ma-tile ma-t-wo"><b>{me.tot.WO}</b><small>Week off</small></div>
            </div>
            <div className="ma-hours">⏱️ Work hours this month: <b>{me.tot.hours}</b></div>

            <div className="ma-cal">
              {WD.map(w => <div key={w} className="ma-wd">{w}</div>)}
              {Array.from({ length: first }, (_, i) => <div key={'e' + i} />)}
              {me.cells.map((c, i) => (
                <button key={i} className={'ma-day ma-' + (c.s || 'none') + (c.s === 'P' && !c.out ? ' ma-noout' : '') + (data.today === month + '-' + String(i + 1).padStart(2, '0') ? ' ma-today' : '') + (day === i + 1 ? ' on' : '')}
                  onClick={() => setDay(i + 1)} disabled={!c.s}>
                  <span>{i + 1}</span>
                  <b>{c.s === 'P' ? (c.sw ? '🔄' : '') + (c.late ? '⏰' : '') + c.c : c.s}</b>
                </button>
              ))}
            </div>

            {pc && (
              <div className={'ma-detail ma-' + pc.s}>
                <b>{day} {nice(month).split(' ')[0]} · {WORD[pc.s] || 'No duty'}</b>
                {pc.s === 'P' && <span>Shift {pc.c}{pc.post ? ' · ' + pc.post : ''}<br />IN <b>{pc.in}</b> · OUT <b>{pc.out || '— (no OUT)'}</b>{pc.h ? ' · ' + hm(pc.h) : ''}{pc.late ? <><br />⏰ {pc.late} min late</> : null}{pc.sw ? <><br />{pc.sw}</> : null}</span>}
                {pc.s === 'AB' && <span>Shift {pc.c}{pc.post ? ' · ' + pc.post : ''} · no IN that day</span>}
              </div>
            )}

            <div className="ma-legend">
              <span><i className="ma-dot ma-P" />Present</span><span><i className="ma-dot ma-P ma-noout" />No OUT</span>
              <span>🔄 Shift swap</span><span>⏰ Late</span><span><i className="ma-dot ma-AB" />Absent</span><span><i className="ma-dot ma-L" />Leave</span><span><i className="ma-dot ma-WO" />Week off</span>
            </div>
            <div className="sr-muted">Something wrong? Tell your supervisor.</div>
          </>
        )}
      </div>
    </div>
  );
}
