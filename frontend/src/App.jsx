import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import {
  PICKUP_ROWS, ROTATION, blankPickup, computeDisplayRows, escortFromDb, groupStops,
  isMonday, isSaturday, isSunday, dutyDayStr, readEscortFile, routeFromDb
} from './utils.js';
import Toolbar from './components/Toolbar.jsx';
import DutyTable from './components/DutyTable.jsx';
import ExtraSection from './components/ExtraSection.jsx';
import PickupTable from './components/PickupTable.jsx';
import TimePicker from './components/TimePicker.jsx';
import TripPopup from './components/TripPopup.jsx';
import UploadPopup, { UploadSetupPopup } from './components/UploadPopup.jsx';
import { LeaveMessage, MondayReminder, UploadPrompt } from './components/Messages.jsx';

// Every refresh costs Data Store reads (free tier is limited), so poll gently
// and not at all while the tab is hidden.
const AUTO_REFRESH_MS = 30000;
const TYPING_IDLE_MS = 4000;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// State + a ref that is updated synchronously, so async save code always reads the latest values.
function useStore(initial) {
  const ref = useRef(initial);
  const [value, setValue] = useState(initial);
  const update = useCallback(next => {
    ref.current = typeof next === 'function' ? next(ref.current) : next;
    setValue(ref.current);
  }, []);
  return [value, update, ref];
}

function setAt(arr, idx, patch) {
  const copy = arr.slice();
  copy[idx] = { ...(copy[idx] || {}), ...patch };
  return copy;
}

let extraUid = 0;

export default function App() {
  const today = dutyDayStr();
  const [startDate, setStartDate, startDateRef] = useStore(today);
  const [dutyDate, setDutyDate, dutyDateRef] = useStore(today);
  const [view, setView, viewRef] = useStore('loading');
  // true on a Month Roster weekday (escort rows come from the roster, notes/ESCORT-RULES.md)
  const [rosterDay, setRosterDay] = useState(false);

  const [escorts, updateEscorts, escortsRef] = useStore([]);
  // escort ROWID -> { remarks, routes: [{ ROWID, loc, out, in }] }
  const [duty, updateDuty, dutyRef] = useStore({});
  // trip (DutyRecords ROWID) -> [{ ROWID, emp, loc, type, time }]
  const [stops, updateStops] = useStore({});
  const [extraRows, updateExtras, extrasRef] = useStore([]);
  const [pickupRows, updatePickups, pickupsRef] = useStore([]);
  const [locations, setLocations] = useState([]);
  const [cellStatus, setCellStatus] = useState({});

  const [picker, setPicker, pickerRef] = useStore(null);
  const [popup, setPopup, popupRef] = useStore(null);
  // Open trip popup: { id: escort ROWID, idx: route index }
  const [trip, setTrip, tripRef] = useStore(null);

  const fileInputRef = useRef(null);
  const extraSeatCounter = useRef(9000);
  const typingRef = useRef(false);

  const rotation = ROTATION;

  /* ---------- serial save queue (one queue per cell/row) ---------- */
  // Saves for the same record run one after another, so a second edit waits for the
  // first insert to return its ROWID instead of inserting a duplicate row.
  const queues = useRef({});
  const inFlight = useRef(0);
  const enqueue = useCallback((key, task) => {
    inFlight.current++;
    const run = (queues.current[key] || Promise.resolve()).then(task);
    queues.current[key] = run.catch(() => {});
    return run.finally(() => { inFlight.current--; });
  }, []);

  const setStatus = useCallback((key, value) => {
    setCellStatus(s => {
      const next = { ...s };
      if (value) next[key] = value; else delete next[key];
      return next;
    });
  }, []);

  /* ---------- loaders ---------- */

  const loadEscorts = useCallback(async () => {
    const result = await api.getEscorts();
    updateEscorts(result.data.map(escortFromDb));
  }, [updateEscorts]);

  const loadLocations = useCallback(async () => {
    try {
      const result = await api.getAllLocations();
      setLocations([...new Set(result.data)].sort());
    } catch (err) {
      console.error('Failed to load locations:', err);
    }
  }, []);

  // Main duty routes from the day's DutyRecords: escort ROWID -> { remarks, routes }.
  const buildDuty = useCallback(records => {
    const map = {};
    records.forEach(rec => {
      if (rec.is_extra === 'true' || rec.is_sunday_pickup === 'true') return;
      const key = String(rec.escort_id);
      if (!map[key]) map[key] = { remarks: '', routes: [] };
      const idx = (parseInt(rec.route_no) || 1) - 1;
      map[key].routes[idx] = routeFromDb(rec);
      if (idx === 0 && rec.remarks) map[key].remarks = rec.remarks;
    });
    return map;
  }, []);

  // Extra (today only) rows from the same DutyRecords, grouped by seat.
  const buildExtras = useCallback(records => {
    const groups = {};
    records.forEach(rec => {
      if (rec.is_extra !== 'true') return;
      (groups[rec.seat_no] = groups[rec.seat_no] || []).push(rec);
    });
    return Object.keys(groups).map(key => {
      const recs = groups[key];
      const primary = recs.find(x => (parseInt(x.route_no) || 1) === 1) || recs[0];
      const row = {
        uid: 'x' + (++extraUid),
        seatNo: parseInt(key),
        name: primary.extra_name || '',
        agency: primary.extra_agency || '',
        mobile: primary.extra_mobile || '',
        id: primary.extra_id_no || '',
        remarks: primary.remarks || '',
        routes: []
      };
      recs.forEach(rec => { row.routes[(parseInt(rec.route_no) || 1) - 1] = routeFromDb(rec); });
      if (row.seatNo >= extraSeatCounter.current) extraSeatCounter.current = row.seatNo + 1;
      return row;
    });
  }, []);

  const fetchPickups = useCallback(async date => {
    const result = await api.getSundayPickupRecords(date);
    const rows = Array.from({ length: PICKUP_ROWS }, blankPickup);
    result.data.forEach(rec => {
      const row = {
        ROWID: rec.ROWID, name: rec.extra_name || '', agency: rec.extra_agency || '',
        mobile: rec.extra_mobile || '', id: rec.extra_id_no || '', remarks: rec.remarks || '',
        loc: rec.location || '', out: rec.out_time || '', in: rec.in_time || ''
      };
      // Keep each pickup on the row (seat) it was typed into.
      let idx = (parseInt(rec.seat_no) || 0) - 1;
      if (idx < 0 || (rows[idx] && rows[idx].ROWID)) idx = rows.findIndex(r => !r.ROWID);
      if (idx < 0) idx = rows.length;
      rows[idx] = row;
    });
    return rows;
  }, []);

  // One call for the whole duty sheet: escorts, routes, extras and trip stops.
  const fetchDay = useCallback(async date => {
    const { escorts: escortRows, duty: records, stops: stopRows, roster } = (await api.getDayData(date)).data;
    return {
      roster: !!roster,
      escorts: escortRows.map(escortFromDb),
      map: buildDuty(records),
      extras: buildExtras(records),
      stopMap: groupStops(stopRows)
    };
  }, [buildDuty, buildExtras]);

  // Replaces local state with a fetched day. Extras that were added on screen
  // but not saved yet are kept, so a refresh never wipes them.
  const applyDay = useCallback(day => {
    setRosterDay(day.roster);
    updateEscorts(day.escorts);
    updateDuty(day.map);
    updateStops(day.stopMap);
    const unsaved = extrasRef.current.filter(r => !r.deleted && !r.routes.some(x => x && x.ROWID));
    updateExtras([...day.extras, ...unsaved]);
  }, [updateEscorts, updateDuty, updateStops, updateExtras, extrasRef]);

  const applyTableData = useCallback(async date => {
    const day = await fetchDay(date);
    if (dutyDateRef.current !== date) return;
    applyDay(day);
  }, [fetchDay, applyDay, dutyDateRef]);

  // Decides what the page shows for a date (leave / pickup / upload prompt / duty table).
  const loadForDate = useCallback(async date => {
    try {
      if (isSaturday(date)) {
        setView('leave');
      } else if (isSunday(date)) {
        const rows = await fetchPickups(date);
        if (dutyDateRef.current !== date) return;
        updatePickups(rows);
        setView('pickup');
      } else {
        // Month Roster days need no Monday Excel upload: the list comes from the roster.
        const day = await fetchDay(date);
        if (dutyDateRef.current !== date) return;
        if (isMonday(date) && !day.roster) {
          const result = await api.getLastUploadDate();
          if (dutyDateRef.current !== date) return;
          if (result.data !== date) {
            setView('uploadPrompt');
            return;
          }
        }
        applyDay(day);
        if (dutyDateRef.current !== date) return;
        setView('table');
      }
    } catch (err) {
      console.error('Failed to load date:', err);
      if (viewRef.current === 'loading') setView('error');
    }
  }, [fetchPickups, fetchDay, applyDay, updatePickups, setView, dutyDateRef, viewRef]);

  /* ---------- init ---------- */

  useEffect(() => {
    (async () => {
      try {
        const result = await api.getStartDate();
        if (result.data) setStartDate(result.data);
      } catch (err) {
        console.error('Failed to load start date:', err);
      }
      try {
        await loadEscorts();
      } catch (err) {
        console.error('Failed to load escorts:', err);
        alert('Database-லேர்ந்து escorts load பண்ண முடியல.');
      }
      loadLocations();
      await loadForDate(dutyDateRef.current);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- auto refresh (does not disturb typing or scroll) ---------- */

  useEffect(() => {
    let timeoutId = null;
    const markTyping = () => {
      typingRef.current = true;
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => { typingRef.current = false; }, TYPING_IDLE_MS);
    };
    document.addEventListener('input', markTyping);
    document.addEventListener('focusin', markTyping);
    return () => {
      document.removeEventListener('input', markTyping);
      document.removeEventListener('focusin', markTyping);
      clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    const tick = async () => {
      if (document.hidden) return;
      if (typingRef.current || pickerRef.current || popupRef.current || tripRef.current || inFlight.current > 0) return;
      const date = dutyDateRef.current;
      if (!date) return;
      try {
        if (viewRef.current === 'pickup') {
          const rows = await fetchPickups(date);
          if (dutyDateRef.current === date && !typingRef.current && inFlight.current === 0) updatePickups(rows);
        } else if (viewRef.current === 'table') {
          const day = await fetchDay(date);
          if (dutyDateRef.current !== date || typingRef.current || inFlight.current > 0 || popupRef.current || tripRef.current) return;
          applyDay(day);
        }
      } catch (err) {
        console.error('Auto-refresh failed:', err);
      }
    };
    const id = setInterval(tick, AUTO_REFRESH_MS);
    // Coming back to the tab: catch up at once instead of waiting for the next tick.
    const onVisible = () => { if (!document.hidden) tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fetchPickups, fetchDay, applyDay, updatePickups, dutyDateRef, viewRef, pickerRef, popupRef, tripRef]);

  /* ---------- toolbar ---------- */

  async function saveStart(value) {
    if (!value) return;
    try { await api.saveStartDate(value); }
    catch (err) { console.error('Failed to save start date:', err); }
  }

  function changeStartDate(value) {
    setStartDate(value);
    saveStart(value);
  }

  function changeDutyDate(value) {
    setDutyDate(value);
    updateDuty({});
    updateStops({});
    updateExtras([]);
    setCellStatus({});
    if (value) loadForDate(value);
  }

  function generate() {
    loadLocations();
    loadForDate(dutyDateRef.current);
  }

  /* ---------- escorts ---------- */

  const actions = {
    setEscortField(id, field, value) {
      updateEscorts(list => list.map(e => String(e.ROWID) === id ? { ...e, [field]: value } : e));
    },

    saveEscort(id) {
      return enqueue('escort-' + id, async () => {
        const e = escortsRef.current.find(x => String(x.ROWID) === id);
        if (!e) return;
        await api.updateEscort({ ROWID: e.ROWID, escort_name: e.name, agency: e.agency, mobile: e.mobile, id_no: e.id });
      }).catch(err => console.error('Failed to update escort:', err));
    },

    async deleteEscort(id) {
      const e = escortsRef.current.find(x => String(x.ROWID) === id);
      if (!window.confirm('Remove escort "' + ((e && e.name) || 'this row') + '" from the roster?')) return;
      updateEscorts(list => list.filter(x => String(x.ROWID) !== id));
      try { await enqueue('escort-' + id, () => api.deleteEscort(id)); }
      catch (err) { console.error('Failed to delete escort:', err); }
    },

    /* ---------- main duty routes ---------- */

    setRouteField(id, idx, field, value) {
      updateDuty(d => {
        const entry = d[id] || { remarks: '', routes: [] };
        return { ...d, [id]: { ...entry, routes: setAt(entry.routes, idx, { [field]: value }) } };
      });
    },

    setRemarks(id, value) {
      updateDuty(d => ({ ...d, [id]: { ...(d[id] || { routes: [] }), remarks: value } }));
    },

    async saveRoute(id, idx, seatNo, showStatus) {
      const date = dutyDateRef.current;
      if (!date || !id) return;
      const key = 'm-' + id + '-' + idx;
      if (showStatus) setStatus(key, 'saving');
      const minDelay = sleep(500);
      try {
        await enqueue(key, async () => {
          if (dutyDateRef.current !== date) return;
          const entry = dutyRef.current[id] || { remarks: '', routes: [] };
          const rec = entry.routes[idx] || {};
          const payload = { location: rec.loc || '', out_time: rec.out || '', in_time: rec.in || '' };
          if (idx === 0) payload.remarks = entry.remarks || '';
          if (rec.ROWID) {
            await api.updateDutyRecord({ ROWID: rec.ROWID, ...payload });
          } else {
            const result = await api.addDutyRecord({
              duty_date: date, escort_id: id, seat_no: seatNo, route_no: idx + 1, ...payload
            });
            if (dutyDateRef.current === date && result.data && result.data.ROWID) {
              actions.setRouteField(id, idx, 'ROWID', result.data.ROWID);
            }
          }
        });
        await minDelay;
        if (showStatus) setStatus(key, null);
      } catch (err) {
        console.error('Failed to sync duty record:', err);
        await minDelay;
        if (showStatus) setStatus(key, 'failed');
      }
    },

    pickRouteTime(id, idx, seatNo, field, label) {
      const entry = dutyRef.current[id];
      const current = (entry && entry.routes[idx] && entry.routes[idx][field]) || '';
      setPicker({
        label, value: current,
        onOk: value => {
          actions.setRouteField(id, idx, field, value);
          actions.saveRoute(id, idx, seatNo, true);
        }
      });
    },

    /* ---------- trip details (cab + employee stops) ---------- */

    openTrip(id, idx) {
      setTrip({ id, idx });
    },

    async saveTripCab(id, idx, vehicle, driver) {
      const rec = dutyRef.current[id].routes[idx];
      await api.updateTripCab({ ROWID: rec.ROWID, vehicle_no: vehicle, driver_name: driver });
      actions.setRouteField(id, idx, 'vehicle', vehicle);
      actions.setRouteField(id, idx, 'driver', driver);
    },

    async saveTripStop(id, idx, stop) {
      const rec = dutyRef.current[id].routes[idx];
      const key = String(rec.ROWID);
      const payload = { emp_id: stop.emp, location: stop.loc, trip_type: stop.type, stop_time: stop.time };
      if (stop.ROWID) {
        await api.updateTripStop({ ROWID: stop.ROWID, ...payload });
        updateStops(m => ({ ...m, [key]: (m[key] || []).map(s => s.ROWID === stop.ROWID ? stop : s) }));
      } else {
        const result = await api.addTripStop({
          duty_record_id: rec.ROWID, duty_date: dutyDateRef.current, escort_id: id, ...payload
        });
        updateStops(m => ({ ...m, [key]: [...(m[key] || []), { ...stop, ROWID: result.data.ROWID }] }));
      }
    },

    async deleteTripStop(id, idx, rowid) {
      const rec = dutyRef.current[id].routes[idx];
      const key = String(rec.ROWID);
      await api.deleteTripStop(rowid);
      updateStops(m => ({ ...m, [key]: (m[key] || []).filter(s => s.ROWID !== rowid) }));
    },

    /* ---------- extra (today only) ---------- */

    setExtraField(uid, field, value) {
      updateExtras(list => list.map(r => r.uid === uid ? { ...r, [field]: value } : r));
    },

    setExtraRouteField(uid, idx, field, value) {
      updateExtras(list => list.map(r => r.uid === uid ? { ...r, routes: setAt(r.routes, idx, { [field]: value }) } : r));
    },

    saveExtraRoute(uid, idx) {
      const date = dutyDateRef.current;
      if (!date) return Promise.resolve();
      return enqueue('e-' + uid + '-' + idx, async () => {
        if (dutyDateRef.current !== date) return;
        const r = extrasRef.current.find(x => x.uid === uid);
        if (!r || r.deleted) return;
        const rec = r.routes[idx] || {};
        const payload = {
          location: rec.loc || '', out_time: rec.out || '', in_time: rec.in || '', remarks: r.remarks || '',
          extra_name: r.name || '', extra_agency: r.agency || '', extra_mobile: r.mobile || '', extra_id_no: r.id || ''
        };
        if (rec.ROWID) {
          await api.updateExtraDutyRecord({ ROWID: rec.ROWID, ...payload });
        } else {
          const result = await api.addExtraDutyRecord({ duty_date: date, seat_no: r.seatNo, route_no: idx + 1, ...payload });
          if (result.data && result.data.ROWID) actions.setExtraRouteField(uid, idx, 'ROWID', result.data.ROWID);
        }
      }).catch(err => console.error('Failed to sync extra route:', err));
    },

    // Name/agency/mobile/ID/remarks live on every route record of the extra escort.
    // If nothing is saved yet, create Route 1 so the extra row survives a reload.
    saveExtraMeta(uid) {
      const r = extrasRef.current.find(x => x.uid === uid);
      if (!r) return;
      const saved = r.routes.map((x, i) => (x && x.ROWID ? i : -1)).filter(i => i >= 0);
      (saved.length ? saved : [0]).forEach(i => actions.saveExtraRoute(uid, i));
    },

    pickExtraTime(uid, idx, field, label) {
      const r = extrasRef.current.find(x => x.uid === uid);
      const current = (r && r.routes[idx] && r.routes[idx][field]) || '';
      setPicker({
        label, value: current,
        onOk: value => {
          actions.setExtraRouteField(uid, idx, field, value);
          actions.saveExtraRoute(uid, idx);
        }
      });
    },

    async deleteExtra(uid) {
      const r = extrasRef.current.find(x => x.uid === uid);
      if (!r) return;
      // Hide now; wait for any in-flight insert so its ROWID gets deleted too.
      updateExtras(list => list.map(x => x.uid === uid ? { ...x, deleted: true } : x));
      const keys = r.routes.map((_, i) => 'e-' + uid + '-' + i);
      inFlight.current++;
      try {
        await Promise.all(keys.map(k => queues.current[k] || Promise.resolve()));
        const latest = extrasRef.current.find(x => x.uid === uid);
        for (const rec of (latest ? latest.routes : [])) {
          if (rec && rec.ROWID) {
            try { await api.deleteDutyRecord(rec.ROWID); }
            catch (err) { console.error('Failed to delete extra route:', err); }
          }
        }
        updateExtras(list => list.filter(x => x.uid !== uid));
      } finally {
        inFlight.current--;
      }
    },

    /* ---------- sunday pickup ---------- */

    setPickupField(i, field, value) {
      updatePickups(list => setAt(list, i, { [field]: value }));
    },

    savePickup(i) {
      const date = dutyDateRef.current;
      if (!date) return;
      enqueue('p-' + i, async () => {
        if (dutyDateRef.current !== date) return;
        const r = pickupsRef.current[i];
        if (!r) return;
        const payload = {
          location: r.loc || '', out_time: r.out || '', in_time: r.in || '', remarks: r.remarks || '',
          extra_name: r.name || '', extra_agency: r.agency || '', extra_mobile: r.mobile || '', extra_id_no: r.id || ''
        };
        if (r.ROWID) {
          await api.updateSundayPickupRecord({ ROWID: r.ROWID, ...payload });
        } else {
          const result = await api.addSundayPickupRecord({ duty_date: date, seat_no: i + 1, ...payload });
          if (result.data && result.data.ROWID) actions.setPickupField(i, 'ROWID', result.data.ROWID);
        }
      }).catch(err => console.error('Failed to sync pickup row:', err));
    }
  };

  async function addEscort() {
    try {
      const result = await api.addEscort({ escort_name: '', agency: '', mobile: '', id_no: '', sort_order: escortsRef.current.length });
      const rowid = result.data && result.data.ROWID;
      updateEscorts(list => [...list, { ROWID: rowid, name: '', agency: '', mobile: '', id: '' }]);
    } catch (err) {
      console.error('Failed to add escort:', err);
      alert('Database-ல புது escort add பண்ண முடியல.');
    }
  }

  function addExtra() {
    updateExtras(list => [...list, {
      uid: 'x' + (++extraUid), seatNo: extraSeatCounter.current++,
      name: '', agency: '', mobile: '', id: '', remarks: '', routes: []
    }]);
  }

  /* ---------- excel upload ---------- */

  function continueUpload(newStart) {
    setStartDate(newStart);
    setPopup(null);
    // Open the file chooser right away, while the click still counts as a user action.
    fileInputRef.current.click();
    saveStart(newStart);
  }

  async function onFileChosen(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    let newRows;
    try {
      newRows = await readEscortFile(file);
    } catch (err) {
      setPopup({ type: 'error', message: 'Could not read the file: ' + err.message });
      return;
    }
    if (!newRows.length) {
      setPopup({ type: 'error', message: 'No recognizable columns found. Expected headers like Name of Escort, Agency, Mobile No, ID No.' });
      return;
    }
    setPopup({ type: 'loading', message: 'Syncing Escorts...' });
    try {
      const result = await api.syncEscortsFromExcel(newRows);
      updateEscorts(result.data.map(escortFromDb));
      await saveStart(startDateRef.current);
      await api.markUploadDone(dutyDateRef.current);
      await loadForDate(dutyDateRef.current);
      setPopup({ type: 'success', summary: result.summary });
    } catch (err) {
      console.error('Excel sync failed:', err);
      setPopup({ type: 'error', message: 'Excel sync பண்ண முடியல: ' + (err.message || 'Internet connection check பண்ணுங்க.') });
    }
  }

  async function alreadyUploaded() {
    const date = dutyDateRef.current;
    try {
      await api.markUploadDone(date);
    } catch (err) {
      console.error('Failed to mark upload done:', err);
    }
    await applyTableData(date);
    setView('table');
  }

  /* ---------- render ---------- */

  // Month Roster day: the server sends the rows in seat order (6 to 5, then 9 to 6); no Start Date rotation.
  const displayRows = rosterDay ? escorts : computeDisplayRows(escorts, rotation, startDate, dutyDate);

  // Current data for the open trip popup (null when closed or the trip vanished).
  const tripRec = trip && duty[trip.id] && duty[trip.id].routes[trip.idx];
  const tripView = tripRec && tripRec.ROWID ? {
    rec: tripRec,
    stops: stops[String(tripRec.ROWID)] || [],
    escortName: (escorts.find(e => String(e.ROWID) === trip.id) || {}).name
  } : null;

  return (
    <>
      <div className="titlebar">
        <h1>Escort Duty Sheet</h1>
      </div>

      {isMonday(dutyDate) && <MondayReminder />}

      <Toolbar
        startDate={startDate}
        dutyDate={dutyDate}
        onStartDate={changeStartDate}
        onDutyDate={changeDutyDate}
        onUpload={() => setPopup({ type: 'setup' })}
        onPrint={() => window.print()}
        onGenerate={generate}
      />
      <input type="file" id="fileInput" ref={fileInputRef} accept=".xlsx,.xls,.csv" onChange={onFileChosen} />

      <div className="tablewrap">
        {view === 'loading' && <div className="loading-message">Loading...</div>}
        {view === 'error' && <div className="loading-message">Could not load data. Check your connection and press Generate.</div>}
        {view === 'leave' && <LeaveMessage />}
        {view === 'uploadPrompt' && (
          <UploadPrompt onUpload={() => setPopup({ type: 'setup' })} onAlreadyUploaded={alreadyUploaded} />
        )}
        {view === 'pickup' && <PickupTable pickupRows={pickupRows} actions={actions} />}
        {view === 'table' && (
          <>
            {(rosterDay ? ['6 to 5', '9 to 6'] : ['']).map(batch => (
              <DutyTable
                key={batch || 'all'}
                title={batch}
                lockDetails={rosterDay}
                displayRows={batch ? displayRows.filter(r => r.batch === batch) : displayRows}
                duty={duty}
                stops={stops}
                rotation={rotation}
                dutyDate={dutyDate}
                cellStatus={cellStatus}
                actions={actions}
              />
            ))}
            <ExtraSection extraRows={extraRows} rotation={rotation} actions={actions} />
          </>
        )}
      </div>

      <div className="addrow-bar no-print">
        {!rosterDay && <button className="btn secondary" onClick={addEscort}>+ Add Escort</button>}
        <button className="btn secondary" onClick={addExtra}>+ Add Extra (Today Only)</button>
      </div>

      <datalist id="locationSuggestions">
        {locations.map(loc => <option key={loc} value={loc} />)}
      </datalist>

      {picker && (
        <TimePicker label={picker.label} value={picker.value} onOk={picker.onOk} onClose={() => setPicker(null)} />
      )}
      {tripView && (
        <TripPopup
          escortName={tripView.escortName}
          rec={tripView.rec}
          stops={tripView.stops}
          onSaveCab={(vehicle, driver) => actions.saveTripCab(trip.id, trip.idx, vehicle, driver)}
          onSaveStop={stop => actions.saveTripStop(trip.id, trip.idx, stop)}
          onDeleteStop={rowid => actions.deleteTripStop(trip.id, trip.idx, rowid)}
          onClose={() => setTrip(null)}
        />
      )}
      {popup && popup.type === 'setup' && (
        <UploadSetupPopup
          startDate={startDate}
          onCancel={() => setPopup(null)}
          onContinue={continueUpload}
        />
      )}
      {popup && popup.type !== 'setup' && <UploadPopup state={popup} onClose={() => setPopup(null)} />}
    </>
  );
}
