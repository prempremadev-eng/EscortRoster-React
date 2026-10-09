import { Fragment, useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { routeFromDb, stopFromDb, isTripComplete, todayStr } from '../utils.js';

const RANGES = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' }
];

function toStr(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// Day → that day; Week → Monday to Sunday around it; Month → 1st to last day.
function rangeFor(kind, anchor) {
  const d = new Date(anchor + 'T00:00:00');
  if (kind === 'week') {
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return [toStr(monday), toStr(sunday)];
  }
  if (kind === 'month') {
    return [toStr(new Date(d.getFullYear(), d.getMonth(), 1)), toStr(new Date(d.getFullYear(), d.getMonth() + 1, 0))];
  }
  return [anchor, anchor];
}

const shortDate = s => new Date(s + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

// Turns raw rows into what the page shows: one entry per trip + totals + per-guard counts.
function summarize({ escorts, trips, stops }) {
  const names = {};
  escorts.forEach(e => { names[String(e.ROWID)] = e.escort_name || '(no name)'; });

  const stopsByTrip = {};
  stops.forEach(s => {
    (stopsByTrip[String(s.duty_record_id)] = stopsByTrip[String(s.duty_record_id)] || []).push(stopFromDb(s));
  });

  const rows = trips.map(t => {
    const rec = routeFromDb(t);
    const tripStops = stopsByTrip[String(t.ROWID)] || [];
    const isOther = t.is_extra === 'true' || t.is_sunday_pickup === 'true';
    const guard = isOther ? (t.extra_name || '(extra)') : (names[String(t.escort_id)] || '(removed escort)');
    const complete = isTripComplete(rec, tripStops);
    return {
      id: String(t.ROWID),
      date: t.duty_date,
      guard,
      rec,
      stops: tripStops,
      drop: tripStops.filter(s => s.type === 'Drop').length,
      pickup: tripStops.filter(s => s.type === 'Pickup').length,
      complete,
      pending: !complete && !!rec.in
    };
  });
  rows.sort((a, b) => (a.date + a.rec.out).localeCompare(b.date + b.rec.out));

  const guardMap = {};
  rows.forEach(r => {
    const g = guardMap[r.guard] = guardMap[r.guard] || { guard: r.guard, trips: 0, drop: 0, pickup: 0, pending: 0 };
    g.trips++;
    g.drop += r.drop;
    g.pickup += r.pickup;
    if (r.pending) g.pending++;
  });
  const guards = Object.values(guardMap).sort((a, b) => b.trips - a.trips || a.guard.localeCompare(b.guard));

  const totals = {
    trips: rows.length,
    drop: rows.reduce((n, r) => n + r.drop, 0),
    pickup: rows.reduce((n, r) => n + r.pickup, 0),
    pending: rows.filter(r => r.pending).length
  };
  return { rows, guards, totals };
}

export default function Dashboard() {
  const [kind, setKind] = useState('day');
  const [anchor, setAnchor] = useState(todayStr());
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading');
  const [open, setOpen] = useState(null);

  const [from, to] = rangeFor(kind, anchor);

  // No auto-refresh here on purpose: every load costs Data Store reads. Use 🔄 instead.
  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const result = await api.getDashboard(from, to);
      setData(summarize(result.data));
      setStatus('ok');
    } catch (err) {
      console.error('Dashboard load failed:', err);
      setStatus('error');
    }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const multiDay = from !== to;

  return (
    <>
      <div className="titlebar">
        <h1>📊 Escort Dashboard</h1>
      </div>

      <div className="toolbar no-print">
        <a className="btn secondary" href="#">← Duty Sheet</a>
        <div className="dash-ranges">
          {RANGES.map(r => (
            <button key={r.key} className={'btn' + (kind === r.key ? '' : ' secondary')} onClick={() => setKind(r.key)}>{r.label}</button>
          ))}
        </div>
        <div>
          <label htmlFor="dashDate">Date:</label>
          <input type="date" id="dashDate" value={anchor} onChange={e => e.target.value && setAnchor(e.target.value)} />
        </div>
        <div className="spacer"></div>
        <button className="btn" onClick={load}>🔄 Refresh</button>
      </div>

      <div className="dash">
        <div className="dash-range-label">{multiDay ? shortDate(from) + ' – ' + shortDate(to) : shortDate(from)}</div>

        {status === 'loading' && <div className="loading-message">Loading...</div>}
        {status === 'error' && <div className="loading-message">Could not load the dashboard. Check your connection and press Refresh.</div>}

        {status === 'ok' && data && (
          <>
            <div className="dash-cards">
              <Card icon="🚕" label="Trips" value={data.totals.trips} />
              <Card icon="⬇️" label="Drop" value={data.totals.drop} />
              <Card icon="⬆️" label="Pickup" value={data.totals.pickup} />
              <Card icon="🔴" label="Pending" value={data.totals.pending} warn={data.totals.pending > 0} />
            </div>

            <h2 className="dash-h2">Guard wise</h2>
            {data.guards.length === 0 ? (
              <div className="dash-empty">No trips in this period.</div>
            ) : (
              <div className="dash-scroll">
                <table className="dash-table">
                  <thead>
                    <tr><th>Guard</th><th>Trips</th><th>Drop</th><th>Pickup</th><th>Total employees</th><th>Pending</th></tr>
                  </thead>
                  <tbody>
                    {data.guards.map(g => (
                      <tr key={g.guard}>
                        <td className="left">{g.guard}</td>
                        <td>{g.trips}</td>
                        <td>{g.drop}</td>
                        <td>{g.pickup}</td>
                        <td><b>{g.drop + g.pickup}</b></td>
                        <td className={g.pending ? 'dash-bad' : ''}>{g.pending || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <h2 className="dash-h2">Trip details</h2>
            {data.rows.length === 0 ? (
              <div className="dash-empty">No trips in this period.</div>
            ) : (
              <div className="dash-scroll">
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      {multiDay && <th>Date</th>}
                      <th>Guard</th><th>Location</th><th>Out</th><th>In</th>
                      <th>Vehicle</th><th>Driver</th><th>Emp</th><th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r, i) => (
                      <Fragment key={r.id}>
                        <tr className="dash-trip" onClick={() => setOpen(open === r.id ? null : r.id)}>
                          <td>{open === r.id ? '▾' : '▸'} {i + 1}</td>
                          {multiDay && <td>{shortDate(r.date)}</td>}
                          <td className="left">{r.guard}</td>
                          <td className="left">{r.rec.loc}</td>
                          <td>{r.rec.out}</td>
                          <td>{r.rec.in}</td>
                          <td>{r.rec.vehicle}</td>
                          <td className="left">{r.rec.driver}</td>
                          <td>{r.stops.length}</td>
                          <td>{r.complete ? '🟢' : r.pending ? '🔴' : '🔵'}</td>
                        </tr>
                        {open === r.id && (
                          <tr className="dash-stops-row">
                            <td colSpan={multiDay ? 10 : 9}>
                              {r.stops.length === 0 ? (
                                <span className="dash-empty">No employees entered.</span>
                              ) : (
                                <table className="dash-stops">
                                  <thead><tr><th>Emp ID</th><th>Location</th><th>Type</th><th>Time</th></tr></thead>
                                  <tbody>
                                    {r.stops.map(s => (
                                      <tr key={s.ROWID}><td>{s.emp}</td><td className="left">{s.loc}</td><td>{s.type}</td><td>{s.time}</td></tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="dash-legend">🟢 complete · 🔵 trip going on · 🔴 In time done, entry pending</div>
          </>
        )}
      </div>
    </>
  );
}

function Card({ icon, label, value, warn }) {
  return (
    <div className={'dash-card' + (warn ? ' warn' : '')}>
      <div className="dash-card-label">{icon} {label}</div>
      <div className="dash-card-value">{value}</div>
    </div>
  );
}
