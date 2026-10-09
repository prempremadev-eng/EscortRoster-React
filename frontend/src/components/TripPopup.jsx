import { useState } from 'react';
import { isTripComplete, nowTime } from '../utils.js';

const blankStop = () => ({ ROWID: null, emp: '', loc: '', type: 'Drop', time: nowTime() });

// One trip's paperwork: cab details (once per trip) + the employees dropped / picked up.
// Opens from the bar under a Route cell once the trip has an Out time.
export default function TripPopup({ escortName, rec, stops, onSaveCab, onSaveStop, onDeleteStop, onClose }) {
  const [vehicle, setVehicle] = useState(rec.vehicle || '');
  const [driver, setDriver] = useState(rec.driver || '');
  const [editCab, setEditCab] = useState(!rec.vehicle || !rec.driver);
  const [stop, setStop] = useState(blankStop);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // ROWID of the stop whose 🗑 was tapped once — the second tap deletes.
  // (No window.confirm: browsers can silently block it, and it is clumsy on mobile.)
  const [confirmDelete, setConfirmDelete] = useState(null);

  const cabChanged = vehicle.trim() !== (rec.vehicle || '') || driver.trim() !== (rec.driver || '');
  const stopStarted = !!(stop.ROWID || stop.emp.trim() || stop.loc.trim());
  const complete = isTripComplete(rec, stops);

  const setStopField = (field, value) => setStop(s => ({ ...s, [field]: value }));

  async function save() {
    setError('');
    if (stopStarted && !(stop.emp.trim() && stop.loc.trim() && stop.type && stop.time)) {
      setError('Emp ID, Location, Type, Time — ellaam fill pannunga.');
      return;
    }
    if (!cabChanged && !stopStarted) {
      onClose();
      return;
    }
    setBusy(true);
    try {
      if (cabChanged) {
        await onSaveCab(vehicle.trim(), driver.trim());
        if (vehicle.trim() && driver.trim()) setEditCab(false);
      }
      if (stopStarted) {
        await onSaveStop({ ...stop, emp: stop.emp.trim(), loc: stop.loc.trim() });
        setStop(blankStop());
      }
    } catch (err) {
      setError('Save aagala: ' + (err.message || 'Internet check pannunga.'));
    } finally {
      setBusy(false);
    }
  }

  async function remove(s) {
    if (confirmDelete !== s.ROWID) {
      setConfirmDelete(s.ROWID);
      return;
    }
    setConfirmDelete(null);
    setBusy(true);
    setError('');
    try {
      await onDeleteStop(s.ROWID);
      if (stop.ROWID === s.ROWID) setStop(blankStop());
    } catch (err) {
      setError('Delete aagala: ' + (err.message || 'Internet check pannunga.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid-picker-overlay" onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="trip-box">
        <div className="trip-header">
          <div>
            <div className="trip-title">{escortName || 'Trip'}</div>
            <div className="trip-sub">{rec.loc} · Out {rec.out}{rec.in ? ' · In ' + rec.in : ''}</div>
          </div>
          <button type="button" className="trip-close" onClick={onClose} disabled={busy}>&times;</button>
        </div>

        {!complete && (
          <div className="trip-warn">
            ⚠️ Entry pending:
            {!(rec.vehicle && rec.driver) && <span> Vehicle No / Driver Name.</span>}
            {stops.length === 0 && <span> Employee entry illa.</span>}
          </div>
        )}

        <div className="trip-section">🚕 Cab (trip ku oru thadava)</div>
        {editCab ? (
          <div className="trip-fields">
            <label>Vehicle No
              <input value={vehicle} onChange={e => setVehicle(e.target.value.toUpperCase())} placeholder="TN09 AB 1234" />
            </label>
            <label>Driver Name
              <input value={driver} onChange={e => setDriver(e.target.value)} placeholder="Driver name" />
            </label>
          </div>
        ) : (
          <div className="trip-cab-summary">
            <span>{rec.vehicle} · {rec.driver}</span>
            <button type="button" className="trip-link" onClick={() => setEditCab(true)}>✏️ Edit</button>
          </div>
        )}

        <div className="trip-section">👤 Employees ({stops.length})</div>
        {stops.length > 0 && (
          <table className="trip-stops">
            <tbody>
              {stops.map((s, i) => (
                <tr key={s.ROWID} className={stop.ROWID === s.ROWID ? 'editing' : ''}>
                  <td>{i + 1}</td>
                  <td>{s.emp}</td>
                  <td>{s.loc}</td>
                  <td>{s.type}</td>
                  <td>{s.time}</td>
                  <td className="trip-stop-actions">
                    <button type="button" title="Edit" onClick={() => setStop({ ...s })} disabled={busy}>✏️</button>
                    {confirmDelete === s.ROWID
                      ? <button type="button" className="trip-del-confirm" onClick={() => remove(s)} disabled={busy}>Delete?</button>
                      : <button type="button" title="Delete" onClick={() => remove(s)} disabled={busy}>🗑</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="trip-section small">{stop.ROWID ? 'Edit employee' : '+ New employee'}</div>
        <div className="trip-fields">
          <label>Emp ID
            <input value={stop.emp} inputMode="numeric" onChange={e => setStopField('emp', e.target.value)} placeholder="Employee ID" />
          </label>
          <label>Location
            <input value={stop.loc} list="locationSuggestions" onChange={e => setStopField('loc', e.target.value)} placeholder="Location" />
          </label>
          <div className="trip-type">
            {['Drop', 'Pickup'].map(t => (
              <label key={t}>
                <input type="radio" name="tripType" checked={stop.type === t} onChange={() => setStopField('type', t)} /> {t}
              </label>
            ))}
          </div>
          <label>Time
            <input type="time" value={stop.time} onChange={e => setStopField('time', e.target.value)} />
          </label>
        </div>

        {error && <div className="trip-error">{error}</div>}

        <div className="grid-picker-footer">
          {stop.ROWID
            ? <button type="button" onClick={() => setStop(blankStop())} disabled={busy}>Cancel edit</button>
            : <button type="button" onClick={onClose} disabled={busy}>Close</button>}
          <button type="button" className="gp-ok" onClick={save} disabled={busy}>{busy ? 'Saving...' : '✓ Save'}</button>
        </div>
      </div>
    </div>
  );
}
