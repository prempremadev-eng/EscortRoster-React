import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { ROTATION, routeLocks, shortDate, stopFromDb } from '../utils.js';
import TableHeader from './TableHeader.jsx';
import RouteCell from './RouteCell.jsx';
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

  return (
    <>
      <div className="titlebar"><h1>🚕 Urgent Escort</h1></div>
      <div className="toolbar no-print ex-bar">
        {data && <div><b className="guard-name">{data.name}</b> · {data.agency} · {shortDate(data.dutyDate)}</div>}
        <div className="spacer"></div>
        <button className="btn" onClick={load}>🔄 Refresh</button>
        <a className="btn secondary" href={'#guard/' + token}>← My post</a>
      </div>
      {data && !data.canEdit && (
        <div className="setup-card ex-note">No 🚕 Escort break running. On your post page tap <b>Go on break → Escort</b> first.</div>
      )}
      {data && data.onEscort && (
        <div className="sim-note ex-note">Fill your row like the office sheet: Location → Out → In for every trip. After Out, tap the bar under the trip for cab and employees. Waiting for the next trip? Fill Trip 2 the same way. Then <b>I'm back</b> on your post page.</div>
      )}
      {error && <div className="trip-error gsheet-error">{error}</div>}
      {data && (
        <div className={'extra-section page-block tablewrap ex-sheet' + (data.canEdit ? '' : ' ex-locked')}>
          <div className="extra-title">Extra Escorts (Today Only)</div>
          <table>
            <TableHeader rotation={ROTATION} />
            <tbody>
              <tr className="extra-row">
                <td className="rowno col-sno">E</td>
                <td className="name col-name">⭐ {data.name}</td>
                <td>{data.agency}</td>
                <td>—</td>
                <td>{data.idNo}</td>
                {Array.from({ length: ROTATION }, (_, i) => (
                  <RouteCell
                    key={i}
                    rec={routes[i]}
                    locks={routeLocks(routes, i)}
                    saveState={cellStatus[i]}
                    stops={routes[i] && routes[i].ROWID ? stops[String(routes[i].ROWID)] || [] : []}
                    onChange={(field, v) => setRoute(i, { [field]: v })}
                    onCommit={() => saveRoute(i)}
                    onRetry={() => saveRoute(i)}
                    onPickTime={(field, label) => setPicker({
                      label, value: (routesRef.current[i] || {})[field] || '',
                      onOk: v => { setRoute(i, { [field]: v }); saveRoute(i); }
                    })}
                    onOpenTrip={() => setTrip(i)}
                  />
                ))}
                <td className="remarks">🚨 Urgent escort</td>
                <td className="delcell-col no-print"></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
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
    </>
  );
}
