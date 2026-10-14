import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { PAGE_SIZE, ROTATION, stopFromDb } from '../utils.js';
import DutyTable from './DutyTable.jsx';
import TimePicker from './TimePicker.jsx';
import TripPopup from './TripPopup.jsx';

// The escort duty sheet of the day on the guard's phone, drawn with the supervisor's own
// components (DutyTable, Route cells, time picker, trip popup), so it looks the same.
// Only the guard's own row (⭐) can be changed: the actions below ignore every other row,
// CSS makes the other rows untouchable, and the server checks it again on every save.
export default function GuardSheet({ token, testDate, dutyDate, sheet, myStops }) {
  const me = sheet.find(r => r.me);
  const myId = me.escortId;
  const myIndex = sheet.indexOf(me);
  const auth = { t: token, ...(testDate ? { date: testDate } : {}) };

  const displayRows = sheet.map(r => ({
    ROWID: r.escortId, name: (r.me ? '⭐ ' : '') + r.name,
    agency: r.agency, mobile: '', id: ''
  }));

  // Same shapes the duty sheet uses: escort ROWID -> { remarks, routes } and trip ROWID -> stops.
  const [duty, setDuty] = useState(() => {
    const map = {};
    sheet.forEach(r => { map[r.escortId] = { remarks: r.remarks, routes: r.routes.map(x => x || undefined) }; });
    return map;
  });
  const [stops, setStops] = useState(() => {
    const map = {};
    sheet.forEach(r => r.routes.forEach(x => {
      // Other rows only say how many employees a trip has.
      if (x && !r.me) map[String(x.ROWID)] = Array.from({ length: x.stopCount }, () => ({}));
    }));
    myStops.forEach(s => { (map[String(s.duty_record_id)] = map[String(s.duty_record_id)] || []).push(stopFromDb(s)); });
    return map;
  });
  const [cellStatus, setCellStatus] = useState({});
  const [picker, setPicker] = useState(null);
  const [trip, setTrip] = useState(null);
  const [error, setError] = useState('');

  const dutyRef = useRef(duty);
  dutyRef.current = duty;
  // One save at a time per route, so a quick Location + Out never makes two rows.
  const queue = useRef({});

  const myRoute = idx => (dutyRef.current[myId].routes[idx]) || {};
  const setMyRoute = (idx, patch) => setDuty(d => {
    const routes = [...d[myId].routes];
    routes[idx] = { ...(routes[idx] || {}), ...patch };
    const next = { ...d, [myId]: { ...d[myId], routes } };
    dutyRef.current = next;
    return next;
  });
  const status = (idx, value) => setCellStatus(c => ({ ...c, ['m-' + myId + '-' + idx]: value }));

  function saveRoute(id, idx) {
    if (id !== myId) return;
    const run = async () => {
      const rec = myRoute(idx);
      status(idx, 'saving');
      setError('');
      try {
        const saved = (await api.guardSaveRoute({
          ...auth, route_no: idx + 1, location: rec.loc || '', out_time: rec.out || '', in_time: rec.in || ''
        })).data;
        setMyRoute(idx, { ROWID: saved.ROWID });
        status(idx, null);
      } catch (err) {
        setError('Route ' + (idx + 1) + ': ' + err.message);
        status(idx, 'failed');
      }
    };
    queue.current[idx] = (queue.current[idx] || Promise.resolve()).then(run);
  }

  const actions = {
    setRouteField(id, idx, field, value) { if (id === myId) setMyRoute(idx, { [field]: value }); },
    saveRoute,
    pickRouteTime(id, idx, seatNo, field, label) {
      if (id !== myId) return;
      setPicker({
        label, value: myRoute(idx)[field] || '',
        onOk: value => { setMyRoute(idx, { [field]: value }); saveRoute(id, idx); }
      });
    },
    openTrip(id, idx) { if (id === myId) setTrip(idx); },
    // Name, agency, remarks and removing a row stay with the supervisor.
    setEscortField() {},
    saveEscort() {},
    setRemarks() {},
    deleteEscort() {}
  };

  // DutyTable draws pages of PAGE_SIZE rows; this selector finds the guard's row inside them.
  const mineSel = `.gsheet-orig > .page-block:nth-child(${Math.floor(myIndex / PAGE_SIZE) + 1}) tbody tr:nth-child(${(myIndex % PAGE_SIZE) + 1})`;

  // Open the page at the guard's own row.
  useEffect(() => {
    const row = document.querySelector(mineSel);
    if (row) row.scrollIntoView({ block: 'center', inline: 'start' });
  }, [mineSel]);

  const tripRec = trip !== null ? myRoute(trip) : null;

  return (
    <>
      <style>{`${mineSel} td.routecell{pointer-events:auto;}
${mineSel} td:not(.routecell){background:#fef9c3 !important;}`}</style>
      {error && <div className="trip-error gsheet-error">{error}</div>}
      <div className="tablewrap gsheet-orig">
        <DutyTable
          displayRows={displayRows}
          duty={duty}
          stops={stops}
          rotation={ROTATION}
          dutyDate={dutyDate}
          cellStatus={cellStatus}
          actions={actions}
        />
      </div>

      {picker && (
        <TimePicker label={picker.label} value={picker.value} onOk={picker.onOk} onClose={() => setPicker(null)} />
      )}
      {tripRec && tripRec.ROWID && (
        <TripPopup
          escortName={me.name}
          rec={tripRec}
          stops={stops[String(tripRec.ROWID)] || []}
          onSaveCab={async (vehicle, driver) => {
            await api.guardSaveCab({ ...auth, route_no: trip + 1, vehicle_no: vehicle, driver_name: driver });
            setMyRoute(trip, { vehicle: vehicle.toUpperCase(), driver });
          }}
          onSaveStop={async stop => {
            const key = String(tripRec.ROWID);
            const body = { ...auth, route_no: trip + 1, emp_id: stop.emp, location: stop.loc, trip_type: stop.type, stop_time: stop.time };
            if (stop.ROWID) {
              await api.guardUpdateStop({ ...body, rowid: stop.ROWID });
              setStops(m => ({ ...m, [key]: m[key].map(s => (s.ROWID === stop.ROWID ? stop : s)) }));
            } else {
              const saved = (await api.guardAddStop(body)).data;
              setStops(m => ({ ...m, [key]: [...(m[key] || []), { ...stop, ROWID: saved.ROWID }] }));
            }
          }}
          onDeleteStop={async rowid => {
            const key = String(tripRec.ROWID);
            await api.guardDeleteStop({ ...auth, rowid });
            setStops(m => ({ ...m, [key]: m[key].filter(s => s.ROWID !== rowid) }));
          }}
          onClose={() => setTrip(null)}
        />
      )}
    </>
  );
}
