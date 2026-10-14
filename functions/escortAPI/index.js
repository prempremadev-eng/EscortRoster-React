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

// Everything the duty sheet needs for one day in a single call (3 SELECTs instead of 4 calls).
// Extra rows are DutyRecords too, so the frontend splits them out of `duty`.
app.get('/getDayData', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const zcql = catalystApp.zcql();
    const date = requireDate(req.query.date);
    const [escorts, duty, stops] = await Promise.all([
      selectAll(zcql, 'Escorts', "SELECT * FROM Escorts WHERE is_active = 'true' ORDER BY sort_order ASC"),
      selectAll(zcql, 'DutyRecords', `SELECT * FROM DutyRecords WHERE duty_date = '${date}' ORDER BY ROWID ASC`),
      selectAll(zcql, 'TripStops', `SELECT * FROM TripStops WHERE duty_date = '${date}' ORDER BY CREATEDTIME ASC`)
    ]);
    res.status(200).json({ status: 'success', data: { escorts, duty, stops } });
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

// First IN of the duty day → a notification on the guard's phones. What it says depends on the
// guard's duty type in the Guards master:
//   ESCORT → "✅ IN 19:42 · Today your Seat 5" (seat from the escort duty sheet)
//   POST   → "✅ IN 08:02 · Today your post: Gate 3"
// Later INs the same duty day (card swiped again after a break) send nothing.
async function onCardIn(catalystApp, guard, time, dutyDate) {
  const zcql = catalystApp.zcql();
  const ins = await zcql.executeZCQLQuery(`SELECT ROWID FROM AccessLog WHERE guard_id = ${guard.ROWID} AND duty_date = '${dutyDate}' AND direction = 'IN'`);
  if (ins.length > 1) return { skipped: 'already IN today' };

  let body = 'Your card IN is noted.';
  let seat = null;
  if (guard.duty_type === 'ESCORT' && guard.escort_id) {
    // Read-only look at the escort duty sheet; nothing is written on the escort side.
    const [escorts, start] = await Promise.all([
      selectAll(zcql, 'Escorts', "SELECT ROWID FROM Escorts WHERE is_active = 'true' ORDER BY sort_order ASC"),
      getSetting(zcql, 'start_date')
    ]);
    seat = seatOf(escorts, guard.escort_id, start && start.setting_value, dutyDate);
    if (seat) body = 'Today your Seat ' + seat;
  } else if (guard.duty_type === 'POST' && guard.post_name) {
    body = 'Today your post: ' + guard.post_name;
  }
  const result = await sendPushToGuard(catalystApp, guard.ROWID, {
    title: '✅ IN ' + time,
    body,
    url: guard.guard_token ? 'index.html#guard/' + guard.guard_token : 'index.html'
  });
  return { ...result, seat };
}

// One door: the Card Simulator posts here today; the real access system can post here later.
app.post('/addAccessLog', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const guard = await guardById(catalystApp.zcql(), req.body.guard_id);
    if (guard.is_active !== 'true') throw new Error(guard.guard_name + ' is not active');
    const direction = String(req.body.direction || '').toUpperCase();
    if (direction !== 'IN' && direction !== 'OUT') throw new Error('direction must be IN or OUT');
    const source = req.body.source === 'REAL' ? 'REAL' : 'SIMULATOR';
    const { time, dutyDate } = istNow();
    const result = await catalystApp.datastore().table('AccessLog').insertRow({
      guard_id: guard.ROWID, direction, punch_time: time, duty_date: dutyDate, source
    });
    // The swipe is already saved; a push problem must not fail it.
    let push = null;
    if (direction === 'IN') {
      try {
        push = await onCardIn(catalystApp, guard, time, dutyDate);
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

// Guard page (opened from the IN notification).
// Locked until this guard's card IN for the running duty day. The duty day switches at 08:00,
// so the page locks itself next morning and needs a new IN.
// POST guard → their post. ESCORT guard → the day's seat list from the escort duty sheet.
// Seats never shift: a guard who is not IN yet stays as an EMPTY row, and their name is not sent.
app.get('/guardDay', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const zcql = catalystApp.zcql();
    const me = await guardByToken(zcql, req.query.t);
    const dutyDate = dutyDateFor(req, req.query.date);

    // First IN time of each guard (by Guards ROWID) on this duty day.
    const ins = await selectAll(zcql, 'AccessLog', `SELECT guard_id, punch_time FROM AccessLog WHERE duty_date = '${dutyDate}' AND direction = 'IN' ORDER BY CREATEDTIME ASC`);
    const inTime = {};
    ins.forEach(r => { if (!inTime[String(r.guard_id)]) inTime[String(r.guard_id)] = r.punch_time; });
    const myId = String(me.ROWID);
    const base = { name: me.guard_name, dutyType: me.duty_type, postName: me.post_name || null, dutyDate };
    if (!inTime[myId]) {
      return res.status(200).json({ status: 'success', data: { ...base, locked: true } });
    }

    const day = dayOf(dutyDate);
    if (me.duty_type !== 'ESCORT' || !me.escort_id || day === 0 || day === 6) {
      return res.status(200).json({ status: 'success', data: { ...base, locked: false, inTime: inTime[myId], seats: [] } });
    }
    const [escorts, start, escortGuards, records, dayStops] = await Promise.all([
      selectAll(zcql, 'Escorts', "SELECT ROWID, escort_name, agency FROM Escorts WHERE is_active = 'true' ORDER BY sort_order ASC"),
      getSetting(zcql, 'start_date'),
      selectAll(zcql, 'Guards', "SELECT ROWID, escort_id FROM Guards WHERE duty_type = 'ESCORT' ORDER BY ROWID ASC"),
      dayRoutes(zcql, dutyDate),
      selectAll(zcql, 'TripStops', `SELECT ROWID, duty_record_id, escort_id, emp_id, location, trip_type, stop_time FROM TripStops WHERE duty_date = '${dutyDate}' ORDER BY CREATEDTIME ASC`)
    ]);
    // Seats are escort rows; swipes are guard rows. Escorts ROWID → that guard's IN time.
    const escortIn = {};
    escortGuards.forEach(g => { if (g.escort_id && inTime[String(g.ROWID)]) escortIn[String(g.escort_id)] = inTime[String(g.ROWID)]; });
    const myEscortId = String(me.escort_id);
    // The whole duty sheet of the day in the supervisor's layout; only the guard's own row can be
    // changed (the write routes below check that). Other rows send no employee details, only how
    // many employees a trip has. Mobile and ID numbers are left out: every guard sees this page.
    const stopCount = {};
    dayStops.forEach(x => { stopCount[String(x.duty_record_id)] = (stopCount[String(x.duty_record_id)] || 0) + 1; });
    const byEscort = {};
    records.forEach(r => { (byEscort[String(r.escort_id)] = byEscort[String(r.escort_id)] || []).push(r); });
    const rows = computeDisplayRows(escorts, ROTATION, start && start.setting_value, dutyDate);
    const sheet = rows.map((e, i) => {
      const id = String(e.ROWID);
      const recs = byEscort[id] || [];
      const first = recs.find(r => (parseInt(r.route_no, 10) || 1) === 1);
      return {
        escortId: id, seat: i + 1, me: id === myEscortId, name: e.escort_name, agency: e.agency,
        inTime: escortIn[id] || null, remarks: (first && first.remarks) || '',
        routes: Array.from({ length: ROUTES }, (_, k) => {
          const r = recs.find(x => (parseInt(x.route_no, 10) || 1) === k + 1);
          return r ? {
            ROWID: r.ROWID, loc: r.location || '', out: r.out_time || '', in: r.in_time || '',
            vehicle: r.vehicle_no || '', driver: r.driver_name || '', stopCount: stopCount[String(r.ROWID)] || 0
          } : null;
        })
      };
    });
    const stops = dayStops.filter(x => String(x.escort_id) === myEscortId);
    res.status(200).json({ status: 'success', data: { ...base, locked: false, inTime: inTime[myId], sheet, stops } });
  } catch (err) {
    fail(res, err);
  }
});

/* ---------------- MY DUTY (escort guard fills their own trips from the phone) ---------------- */
// Writes only escort data (DutyRecords / TripStops), only the guard's own escort row,
// only for the running duty day, and only after their card IN. The supervisor's
// duty sheet shows the same rows after Refresh.

const ROUTES = 4;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// Testing on `catalyst serve` only: ?date= / body.date pretends it is that duty day.
function dutyDateFor(req, wanted) {
  const local = /^localhost(:\d+)?$/.test(req.get('host') || '');
  return local && wanted ? requireDate(wanted) : istNow().dutyDate;
}

function optionalTime(value, label) {
  const t = String(value || '').trim();
  if (t && !TIME_RE.test(t)) throw new Error(label + ': use HH:MM (24 hours)');
  return t;
}

// Main-sheet trips (routes 1..4) of a duty day, without the Extra and Sunday pickup rows.
// With escortId: only that escort's trips.
async function dayRoutes(zcql, dutyDate, escortId) {
  const only = escortId ? ` AND escort_id = ${requireRowId(escortId)}` : '';
  const records = await selectAll(zcql, 'DutyRecords', `SELECT ROWID, escort_id, route_no, seat_no, location, out_time, in_time, remarks, vehicle_no, driver_name, is_extra, is_sunday_pickup FROM DutyRecords WHERE duty_date = '${dutyDate}'${only} ORDER BY ROWID ASC`);
  return records.filter(r => r.is_extra !== 'true' && r.is_sunday_pickup !== 'true');
}

// The escort row's trips and their employee stops for one duty day.
async function myTrips(zcql, escortId, dutyDate) {
  const [routes, stops] = await Promise.all([
    dayRoutes(zcql, dutyDate, escortId),
    selectAll(zcql, 'TripStops', `SELECT ROWID, duty_record_id, emp_id, location, trip_type, stop_time FROM TripStops WHERE duty_date = '${dutyDate}' AND escort_id = ${escortId} ORDER BY CREATEDTIME ASC`)
  ]);
  const ids = new Set(routes.map(r => String(r.ROWID)));
  return { routes, stops: stops.filter(x => ids.has(String(x.duty_record_id))) };
}

// Every My Duty write starts here: valid link, ESCORT guard, card IN on this duty day, weekday seat.
async function guardOnDuty(zcql, req) {
  const b = req.body || {};
  const me = await guardByToken(zcql, b.t);
  if (me.duty_type !== 'ESCORT' || !me.escort_id) throw new Error('Only escort guards fill trips');
  const dutyDate = dutyDateFor(req, b.date);
  const day = dayOf(dutyDate);
  if (day === 0 || day === 6) throw new Error('No escort trips on Saturday / Sunday');
  const ins = await zcql.executeZCQLQuery(`SELECT ROWID FROM AccessLog WHERE guard_id = ${me.ROWID} AND duty_date = '${dutyDate}' AND direction = 'IN'`);
  if (!ins.length) throw new Error('Your card is not IN for this duty day');
  return { me, dutyDate, ...(await myTrips(zcql, me.escort_id, dutyDate)) };
}

function requireRouteNo(value) {
  const n = parseInt(value, 10);
  if (!(n >= 1 && n <= ROUTES)) throw new Error('Route must be 1 to ' + ROUTES);
  return n;
}

const routeOf = (routes, n) => routes.find(r => (parseInt(r.route_no, 10) || 1) === n);

// Save one route: Location → Out → In, in that order (same locks as the duty sheet).
app.post('/guardSaveRoute', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const zcql = catalystApp.zcql();
    const ctx = await guardOnDuty(zcql, req);
    const b = req.body;
    const n = requireRouteNo(b.route_no);
    const location = String(b.location || '').trim().slice(0, 100);
    const out_time = optionalTime(b.out_time, 'Out');
    const in_time = optionalTime(b.in_time, 'In');
    if (n > 1) {
      const prev = routeOf(ctx.routes, n - 1);
      if (!prev || !prev.out_time || !prev.in_time) throw new Error('Finish Route ' + (n - 1) + ' first (Out and In)');
    }
    if (out_time && !location) throw new Error('Location first, then Out');
    if (in_time && !out_time) throw new Error('Out first, then In');

    const table = catalystApp.datastore().table('DutyRecords');
    const current = routeOf(ctx.routes, n);
    let result;
    if (current) {
      result = await table.updateRow({ ROWID: current.ROWID, location, out_time, in_time });
    } else {
      // Seat on the sheet for this day, so the supervisor sees it on the right row.
      const [escorts, start] = await Promise.all([
        selectAll(zcql, 'Escorts', "SELECT ROWID FROM Escorts WHERE is_active = 'true' ORDER BY sort_order ASC"),
        getSetting(zcql, 'start_date')
      ]);
      const seat = seatOf(escorts, ctx.me.escort_id, start && start.setting_value, ctx.dutyDate);
      if (!seat) throw new Error('You have no seat on the duty sheet today');
      result = await table.insertRow({
        duty_date: ctx.dutyDate, escort_id: ctx.me.escort_id, seat_no: seat, route_no: n, location, out_time, in_time
      });
    }
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    fail(res, err);
  }
});

// A route's trip (cab + employees) opens once that route has an Out time.
function tripFor(ctx, routeNo) {
  const rec = routeOf(ctx.routes, requireRouteNo(routeNo));
  if (!rec || !rec.out_time) throw new Error('Save the Out time of this route first');
  return rec;
}

app.post('/guardSaveCab', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const ctx = await guardOnDuty(catalystApp.zcql(), req);
    const rec = tripFor(ctx, req.body.route_no);
    const vehicle_no = String(req.body.vehicle_no || '').trim().toUpperCase().slice(0, 20);
    const driver_name = String(req.body.driver_name || '').trim().slice(0, 50);
    const result = await catalystApp.datastore().table('DutyRecords').updateRow({ ROWID: rec.ROWID, vehicle_no, driver_name });
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    fail(res, err);
  }
});

app.post('/guardAddStop', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const ctx = await guardOnDuty(catalystApp.zcql(), req);
    const rec = tripFor(ctx, req.body.route_no);
    const b = req.body;
    const emp_id = requireText(b.emp_id, 'Emp ID', 20);
    const location = requireText(b.location, 'Location', 100);
    const trip_type = b.trip_type === 'Pickup' ? 'Pickup' : 'Drop';
    const stop_time = optionalTime(b.stop_time, 'Time');
    if (!stop_time) throw new Error('Time is required');
    const result = await catalystApp.datastore().table('TripStops').insertRow({
      duty_record_id: rec.ROWID, duty_date: ctx.dutyDate, escort_id: ctx.me.escort_id, emp_id, location, trip_type, stop_time
    });
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    fail(res, err);
  }
});

// Fix a mistake in an employee stop of the guard's own trips today.
app.post('/guardUpdateStop', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const ctx = await guardOnDuty(catalystApp.zcql(), req);
    const b = req.body;
    const rowid = String(requireRowId(b.rowid));
    if (!ctx.stops.some(x => String(x.ROWID) === rowid)) throw new Error('Employee entry not found');
    const stop_time = optionalTime(b.stop_time, 'Time');
    if (!stop_time) throw new Error('Time is required');
    const result = await catalystApp.datastore().table('TripStops').updateRow({
      ROWID: rowid, emp_id: requireText(b.emp_id, 'Emp ID', 20), location: requireText(b.location, 'Location', 100),
      trip_type: b.trip_type === 'Pickup' ? 'Pickup' : 'Drop', stop_time
    });
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    fail(res, err);
  }
});

// Fix a mistake: the guard can remove an employee stop of their own trips today (not a whole trip).
app.post('/guardDeleteStop', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const ctx = await guardOnDuty(catalystApp.zcql(), req);
    const rowid = String(requireRowId(req.body.rowid));
    if (!ctx.stops.some(x => String(x.ROWID) === rowid)) throw new Error('Employee entry not found');
    await catalystApp.datastore().table('TripStops').deleteRow(rowid);
    res.status(200).json({ status: 'success', data: { deleted: rowid } });
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

// Access lives on the Guards master only. Escorts is read (seat list) but never written here.
const GUARD_COLS = 'ROWID, guard_name, agency, duty_type, post_name, escort_id, guard_token, is_active';

async function guardById(zcql, guardId) {
  const rows = await zcql.executeZCQLQuery(`SELECT ${GUARD_COLS} FROM Guards WHERE ROWID = ${requireRowId(guardId)}`);
  if (rows.length === 0) throw new Error('Guard not found');
  return rows[0].Guards;
}

async function guardByToken(zcql, token) {
  const rows = await zcql.executeZCQLQuery(`SELECT ${GUARD_COLS} FROM Guards WHERE guard_token = '${requireToken(token)}'`);
  if (rows.length === 0 || rows[0].Guards.is_active !== 'true') {
    throw new Error('This link is not valid any more. Ask your supervisor for a new one.');
  }
  return rows[0].Guards;
}

// Sends one notification to every phone the guard has set up.
// A phone that uninstalled / blocked us answers 404 or 410: drop that subscription.
async function sendPushToGuard(catalystApp, guardId, payload) {
  const keys = await getVapidKeys(catalystApp);
  const subs = await selectAll(catalystApp.zcql(), 'PushSubscriptions', `SELECT ROWID, subscription_json FROM PushSubscriptions WHERE guard_id = ${requireRowId(guardId)} ORDER BY ROWID ASC`);
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

// Card Simulator: every active guard from the master (POST and ESCORT).
app.get('/getGuards', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const guards = await selectAll(catalystApp.zcql(), 'Guards', "SELECT ROWID, id_number, guard_name, agency, branch_id, duty_type, post_name FROM Guards WHERE is_active = 'true' ORDER BY id_number ASC");
    res.status(200).json({ status: 'success', data: guards });
  } catch (err) {
    fail(res, err);
  }
});

/* ---------------- GUARD MASTER (#master) ---------------- */

const DUTY_TYPES = ['POST', 'ESCORT'];
const ID_NUMBER_RE = /^[A-Za-z0-9-]{1,20}$/;

// Master page in one call: all guards (left ones too, the page hides them), branches and
// today's swipes (3 SELECTs). The page joins them itself, so Refresh is the only time it reads again.
app.get('/getMaster', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const zcql = catalystApp.zcql();
    const { dutyDate } = istNow();
    const [guards, branches, swipes] = await Promise.all([
      selectAll(zcql, 'Guards', 'SELECT ROWID, id_number, guard_name, agency, branch_id, duty_type, post_name, escort_id, phone, is_active FROM Guards ORDER BY id_number ASC'),
      selectAll(zcql, 'Branches', "SELECT ROWID, branch_code, branch_name, company, country, state, city, area FROM Branches WHERE is_active = 'true' ORDER BY branch_code ASC"),
      selectAll(zcql, 'AccessLog', `SELECT guard_id, direction, punch_time FROM AccessLog WHERE duty_date = '${dutyDate}' ORDER BY CREATEDTIME ASC`)
    ]);
    res.status(200).json({ status: 'success', data: { dutyDate, guards, branches, swipes } });
  } catch (err) {
    fail(res, err);
  }
});

// Guard form, ESCORT only: escorts that no active guard is linked to (one guard per escort).
// ?keep=<escort ROWID> keeps the escort of the guard being edited in the list.
app.get('/getFreeEscorts', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const zcql = catalystApp.zcql();
    const keep = req.query.keep ? String(requireRowId(req.query.keep)) : '';
    const [escorts, linked] = await Promise.all([
      selectAll(zcql, 'Escorts', "SELECT ROWID, escort_name, agency FROM Escorts WHERE is_active = 'true' ORDER BY sort_order ASC"),
      selectAll(zcql, 'Guards', "SELECT escort_id FROM Guards WHERE duty_type = 'ESCORT' AND is_active = 'true' ORDER BY ROWID ASC")
    ]);
    const taken = new Set(linked.map(g => String(g.escort_id)));
    taken.delete(keep);
    res.status(200).json({ status: 'success', data: escorts.filter(e => !taken.has(String(e.ROWID))) });
  } catch (err) {
    fail(res, err);
  }
});

function requireText(value, label, max) {
  const text = String(value || '').trim();
  if (!text) throw new Error(label + ' is required');
  if (text.length > max) throw new Error(label + ' is too long (max ' + max + ')');
  return text;
}

// Form fields -> a clean Guards row. POST guards have a post and no escort; ESCORT guards the other way.
function guardFromBody(b) {
  const id_number = String(b.id_number || '').trim().toUpperCase();
  if (!ID_NUMBER_RE.test(id_number)) throw new Error('ID number: letters, numbers and - only (max 20)');
  const duty_type = String(b.duty_type || '').toUpperCase();
  if (!DUTY_TYPES.includes(duty_type)) throw new Error('Duty must be POST or ESCORT');
  const phone = String(b.phone || '').trim();
  if (phone && !/^[0-9+ ]{6,15}$/.test(phone)) throw new Error('Phone: numbers only (6 to 15)');
  return {
    id_number,
    guard_name: requireText(b.guard_name, 'Name', 100),
    agency: requireText(b.agency, 'Agency', 100),
    branch_id: requireRowId(b.branch_id),
    duty_type,
    post_name: duty_type === 'POST' ? requireText(b.post_name, 'Post', 50) : null,
    escort_id: duty_type === 'ESCORT' ? requireRowId(b.escort_id) : null,
    phone: phone || null
  };
}

// Rules shared by add and edit. `selfId` is the guard being edited (it may keep its own ID / escort).
async function checkGuard(zcql, row, selfId) {
  const other = rows => rows.some(r => String(r.Guards.ROWID) !== String(selfId || ''));
  const checks = [
    zcql.executeZCQLQuery(`SELECT ROWID FROM Guards WHERE id_number = '${row.id_number}'`),
    zcql.executeZCQLQuery(`SELECT ROWID FROM Branches WHERE ROWID = ${row.branch_id} AND is_active = 'true'`)
  ];
  if (row.escort_id) {
    checks.push(zcql.executeZCQLQuery(`SELECT ROWID FROM Escorts WHERE ROWID = ${row.escort_id} AND is_active = 'true'`));
    checks.push(zcql.executeZCQLQuery(`SELECT ROWID FROM Guards WHERE escort_id = ${row.escort_id} AND is_active = 'true'`));
  }
  const [sameId, branch, escort, escortTaken] = await Promise.all(checks);
  if (other(sameId)) throw new Error('ID number ' + row.id_number + ' is already used');
  if (!branch.length) throw new Error('Branch not found');
  if (row.escort_id && !escort.length) throw new Error('Escort not found');
  if (row.escort_id && other(escortTaken)) throw new Error('This escort is already linked to another guard');
}

app.post('/addGuard', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const row = guardFromBody(req.body || {});
    await checkGuard(catalystApp.zcql(), row, null);
    const result = await catalystApp.datastore().table('Guards').insertRow(row);
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    fail(res, err);
  }
});

app.put('/updateGuard', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const zcql = catalystApp.zcql();
    const current = await guardById(zcql, req.body && req.body.ROWID);
    const row = guardFromBody(req.body);
    await checkGuard(zcql, row, current.ROWID);
    const result = await catalystApp.datastore().table('Guards').updateRow({ ROWID: current.ROWID, ...row });
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    fail(res, err);
  }
});

// A guard who left is switched off, never deleted, so old swipes still show their name.
// Switched off: their link and phone stop working and the Card Simulator hides them.
app.put('/setGuardActive', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const zcql = catalystApp.zcql();
    const guard = await guardById(zcql, req.body && req.body.ROWID);
    const active = req.body.active === true;
    if (active && guard.duty_type === 'ESCORT' && guard.escort_id) {
      const taken = await zcql.executeZCQLQuery(`SELECT ROWID FROM Guards WHERE escort_id = ${guard.escort_id} AND is_active = 'true'`);
      if (taken.length) throw new Error('Another active guard is linked to this escort now. Edit one of them first.');
    }
    const result = await catalystApp.datastore().table('Guards').updateRow({ ROWID: guard.ROWID, is_active: active ? 'true' : 'false' });
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    fail(res, err);
  }
});

// Supervisor page: every active guard, their link token and how many phones are set up.
app.get('/getGuardLinks', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const zcql = catalystApp.zcql();
    const [guards, subs] = await Promise.all([
      selectAll(zcql, 'Guards', "SELECT ROWID, id_number, guard_name, agency, duty_type, guard_token FROM Guards WHERE is_active = 'true' ORDER BY id_number ASC"),
      selectAll(zcql, 'PushSubscriptions', 'SELECT guard_id FROM PushSubscriptions ORDER BY ROWID ASC')
    ]);
    const phones = {};
    subs.forEach(s => { phones[String(s.guard_id)] = (phones[String(s.guard_id)] || 0) + 1; });
    const data = guards.map(g => ({ ...g, phones: phones[String(g.ROWID)] || 0 }));
    res.status(200).json({ status: 'success', data });
  } catch (err) {
    fail(res, err);
  }
});

// Gives the guard a secret token once; pressing again returns the same link.
app.post('/createGuardLink', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const guard = await guardById(catalystApp.zcql(), req.body.guard_id);
    let token = guard.guard_token;
    if (!token) {
      token = crypto.randomBytes(16).toString('hex');
      await catalystApp.datastore().table('Guards').updateRow({ ROWID: guard.ROWID, guard_token: token });
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
    const guard = await guardByToken(catalystApp.zcql(), req.query.t);
    const keys = await getVapidKeys(catalystApp);
    res.status(200).json({ status: 'success', data: { guard_name: guard.guard_name, vapidPublicKey: keys.publicKey } });
  } catch (err) {
    fail(res, err);
  }
});

// Saves the phone's push address. The same phone pressing Allow again is not saved twice.
app.post('/saveSubscription', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req);
    const zcql = catalystApp.zcql();
    const guard = await guardByToken(zcql, req.body.t);
    const sub = req.body.subscription;
    if (!sub || typeof sub.endpoint !== 'string' || !sub.endpoint.startsWith('https://') || !sub.keys) {
      throw new Error('Invalid subscription');
    }
    const device = ['android', 'iphone'].includes(req.body.device) ? req.body.device : 'other';
    const existing = await selectAll(zcql, 'PushSubscriptions', `SELECT ROWID, subscription_json FROM PushSubscriptions WHERE guard_id = ${guard.ROWID} ORDER BY ROWID ASC`);
    const same = existing.find(s => {
      try { return JSON.parse(s.subscription_json).endpoint === sub.endpoint; } catch { return false; }
    });
    if (!same) {
      await catalystApp.datastore().table('PushSubscriptions').insertRow({
        guard_id: guard.ROWID, subscription_json: JSON.stringify(sub), device
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
    const guard = await guardByToken(catalystApp.zcql(), req.body.t);
    const result = await sendPushToGuard(catalystApp, guard.ROWID, {
      title: '🔔 Test notification',
      body: 'Hi ' + guard.guard_name + ', notifications are working.',
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
