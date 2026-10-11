"use strict"

const express = require('express');
const catalyst = require('zcatalyst-sdk-node');
const crypto = require('crypto');
const webpush = require('web-push');
const { ROTATION, computeDisplayRows, dayOf } = require('./seats.js');

// Push services want a contact (mailto: or https: URL) for the sender of the notifications.
const VAPID_SUBJECT = 'https://escortcardaccess-60086856508.development.catalystserverless.in';

const app = express();
app.use(express.json({ limit: '2mb' }));

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

/* ---------------- HELPERS ---------------- */

const ZCQL_PAGE = 300;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function runInBatches(items, batchSize, task) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    results.push(...await Promise.all(batch.map(task)));
    if (i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
  return results;
}

// ZCQL returns at most 300 rows per query, so page through with LIMIT offset, count.
async function selectAll(zcql, table, baseQuery) {
  const all = [];
  let offset = 1;
  for (;;) {
    const rows = await zcql.executeZCQLQuery(`${baseQuery} LIMIT ${offset}, ${ZCQL_PAGE}`);
    const page = rows.map(r => r[table]).filter(Boolean);
    all.push(...page);
    if (page.length < ZCQL_PAGE) break;
    offset += ZCQL_PAGE;
  }
  return all;
}

// Only allow YYYY-MM-DD, so a query-string value can never change the ZCQL statement.
function requireDate(value) {
  if (!DATE_RE.test(String(value || ''))) {
    throw new Error('Invalid date. Expected YYYY-MM-DD');
  }
  return value;
}

function requireRowId(value) {
  if (!/^\d+$/.test(String(value || ''))) {
    throw new Error('Invalid rowid');
  }
  return value;
}

async function getSetting(zcql, key) {
  const rows = await zcql.executeZCQLQuery(`SELECT * FROM Settings WHERE setting_key = '${key}'`);
  return rows.length > 0 ? rows[0].Settings : null;
}

async function saveSetting(catalystApp, key, value) {
  const zcql = catalystApp.zcql();
  const table = catalystApp.datastore().table('Settings');
  const existing = await getSetting(zcql, key);
  if (existing) {
    await table.updateRow({ ROWID: existing.ROWID, setting_value: value });
  } else {
    await table.insertRow({ setting_key: key, setting_value: value });
  }
}

function fail(res, err) {
  res.status(400).json({ status: 'failure', error: (err && err.message) || String(err) || 'Unknown error' });
}

/* ---------------- ESCORTS ---------------- */

app.get('/getEscorts', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const zcql = catalystApp.zcql();
    const escorts = await selectAll(zcql, 'Escorts', "SELECT * FROM Escorts WHERE is_active = 'true' ORDER BY sort_order ASC");
    res.status(200).json({ status: 'success', data: escorts });
  } catch (err) {
    fail(res, err);
  }
});

app.post('/addEscort', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const table = catalystApp.datastore().table('Escorts');
    const { escort_name, agency, mobile, id_no, sort_order } = req.body;
    const result = await table.insertRow({ escort_name, agency, mobile, id_no, sort_order: sort_order || 0, is_active: 'true' });
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    fail(res, err);
  }
});

app.put('/updateEscort', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const table = catalystApp.datastore().table('Escorts');
    const { ROWID, escort_name, agency, mobile, id_no } = req.body;
    const result = await table.updateRow({ ROWID, escort_name, agency, mobile, id_no });
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    fail(res, err);
  }
});

app.delete('/deleteEscort', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const table = catalystApp.datastore().table('Escorts');
    const rowid = requireRowId(req.query.rowid);
    const result = await table.deleteRow(rowid);
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    fail(res, err);
  }
});

/* ---------------- DUTY RECORDS ---------------- */

app.get('/getDutyRecords', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const zcql = catalystApp.zcql();
    const date = requireDate(req.query.date);
    const records = await selectAll(zcql, 'DutyRecords', `SELECT * FROM DutyRecords WHERE duty_date = '${date}' ORDER BY ROWID ASC`);
    res.status(200).json({ status: 'success', data: records });
  } catch (err) {
    fail(res, err);
  }
});

app.post('/addDutyRecord', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const table = catalystApp.datastore().table('DutyRecords');
    const { duty_date, escort_id, seat_no, route_no, location, out_time, in_time, remarks } = req.body;
    const result = await table.insertRow({
      duty_date, escort_id, seat_no, route_no, location, out_time, in_time, remarks
    });
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    fail(res, err);
  }
});

app.put('/updateDutyRecord', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const table = catalystApp.datastore().table('DutyRecords');
    const { ROWID, location, out_time, in_time, remarks } = req.body;
    const row = { ROWID, location, out_time, in_time };
    // Only route 1 carries remarks; leave the column untouched when it isn't sent.
    if (remarks !== undefined) row.remarks = remarks;
    const result = await table.updateRow(row);
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    fail(res, err);
  }
});

app.delete('/deleteDutyRecord', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const table = catalystApp.datastore().table('DutyRecords');
    const rowid = requireRowId(req.query.rowid);
    const result = await table.deleteRow(rowid);
    // A trip's employee stops go with it.
    const stopTable = catalystApp.datastore().table('TripStops');
    const stops = await selectAll(catalystApp.zcql(), 'TripStops', `SELECT ROWID FROM TripStops WHERE duty_record_id = ${rowid} ORDER BY ROWID ASC`);
    await runInBatches(stops.map(s => s.ROWID), 10, id => stopTable.deleteRow(id));
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    fail(res, err);
  }
});

/* ---------------- TRIP DETAILS (cab + employee stops) ---------------- */

// Cab details live on the trip (DutyRecords row) — one copy per trip.
app.put('/updateTripCab', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const table = catalystApp.datastore().table('DutyRecords');
    const { ROWID, vehicle_no, driver_name } = req.body;
    const result = await table.updateRow({ ROWID: requireRowId(ROWID), vehicle_no, driver_name });
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    fail(res, err);
  }
});

app.get('/getTripStops', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const zcql = catalystApp.zcql();
    const date = requireDate(req.query.date);
    const records = await selectAll(zcql, 'TripStops', `SELECT * FROM TripStops WHERE duty_date = '${date}' ORDER BY CREATEDTIME ASC`);
    res.status(200).json({ status: 'success', data: records });
  } catch (err) {
    fail(res, err);
  }
});

// Everything the duty sheet needs for one day in a single call (4 SELECTs instead of 5 calls).
// Extra rows are DutyRecords too, so the frontend splits them out of `duty`.
app.get('/getDayData', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const zcql = catalystApp.zcql();
    const date = requireDate(req.query.date);
    const [escorts, duty, stops, cardIn] = await Promise.all([
      selectAll(zcql, 'Escorts', "SELECT * FROM Escorts WHERE is_active = 'true' ORDER BY sort_order ASC"),
      selectAll(zcql, 'DutyRecords', `SELECT * FROM DutyRecords WHERE duty_date = '${date}' ORDER BY ROWID ASC`),
      selectAll(zcql, 'TripStops', `SELECT * FROM TripStops WHERE duty_date = '${date}' ORDER BY CREATEDTIME ASC`),
      selectAll(zcql, 'AccessLog', `SELECT escort_id, punch_time FROM AccessLog WHERE duty_date = '${date}' AND direction = 'IN' ORDER BY CREATEDTIME ASC`)
    ]);
    res.status(200).json({ status: 'success', data: { escorts, duty, stops, cardIn } });
  } catch (err) {
    fail(res, err);
  }
});

// Dashboard: every trip that has started (Out time set) and its employee stops in a date range.
// Escorts includes inactive ones so old trips still show the guard's name.
app.get('/getDashboard', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const zcql = catalystApp.zcql();
    const from = requireDate(req.query.from);
    const to = requireDate(req.query.to);
    const [escorts, trips, stops] = await Promise.all([
      selectAll(zcql, 'Escorts', 'SELECT ROWID, escort_name, agency FROM Escorts ORDER BY ROWID ASC'),
      selectAll(zcql, 'DutyRecords', `SELECT * FROM DutyRecords WHERE duty_date >= '${from}' AND duty_date <= '${to}' AND out_time != '' ORDER BY ROWID ASC`),
      selectAll(zcql, 'TripStops', `SELECT * FROM TripStops WHERE duty_date >= '${from}' AND duty_date <= '${to}' ORDER BY CREATEDTIME ASC`)
    ]);
    res.status(200).json({ status: 'success', data: { escorts, trips, stops } });
  } catch (err) {
    fail(res, err);
  }
});

app.post('/addTripStop', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const table = catalystApp.datastore().table('TripStops');
    const { duty_record_id, duty_date, escort_id, emp_id, location, trip_type, stop_time } = req.body;
    const result = await table.insertRow({
      duty_record_id: requireRowId(duty_record_id), duty_date: requireDate(duty_date),
      escort_id, emp_id, location, trip_type, stop_time
    });
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    fail(res, err);
  }
});

app.put('/updateTripStop', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const table = catalystApp.datastore().table('TripStops');
    const { ROWID, emp_id, location, trip_type, stop_time } = req.body;
    const result = await table.updateRow({ ROWID: requireRowId(ROWID), emp_id, location, trip_type, stop_time });
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    fail(res, err);
  }
});

app.delete('/deleteTripStop', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const table = catalystApp.datastore().table('TripStops');
    const result = await table.deleteRow(requireRowId(req.query.rowid));
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    fail(res, err);
  }
});

/* ---------------- EXTRA (TODAY ONLY) ENTRIES ---------------- */

app.get('/getExtraDutyRecords', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const zcql = catalystApp.zcql();
    const date = requireDate(req.query.date);
    const records = await selectAll(zcql, 'DutyRecords', `SELECT * FROM DutyRecords WHERE duty_date = '${date}' AND is_extra = 'true' ORDER BY ROWID ASC`);
    res.status(200).json({ status: 'success', data: records });
  } catch (err) {
    fail(res, err);
  }
});

app.post('/addExtraDutyRecord', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const table = catalystApp.datastore().table('DutyRecords');
    const {
      duty_date, seat_no, route_no, location, out_time, in_time, remarks,
      extra_name, extra_agency, extra_mobile, extra_id_no
    } = req.body;
    const result = await table.insertRow({
      duty_date, escort_id: 0, seat_no, route_no, location, out_time, in_time, remarks,
      is_extra: 'true', extra_name, extra_agency, extra_mobile, extra_id_no
    });
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    fail(res, err);
  }
});

app.put('/updateExtraDutyRecord', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const table = catalystApp.datastore().table('DutyRecords');
    const {
      ROWID, location, out_time, in_time, remarks,
      extra_name, extra_agency, extra_mobile, extra_id_no
    } = req.body;
    const result = await table.updateRow({
      ROWID, location, out_time, in_time, remarks,
      extra_name, extra_agency, extra_mobile, extra_id_no
    });
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    fail(res, err);
  }
});

/* ---------------- SUNDAY MORNING PICKUP ---------------- */

app.get('/getSundayPickupRecords', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const zcql = catalystApp.zcql();
    const date = requireDate(req.query.date);
    const records = await selectAll(zcql, 'DutyRecords', `SELECT * FROM DutyRecords WHERE duty_date = '${date}' AND is_sunday_pickup = 'true' ORDER BY seat_no ASC`);
    res.status(200).json({ status: 'success', data: records });
  } catch (err) {
    fail(res, err);
  }
});

app.post('/addSundayPickupRecord', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const table = catalystApp.datastore().table('DutyRecords');
    const {
      duty_date, seat_no, location, out_time, in_time, remarks,
      extra_name, extra_agency, extra_mobile, extra_id_no
    } = req.body;
    const result = await table.insertRow({
      duty_date, escort_id: 0, seat_no, route_no: 1, location, out_time, in_time, remarks,
      is_sunday_pickup: 'true', extra_name, extra_agency, extra_mobile, extra_id_no
    });
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    fail(res, err);
  }
});

app.put('/updateSundayPickupRecord', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const table = catalystApp.datastore().table('DutyRecords');
    const {
      ROWID, location, out_time, in_time, remarks,
      extra_name, extra_agency, extra_mobile, extra_id_no
    } = req.body;
    const result = await table.updateRow({
      ROWID, location, out_time, in_time, remarks,
      extra_name, extra_agency, extra_mobile, extra_id_no
    });
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    fail(res, err);
  }
});

/* ---------------- SETTINGS (Start Date + Upload Tracking) ---------------- */

app.get('/getStartDate', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const row = await getSetting(catalystApp.zcql(), 'start_date');
    res.status(200).json({ status: 'success', data: row ? row.setting_value : null });
  } catch (err) {
    fail(res, err);
  }
});

app.post('/saveStartDate', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    await saveSetting(catalystApp, 'start_date', requireDate(req.body.value));
    res.status(200).json({ status: 'success' });
  } catch (err) {
    fail(res, err);
  }
});

app.get('/getLastUploadDate', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const row = await getSetting(catalystApp.zcql(), 'last_upload_date');
    res.status(200).json({ status: 'success', data: row ? row.setting_value : null });
  } catch (err) {
    fail(res, err);
  }
});

app.post('/markUploadDone', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    await saveSetting(catalystApp, 'last_upload_date', requireDate(req.body.value));
    res.status(200).json({ status: 'success' });
  } catch (err) {
    fail(res, err);
  }
});

/* ---------------- SMART EXCEL SYNC (optimized — skips unnecessary updates) ---------------- */

app.post('/syncEscortsFromExcel', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const table = catalystApp.datastore().table('Escorts');
    const zcql = catalystApp.zcql();

    const incoming = req.body.escorts || [];

    const existingRows = await selectAll(zcql, 'Escorts', 'SELECT * FROM Escorts ORDER BY ROWID ASC');

    const existingByMobile = {};
    existingRows.forEach(r => {
      if (r.mobile) existingByMobile[String(r.mobile).trim()] = r;
    });

    const incomingMobiles = new Set(
      incoming.map(e => String(e.mobile || '').trim()).filter(Boolean)
    );

    const toInsert = [];
    const toReactivate = [];
    const toUpdateOrder = [];

    incoming.forEach((e, idx) => {
      const m = String(e.mobile || '').trim();
      if (!m) return;
      const existing = existingByMobile[m];
      if (!existing) {
        toInsert.push({ ...e, sort_order: idx });
      } else if (existing.is_active !== 'true') {
        // Reactivated escorts also take their new position from the Excel order.
        toReactivate.push({ ROWID: existing.ROWID, sort_order: idx });
      } else if ((parseInt(existing.sort_order) || 0) !== idx) {
        toUpdateOrder.push({ ROWID: existing.ROWID, sort_order: idx });
      }
    });

    const toDeactivate = existingRows.filter(r => {
      const m = String(r.mobile || '').trim();
      return m && !incomingMobiles.has(m) && r.is_active === 'true';
    });

    await runInBatches(toInsert, 5, e => table.insertRow({
      escort_name: e.name || '',
      agency: e.agency || '',
      mobile: e.mobile || '',
      id_no: e.id || '',
      is_active: 'true',
      sort_order: e.sort_order
    }));

    await runInBatches(toReactivate, 5, r => table.updateRow({ ROWID: r.ROWID, is_active: 'true', sort_order: r.sort_order }));

    await runInBatches(toDeactivate, 5, r => table.updateRow({ ROWID: r.ROWID, is_active: 'false' }));

    await runInBatches(toUpdateOrder, 5, r => table.updateRow({ ROWID: r.ROWID, sort_order: r.sort_order }));

    await new Promise(resolve => setTimeout(resolve, 1500));

    const activeRows = await selectAll(zcql, 'Escorts', "SELECT * FROM Escorts WHERE is_active = 'true' ORDER BY sort_order ASC");

    res.status(200).json({
      status: 'success',
      data: activeRows,
      summary: {
        added: toInsert.length,
        reactivated: toReactivate.length,
        deactivated: toDeactivate.length,
        reordered: toUpdateOrder.length
      }
    });
  } catch (err) {
    fail(res, err);
  }
});

/* ---------------- LOCATION AUTOCOMPLETE ---------------- */

app.get('/getAllLocations', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const zcql = catalystApp.zcql();
    const rows = await selectAll(zcql, 'DutyRecords', "SELECT DISTINCT location FROM DutyRecords WHERE location != ''");
    const locations = rows.map(r => r.location).filter(Boolean);
    res.status(200).json({ status: 'success', data: locations });
  } catch (err) {
    fail(res, err);
  }
});

/* ---------------- ACCESS CARD (dummy AccessLog until the real card system is allowed) ---------------- */

// Same rule as dutyDayStr() in frontend/src/utils.js.
const SHIFT_END_HOUR = 8;
const IST_OFFSET_MIN = 330;

// The function server runs in UTC, so shift to India time first and read the UTC fields.
function istNow() {
  const d = new Date(Date.now() + IST_OFFSET_MIN * 60000);
  const pad = n => String(n).padStart(2, '0');
  const time = pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes());
  // A swipe before 08:00 belongs to the previous day's night duty (not on Sunday: Saturday is leave).
  if (d.getUTCHours() < SHIFT_END_HOUR && d.getUTCDay() !== 0) d.setUTCDate(d.getUTCDate() - 1);
  const dutyDate = d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  return { time, dutyDate };
}

// Guard's seat number (1-based) on the duty sheet of that day, or null on Saturday / Sunday
// (leave / pickup sheet, no rotation seats). Same order as the duty sheet: active escorts by
// sort_order, rotated from the saved Start Date.
function seatOf(escorts, escortId, startDate, dutyDate) {
  const day = dayOf(dutyDate);
  if (day === 0 || day === 6) return null;
  const rows = computeDisplayRows(escorts, ROTATION, startDate, dutyDate);
  const idx = rows.findIndex(e => String(e.ROWID) === String(escortId));
  return idx < 0 ? null : idx + 1;
}

// First IN of the duty day → "✅ IN 19:42 · Today your Seat 5" on the guard's phones.
// Later INs the same duty day (card swiped again after a break) send nothing.
async function onCardIn(catalystApp, escortId, time, dutyDate) {
  const zcql = catalystApp.zcql();
  const ins = await zcql.executeZCQLQuery(`SELECT ROWID FROM AccessLog WHERE escort_id = ${escortId} AND duty_date = '${dutyDate}' AND direction = 'IN'`);
  if (ins.length > 1) return { skipped: 'already IN today' };

  const [escorts, start] = await Promise.all([
    selectAll(zcql, 'Escorts', "SELECT ROWID, guard_token FROM Escorts WHERE is_active = 'true' ORDER BY sort_order ASC"),
    getSetting(zcql, 'start_date')
  ]);
  const me = escorts.find(e => String(e.ROWID) === String(escortId));
  const seat = seatOf(escorts, escortId, start && start.setting_value, dutyDate);
  const result = await sendPushToEscort(catalystApp, escortId, {
    title: '✅ IN ' + time,
    body: seat ? 'Today your Seat ' + seat : 'Your card IN is noted.',
    url: me && me.guard_token ? 'index.html#guard/' + me.guard_token : 'index.html'
  });
  return { ...result, seat };
}

// One door: the Card Simulator posts here today; the real access system can post here later.
app.post('/addAccessLog', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const escort_id = requireRowId(req.body.escort_id);
    const direction = String(req.body.direction || '').toUpperCase();
    if (direction !== 'IN' && direction !== 'OUT') throw new Error('direction must be IN or OUT');
    const source = req.body.source === 'REAL' ? 'REAL' : 'SIMULATOR';
    const { time, dutyDate } = istNow();
    const result = await catalystApp.datastore().table('AccessLog').insertRow({
      escort_id, direction, punch_time: time, duty_date: dutyDate, source
    });
    // The swipe is already saved; a push problem must not fail it.
    let push = null;
    if (direction === 'IN') {
      try {
        push = await onCardIn(catalystApp, escort_id, time, dutyDate);
      } catch (err) {
        console.error('Card IN push failed:', err);
        push = { error: err.message || String(err) };
      }
    }
    res.status(200).json({ status: 'success', data: result, push });
  } catch (err) {
    fail(res, err);
  }
});

app.get('/getAccessLog', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const zcql = catalystApp.zcql();
    const date = requireDate(req.query.date);
    const rows = await selectAll(zcql, 'AccessLog', `SELECT * FROM AccessLog WHERE duty_date = '${date}' ORDER BY CREATEDTIME ASC`);
    res.status(200).json({ status: 'success', data: rows });
  } catch (err) {
    fail(res, err);
  }
});

/* ---------------- GUARD LINKS + WEB PUSH ---------------- */

const TOKEN_RE = /^[0-9a-f]{32}$/;

// The secret part of a guard link. Only hex, so it is also safe inside a ZCQL string.
function requireToken(value) {
  if (!TOKEN_RE.test(String(value || ''))) throw new Error('Invalid link');
  return value;
}

// VAPID keys = this app's ID card for the push services (Google / Apple / Mozilla).
// Kept in the Settings table, not in catalyst-config.json, because that file is on public GitHub.
// Made once on first use; cached while this function instance stays warm (saves reads).
let vapidCache = null;
async function getVapidKeys(catalystApp) {
  if (vapidCache) return vapidCache;
  const zcql = catalystApp.zcql();
  const [pub, priv] = await Promise.all([getSetting(zcql, 'vapid_public_key'), getSetting(zcql, 'vapid_private_key')]);
  if (pub && priv) {
    vapidCache = { publicKey: pub.setting_value, privateKey: priv.setting_value };
  } else {
    vapidCache = webpush.generateVAPIDKeys();
    await saveSetting(catalystApp, 'vapid_public_key', vapidCache.publicKey);
    await saveSetting(catalystApp, 'vapid_private_key', vapidCache.privateKey);
  }
  // The public key is 87 characters. Settings.setting_value must be varchar(255):
  // at varchar(50) it was cut short and the browser refused it.
  if (vapidCache.publicKey.length !== 87) {
    vapidCache = null;
    throw new Error('Push key in Settings is damaged (column too short?). Delete the vapid_* rows to make new keys.');
  }
  return vapidCache;
}

async function escortByToken(zcql, token) {
  const rows = await zcql.executeZCQLQuery(`SELECT ROWID, escort_name FROM Escorts WHERE guard_token = '${requireToken(token)}'`);
  if (rows.length === 0) throw new Error('This link is not valid any more. Ask your supervisor for a new one.');
  return rows[0].Escorts;
}

// Sends one notification to every phone the guard has set up.
// A phone that uninstalled / blocked us answers 404 or 410: drop that subscription.
async function sendPushToEscort(catalystApp, escortId, payload) {
  const keys = await getVapidKeys(catalystApp);
  const subs = await selectAll(catalystApp.zcql(), 'PushSubscriptions', `SELECT ROWID, subscription_json FROM PushSubscriptions WHERE escort_id = ${requireRowId(escortId)} ORDER BY ROWID ASC`);
  const table = catalystApp.datastore().table('PushSubscriptions');
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(JSON.parse(s.subscription_json), JSON.stringify(payload), {
        vapidDetails: { subject: VAPID_SUBJECT, publicKey: keys.publicKey, privateKey: keys.privateKey },
        TTL: 60 * 60
      });
      sent++;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) await table.deleteRow(s.ROWID);
      else console.error('Push failed:', err.statusCode, err.body || err.message);
    }
  }
  return { phones: subs.length, sent };
}

// Supervisor page: every active guard, their link token and how many phones are set up.
app.get('/getGuardLinks', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const zcql = catalystApp.zcql();
    const [escorts, subs] = await Promise.all([
      selectAll(zcql, 'Escorts', "SELECT ROWID, escort_name, agency, guard_token FROM Escorts WHERE is_active = 'true' ORDER BY sort_order ASC"),
      selectAll(zcql, 'PushSubscriptions', 'SELECT escort_id FROM PushSubscriptions ORDER BY ROWID ASC')
    ]);
    const phones = {};
    subs.forEach(s => { phones[String(s.escort_id)] = (phones[String(s.escort_id)] || 0) + 1; });
    const data = escorts.map(e => ({ ...e, phones: phones[String(e.ROWID)] || 0 }));
    res.status(200).json({ status: 'success', data });
  } catch (err) {
    fail(res, err);
  }
});

// Gives the guard a secret token once; pressing again returns the same link.
app.post('/createGuardLink', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const zcql = catalystApp.zcql();
    const escortId = requireRowId(req.body.escort_id);
    const rows = await zcql.executeZCQLQuery(`SELECT guard_token FROM Escorts WHERE ROWID = ${escortId}`);
    if (rows.length === 0) throw new Error('Escort not found');
    let token = rows[0].Escorts.guard_token;
    if (!token) {
      token = crypto.randomBytes(16).toString('hex');
      await catalystApp.datastore().table('Escorts').updateRow({ ROWID: escortId, guard_token: token });
    }
    res.status(200).json({ status: 'success', data: { token } });
  } catch (err) {
    fail(res, err);
  }
});

// Guard setup page: whose link is this + the public key the phone needs to subscribe.
app.get('/guardInfo', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const escort = await escortByToken(catalystApp.zcql(), req.query.t);
    const keys = await getVapidKeys(catalystApp);
    res.status(200).json({ status: 'success', data: { escort_name: escort.escort_name, vapidPublicKey: keys.publicKey } });
  } catch (err) {
    fail(res, err);
  }
});

// Saves the phone's push address. The same phone pressing Allow again is not saved twice.
app.post('/saveSubscription', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const zcql = catalystApp.zcql();
    const escort = await escortByToken(zcql, req.body.t);
    const sub = req.body.subscription;
    if (!sub || typeof sub.endpoint !== 'string' || !sub.endpoint.startsWith('https://') || !sub.keys) {
      throw new Error('Invalid subscription');
    }
    const device = ['android', 'iphone'].includes(req.body.device) ? req.body.device : 'other';
    const existing = await selectAll(zcql, 'PushSubscriptions', `SELECT ROWID, subscription_json FROM PushSubscriptions WHERE escort_id = ${escort.ROWID} ORDER BY ROWID ASC`);
    const same = existing.find(s => {
      try { return JSON.parse(s.subscription_json).endpoint === sub.endpoint; } catch { return false; }
    });
    if (!same) {
      await catalystApp.datastore().table('PushSubscriptions').insertRow({
        escort_id: escort.ROWID, subscription_json: JSON.stringify(sub), device
      });
    }
    res.status(200).json({ status: 'success', data: { saved: !same } });
  } catch (err) {
    fail(res, err);
  }
});

// "Send test notification" button on the setup page, so the guard sees it works right away.
app.post('/testPush', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const escort = await escortByToken(catalystApp.zcql(), req.body.t);
    const result = await sendPushToEscort(catalystApp, escort.ROWID, {
      title: '🔔 Test notification',
      body: 'Hi ' + escort.escort_name + ', notifications are working.',
      url: 'index.html#setup/' + req.body.t
    });
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    fail(res, err);
  }
});

/* ---------------- TEMPORARY TESTING UTILITY ---------------- */

// POST (not GET) so a link preview, prefetch or browser history visit can never wipe the data.
app.post('/wipeAllData', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const zcql = catalystApp.zcql();
    const escortTable = catalystApp.datastore().table('Escorts');
    const dutyTable = catalystApp.datastore().table('DutyRecords');
    const stopTable = catalystApp.datastore().table('TripStops');

    const escorts = (await selectAll(zcql, 'Escorts', 'SELECT ROWID FROM Escorts ORDER BY ROWID ASC')).map(r => r.ROWID);
    const dutyRecords = (await selectAll(zcql, 'DutyRecords', 'SELECT ROWID FROM DutyRecords ORDER BY ROWID ASC')).map(r => r.ROWID);
    const tripStops = (await selectAll(zcql, 'TripStops', 'SELECT ROWID FROM TripStops ORDER BY ROWID ASC')).map(r => r.ROWID);

    await runInBatches(escorts, 10, id => escortTable.deleteRow(id));
    await runInBatches(dutyRecords, 10, id => dutyTable.deleteRow(id));
    await runInBatches(tripStops, 10, id => stopTable.deleteRow(id));

    res.status(200).json({
      status: 'success',
      deleted: { escorts: escorts.length, dutyRecords: dutyRecords.length, tripStops: tripStops.length }
    });
  } catch (err) {
    res.status(400).json({
      status: 'failure',
      error: err.message || err.toString() || 'Unknown error',
      fullError: JSON.stringify(err, Object.getOwnPropertyNames(err))
    });
  }
});

module.exports = app;
