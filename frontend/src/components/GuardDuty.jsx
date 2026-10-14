import { useState } from 'react';
import { api } from '../api.js';
import { nowTime } from '../utils.js';

const ROUTES = 4;
const blankStop = () => ({ emp: '', loc: '', type: 'Drop', time: nowTime() });

// Escort guard's own trips for today, filled from the phone (opened from the IN notification).
// Same order as the duty sheet: Location → Out → In, and Route 2 opens after Route 1 is IN.
// Every save goes through the guard's secret link; the server checks it is their own row.
export default function GuardDuty({ token, testDate, routes, stops, onRoute, onStops }) {
  const auth = { t: token, ...(testDate ? { date: testDate } : {}) };
  const byNo = n => routes.find(r => (parseInt(r.route_no, 10) || 1) === n) || null;

  return (
    <div className="duty-list">
      {Array.from({ length: ROUTES }, (_, i) => i + 1).map(n => {
        const prev = n > 1 ? byNo(n - 1) : null;
        const open = n === 1 || !!(prev && prev.out_time && prev.in_time);
        const rec = byNo(n);
        return (
          <RouteCard
            key={(rec && rec.ROWID) || 'new-' + n}
            n={n}
            open={open}
            rec={rec}
            stops={rec ? stops.filter(s => String(s.duty_record_id) === String(rec.ROWID)) : []}
            auth={auth}
            onRoute={onRoute}
            onStops={onStops}
          />
        );
      })}
    </div>
  );
}

function RouteCard({ n, open, rec, stops, auth, onRoute, onStops }) {
  const [loc, setLoc] = useState((rec && rec.location) || '');
  const [out, setOut] = useState((rec && rec.out_time) || '');
  const [inn, setIn] = useState((rec && rec.in_time) || '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  if (!open) {
    return <div className="duty-card locked">🔒 Route {n} opens after Route {n - 1} has Out and In.</div>;
  }

  const changed = loc.trim() !== ((rec && rec.location) || '') || out !== ((rec && rec.out_time) || '') || inn !== ((rec && rec.in_time) || '');

  async function save() {
    setBusy(true);
    setMsg('');
    try {
      const saved = (await api.guardSaveRoute({ ...auth, route_no: n, location: loc.trim(), out_time: out, in_time: inn })).data;
      onRoute({ ...rec, ...saved, route_no: String(n) });
      setMsg('✅ Saved');
    } catch (err) {
      setMsg('❌ ' + err.message);
    } finally {
      setBusy(false);
    }
  }

  const done = rec && rec.out_time && rec.in_time;
  return (
    <div className={'duty-card' + (done ? ' done' : '')}>
      <div className="duty-head">Route {n}{done ? ' ✅' : rec && rec.out_time ? ' 🚕 on trip' : ''}</div>
      <label>Location
        <input id={'d-loc-' + n} value={loc} onChange={e => setLoc(e.target.value)} placeholder="Where to?" />
      </label>
      <div className="duty-times">
        <TimeField id={'d-out-' + n} label="Out" value={out} onChange={setOut} disabled={!loc.trim()} />
        <TimeField id={'d-in-' + n} label="In" value={inn} onChange={setIn} disabled={!out} />
      </div>
      {changed && <button className="btn setup-btn" disabled={busy} onClick={save}>{busy ? 'Saving...' : '💾 Save Route ' + n}</button>}
      {msg && <div className="setup-msg">{msg}</div>}

      {rec && rec.out_time && <Trip n={n} rec={rec} stops={stops} auth={auth} onRoute={onRoute} onStops={onStops} />}
    </div>
  );
}

// Time box + "Now" button (phones make the time picker slow).
function TimeField({ id, label, value, onChange, disabled }) {
  return (
    <label className="duty-tf">{label}
      <div className="duty-time">
        <input id={id} type="time" value={value} disabled={disabled} onChange={e => onChange(e.target.value)} />
        <button type="button" className="btn secondary" disabled={disabled} onClick={() => onChange(nowTime())}>Now</button>
      </div>
    </label>
  );
}

// Cab + employees of one trip (same data as the trip popup on the duty sheet).
function Trip({ n, rec, stops, auth, onRoute, onStops }) {
  const [vehicle, setVehicle] = useState(rec.vehicle_no || '');
  const [driver, setDriver] = useState(rec.driver_name || '');
  const [stop, setStop] = useState(blankStop);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const cabChanged = vehicle.trim().toUpperCase() !== (rec.vehicle_no || '') || driver.trim() !== (rec.driver_name || '');

  async function run(task) {
    setBusy(true);
    setMsg('');
    try {
      await task();
    } catch (err) {
      setMsg('❌ ' + err.message);
    } finally {
      setBusy(false);
    }
  }

  const saveCab = () => run(async () => {
    const saved = (await api.guardSaveCab({ ...auth, route_no: n, vehicle_no: vehicle, driver_name: driver })).data;
    onRoute({ ...rec, ...saved });
    setVehicle(saved.vehicle_no || '');
    setMsg('✅ Cab saved');
  });

  const addStop = () => run(async () => {
    const saved = (await api.guardAddStop({ ...auth, route_no: n, emp_id: stop.emp, location: stop.loc, trip_type: stop.type, stop_time: stop.time })).data;
    onStops(list => [...list, saved]);
    setStop(blankStop());
    setMsg('✅ Employee added');
  });

  // Two taps to delete (no confirm(): browsers can block it).
  const remove = s => {
    if (confirmDelete !== s.ROWID) {
      setConfirmDelete(s.ROWID);
      return;
    }
    setConfirmDelete(null);
    run(async () => {
      await api.guardDeleteStop({ ...auth, rowid: s.ROWID });
      onStops(list => list.filter(x => x.ROWID !== s.ROWID));
    });
  };

  return (
    <div className="duty-trip">
      <div className="duty-sub">🚕 Cab</div>
      <div className="duty-times">
        <label>Vehicle No<input id={'d-veh-' + n} value={vehicle} onChange={e => setVehicle(e.target.value.toUpperCase())} placeholder="TN09 AB 1234" /></label>
        <label>Driver<input id={'d-drv-' + n} value={driver} onChange={e => setDriver(e.target.value)} placeholder="Driver name" /></label>
      </div>
      {cabChanged && <button className="btn secondary setup-btn" disabled={busy} onClick={saveCab}>💾 Save cab</button>}

      <div className="duty-sub">👥 Employees ({stops.length})</div>
      {stops.map((s, i) => (
        <div key={s.ROWID} className="duty-stop">
          <span>{i + 1}. {s.emp_id} · {s.location} · {s.trip_type} {s.stop_time}</span>
          <button type="button" className={confirmDelete === s.ROWID ? 'trip-del-confirm' : 'duty-del'} disabled={busy} onClick={() => remove(s)}>
            {confirmDelete === s.ROWID ? 'Delete?' : '🗑'}
          </button>
        </div>
      ))}
      <div className="duty-times">
        <label>Emp ID<input id={'d-emp-' + n} value={stop.emp} inputMode="numeric" onChange={e => setStop(x => ({ ...x, emp: e.target.value }))} /></label>
        <label>Location<input id={'d-sloc-' + n} value={stop.loc} onChange={e => setStop(x => ({ ...x, loc: e.target.value }))} /></label>
      </div>
      <div className="duty-times">
        <div className="trip-type">
          {['Drop', 'Pickup'].map(t => (
            <label key={t}>
              <input type="radio" name={'d-type-' + n} checked={stop.type === t} onChange={() => setStop(x => ({ ...x, type: t }))} /> {t}
            </label>
          ))}
        </div>
        <label>Time<input id={'d-time-' + n} type="time" value={stop.time} onChange={e => setStop(x => ({ ...x, time: e.target.value }))} /></label>
      </div>
      <button className="btn secondary setup-btn" disabled={busy || !stop.emp.trim() || !stop.loc.trim() || !stop.time} onClick={addStop}>➕ Add employee</button>
      {msg && <div className="setup-msg">{msg}</div>}
    </div>
  );
}
