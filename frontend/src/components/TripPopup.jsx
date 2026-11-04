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
  // ⋮ menu per employee row (Prem, 4 Nov): one button, tap → Edit / Delete.
  const [menu, setMenu] = useState(null);

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

  // Redesign (Prem, 4 Nov — manager asked): phone = bottom sheet, laptop = wide card; cab and new
  // employee as cards, fields two per row on a laptop, Drop / Pickup as a toggle, buttons stay at the bottom.
  const cabOk = !!(rec.vehicle && rec.driver);
  return (
    <div className="grid-picker-overlay trip-overlay" onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="trip-box" role="dialog" aria-label="Trip details">
        <div className="trip-header">
          <div>
            <div className="trip-title">{escortName || 'Trip'}</div>
            <div className="trip-chips">
              {rec.loc && <span>📍 {rec.loc}</span>}
              <span>↗ Out {rec.out}</span>
              {rec.in && <span>↘ In {rec.in}</span>}
            </div>
          </div>
          <button type="button" className="trip-close" onClick={onClose} disabled={busy} aria-label="Close">&times;</button>
        </div>

        <div className="trip-body" onClick={e => { if (menu && !e.target.closest('.trip-stop-actions')) { setMenu(null); setConfirmDelete(null); } }}>
          <div className={'trip-status' + (complete ? ' ok' : '')}>
            {complete
              ? <span>✅ Trip complete</span>
              : <>
                <b>⚠️ Pending</b>
                <span className={cabOk ? 'done' : ''}>{cabOk ? '✓' : '✗'} Cab</span>
                <span className={stops.length ? 'done' : ''}>{stops.length ? '✓' : '✗'} Employees</span>
              </>}
          </div>

          <section className="trip-card">
            <div className="trip-card-head">
              <span>🚕 Cab <small>· once per trip</small></span>
              {!editCab && <button type="button" className="trip-link" onClick={() => setEditCab(true)}>✏️ Edit</button>}
            </div>
            {editCab ? (
              <div className="trip-fields">
                <label>Vehicle No
                  <input className="trip-plate" value={vehicle} onChange={e => setVehicle(e.target.value.toUpperCase())} placeholder="TN09 AB 1234" />
                </label>
                <label>Driver Name
                  <input value={driver} onChange={e => setDriver(e.target.value)} placeholder="Driver name" />
                </label>
              </div>
            ) : (
              <div className="trip-cab-summary">
                <span className="trip-plate-view">{rec.vehicle}</span>
                <span>👤 {rec.driver}</span>
              </div>
            )}
          </section>

          {stops.length > 0 && <section className="trip-card trip-card-list">
            <div className="trip-card-head"><span>👥 Employees <span className="trip-count">{stops.length}</span></span></div>
            {(
                <ul className="trip-stops">
                  {stops.map((s, i) => (
                    <li key={s.ROWID} className={stop.ROWID === s.ROWID ? 'editing' : ''}>
                      <span className="trip-no">{i + 1}</span>
                      <span className="trip-stop-main">
                        <b>{s.emp}</b>
                        <small>📍 {s.loc}</small>
                      </span>
                      <span className={'trip-pill ' + (s.type === 'Pickup' ? 'pick' : 'drop')}>{s.type}</span>
                      <span className="trip-time">{s.time}</span>
                      <span className="trip-stop-actions">
                        <button type="button" className="trip-dots" aria-label="Options" aria-expanded={menu === s.ROWID}
                          onClick={() => { setMenu(menu === s.ROWID ? null : s.ROWID); setConfirmDelete(null); }} disabled={busy}>⋮</button>
                        {menu === s.ROWID && (
                          <span className={'trip-menu' + (i === stops.length - 1 && i > 0 ? ' up' : '')} role="menu">
                            <button type="button" role="menuitem" onClick={() => { setStop({ ...s }); setMenu(null); }}>✏️ Edit</button>
                            <button type="button" role="menuitem" className={confirmDelete === s.ROWID ? 'danger on' : 'danger'}
                              onClick={() => { if (confirmDelete === s.ROWID) setMenu(null); remove(s); }}>
                              {confirmDelete === s.ROWID ? '🗑 Tap again to delete' : '🗑 Delete'}
                            </button>
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
          </section>}

          <section className={'trip-card trip-new' + (stop.ROWID ? ' editing' : '')}>
            <div className="trip-card-head"><span>{stop.ROWID ? '✏️ Edit employee' : '➕ Add employee'}</span></div>
            <div className="trip-fields">
              <label>Emp ID
                <input value={stop.emp} inputMode="numeric" onChange={e => setStopField('emp', e.target.value)} placeholder="Employee ID" />
              </label>
              <label>Location
                <input value={stop.loc} list="locationSuggestions" onChange={e => setStopField('loc', e.target.value)} placeholder="Location" />
              </label>
              <div className="trip-type" role="radiogroup" aria-label="Type">
                {['Drop', 'Pickup'].map(t => (
                  <button type="button" key={t} role="radio" aria-checked={stop.type === t} className={stop.type === t ? 'on' : ''} onClick={() => setStopField('type', t)}>
                    {t === 'Drop' ? '⬇️ Drop' : '⬆️ Pickup'}
                  </button>
                ))}
              </div>
              <label>Time
                <input type="time" value={stop.time} onChange={e => setStopField('time', e.target.value)} />
              </label>
            </div>
          </section>

          {error && <div className="trip-error">{error}</div>}
        </div>

        <div className="trip-footer">
          {stop.ROWID
            ? <button type="button" onClick={() => setStop(blankStop())} disabled={busy}>Cancel edit</button>
            : <button type="button" onClick={onClose} disabled={busy}>Close</button>}
          <button type="button" className="trip-save" onClick={save} disabled={busy}>{busy ? 'Saving…' : '✓ Save'}</button>
        </div>
      </div>
    </div>
  );
}
