import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { ROTATION, isTripComplete, routeLocks, shortDate, stopFromDb } from '../utils.js';
import TimePicker from './TimePicker.jsx';
import TripPopup from './TripPopup.jsx';

// Urgent escort on the guard's phone (Prem, 4 Nov): a post guard on a 🚕 Escort break opens the
// escort sheet's "Extra (today only)" part with only his own row, and fills it like the office:
// Location → Out → In per trip, and the trip popup (cab + employees). The office sees the same row.
export default function EscortExtra({ token }) {
  const [data, setData] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [stops, setStops] = useState({});
  const [cellStatus, setCellStatus] = useState({});
  const [picker, setPicker] = useState(null);
  const [trip, setTrip] = useState(null);
  const [error, setError] = useState('');
  const routesRef = useRef(routes);
  routesRef.current = routes;
  const queue = useRef({});

  const load = useCallback(async () => {
    setError('');
    try {
      const d = (await api.guardEscortExtra(token)).data;
      setData(d);
      setRoutes(d.routes.map(r => r || undefined));
      const map = {};
      d.stops.forEach(s => { (map[String(s.duty_record_id)] = map[String(s.duty_record_id)] || []).push(stopFromDb(s)); });
      setStops(map);
    } catch (err) {
      setError(err.message);
    }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const setRoute = (idx, patch) => setRoutes(list => {
    const next = [...list];
    next[idx] = { ...(next[idx] || {}), ...patch };
    routesRef.current = next;
    return next;
  });

  function saveRoute(idx) {
    const run = async () => {
      const rec = routesRef.current[idx] || {};
      setCellStatus(c => ({ ...c, [idx]: 'saving' }));
      setError('');
      try {
        const saved = (await api.guardEscortRoute({ t: token, route_no: idx + 1, location: rec.loc || '', out_time: rec.out || '', in_time: rec.in || '' })).data;
        setRoute(idx, { ROWID: saved.ROWID });
        setCellStatus(c => ({ ...c, [idx]: null }));
      } catch (err) {
        setError('Trip ' + (idx + 1) + ': ' + err.message);
        setCellStatus(c => ({ ...c, [idx]: 'failed' }));
      }
    };
    queue.current[idx] = (queue.current[idx] || Promise.resolve()).then(run);
  }

  const tripRec = trip !== null ? routes[trip] : null;
  // Phone layout (Prem, 5 Nov): one card per trip like the trip popup, not the wide office table.
  // Trips show up to the first one not started (Trip 2 opens after Trip 1 has Out and In).
  const shown = [];
  for (let i = 0; i < ROTATION; i++) {
    shown.push(i);
    const r = routes[i] || {};
    if (!(r.out && r.in)) break;
  }
  const pick = (i, field) => setPicker({
    label: (field === 'out' ? 'Out' : 'In') + ' · Trip ' + (i + 1), value: (routesRef.current[i] || {})[field] || '',
    onOk: v => { setRoute(i, { [field]: v }); saveRoute(i); }
  });

  return (
    <div className="ex">
      <div className="ex-head">
        <div className="ex-title">🚕 Post Escort</div>
        {data && <div className="ex-chips"><span>👤 {data.name}</span><span>{data.agency}</span><span>🪪 {data.idNo}</span><span>📅 {shortDate(data.dutyDate)}</span></div>}
      </div>

      <div className="ex-body">
        {!data && !error && <div className="ex-muted">Loading…</div>}
        {data && (
          <div className={'ex-status' + (data.onEscort ? ' on' : '')}>
            {data.onEscort ? '🟢 On Post Escort now' : data.canEdit ? '✅ Back at post · you can still fill a missing In' : '🔒 No Post Escort break. Post page → Go on break → 🚕 Post Escort'}
          </div>
        )}
        {error && <div className="trip-error">{error}</div>}

        {data && shown.map(i => {
          const r = routes[i] || {};
          const locks = routeLocks(routes, i);
          const tripStops = r.ROWID ? stops[String(r.ROWID)] || [] : [];
          const done = r.out && r.in;
          const okTrip = r.out && isTripComplete(r, tripStops);
          return (
            <section key={i} className={'ex-card' + (data.canEdit ? '' : ' ex-locked') + (done ? ' done' : '')}>
              <div className="ex-card-head">
                <span>Trip {i + 1}</span>
                <span className="ex-save">{cellStatus[i] === 'saving' ? 'Saving…' : cellStatus[i] === 'failed' ? <button type="button" onClick={() => saveRoute(i)}>⚠️ Retry</button> : done ? '✅ Done' : r.out ? '🚗 Out' : ''}</span>
              </div>
              <div className="ex-fields">
                <label className="ex-wide">Location
                  <input value={r.loc || ''} list="locationSuggestions" placeholder="Where to?" disabled={locks.locDisabled}
                    onChange={e => setRoute(i, { loc: e.target.value })} onBlur={() => { if ((r.loc || "").trim() || r.ROWID) saveRoute(i); }} />
                </label>
                <label>Out
                  <button type="button" className="trip-time-btn" disabled={locks.outDisabled} onClick={() => pick(i, 'out')}>🕒 {r.out || '--:--'}</button>
                </label>
                <label>In
                  <button type="button" className="trip-time-btn" disabled={locks.inDisabled} onClick={() => pick(i, 'in')}>🕒 {r.in || '--:--'}</button>
                </label>
              </div>
              {r.out && (
                <button type="button" className={'ex-trip ' + (okTrip ? 'ok' : 'todo')} onClick={() => r.ROWID && setTrip(i)} disabled={!r.ROWID}>
                  <span>🚕 {r.vehicle ? r.vehicle : 'Cab'} · 👥 {tripStops.length} employee{tripStops.length === 1 ? '' : 's'}</span>
                  <b>{okTrip ? 'View ›' : 'Fill ›'}</b>
                </button>
              )}
            </section>
          );
        })}

        {data && data.canEdit && <div className="ex-muted">Location → Out → cab & employees → In. Waiting for the next trip? Trip {Math.min(shown.length + 1, ROTATION)} opens after this one's In.</div>}
      </div>

      <div className="ex-foot">
        <a className="ex-btn" href={'#guard/' + token}>← My post</a>
        <button type="button" className="ex-btn" onClick={load}>🔄 Refresh</button>
      </div>

      {picker && <TimePicker label={picker.label} value={picker.value} onOk={picker.onOk} onClose={() => setPicker(null)} />}
      {tripRec && tripRec.ROWID && (
        <TripPopup
          escortName={data.name}
          rec={tripRec}
          stops={stops[String(tripRec.ROWID)] || []}
          onSaveCab={async (vehicle, driver) => {
            await api.guardEscortCab({ t: token, route_no: trip + 1, vehicle_no: vehicle, driver_name: driver });
            setRoute(trip, { vehicle: vehicle.toUpperCase(), driver });
          }}
          onSaveStop={async stop => {
            const key = String(tripRec.ROWID);
            const body = { t: token, route_no: trip + 1, emp_id: stop.emp, location: stop.loc, trip_type: stop.type, stop_time: stop.time };
            if (stop.ROWID) {
              await api.guardEscortStop({ ...body, rowid: stop.ROWID });
              setStops(m => ({ ...m, [key]: m[key].map(s => (s.ROWID === stop.ROWID ? stop : s)) }));
            } else {
              const saved = (await api.guardEscortStop(body)).data;
              setStops(m => ({ ...m, [key]: [...(m[key] || []), { ...stop, ROWID: saved.ROWID }] }));
            }
          }}
          onDeleteStop={async rowid => {
            const key = String(tripRec.ROWID);
            await api.guardEscortStop({ t: token, rowid, delete: true });
            setStops(m => ({ ...m, [key]: m[key].filter(s => s.ROWID !== rowid) }));
          }}
          onClose={() => setTrip(null)}
        />
      )}
    </div>
  );
}
