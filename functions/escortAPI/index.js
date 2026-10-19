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

// Login + roles (auth.js): guard routes pass with their secret link, the rest need a login.
const auth = require('./auth.js')(catalyst, selectAll);
app.use(auth.middleware);

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
// For "value || fail.missing('Pick …')": a clear message instead of "Invalid rowid".
fail.missing = message => { throw new Error(message); };

/* ---------------- ESCORTS ---------------- */

app.get('/getEscorts', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
    const zcql = catalystApp.zcql();
    const escorts = await selectAll(zcql, 'Escorts', "SELECT * FROM Escorts WHERE is_active = 'true' ORDER BY sort_order ASC");
    res.status(200).json({ status: 'success', data: escorts });
  } catch (err) {
    fail(res, err);
  }
});

app.post('/addEscort', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
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
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
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
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
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
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
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
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
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
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
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
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
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
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
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
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
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
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
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
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
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
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
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
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
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
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
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
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
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
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
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
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
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
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
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
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
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
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
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
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
    const row = await getSetting(catalystApp.zcql(), 'start_date');
    res.status(200).json({ status: 'success', data: row ? row.setting_value : null });
  } catch (err) {
    fail(res, err);
  }
});

app.post('/saveStartDate', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
    await saveSetting(catalystApp, 'start_date', requireDate(req.body.value));
    res.status(200).json({ status: 'success' });
  } catch (err) {
    fail(res, err);
  }
});

app.get('/getLastUploadDate', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
    const row = await getSetting(catalystApp.zcql(), 'last_upload_date');
    res.status(200).json({ status: 'success', data: row ? row.setting_value : null });
  } catch (err) {
    fail(res, err);
  }
});

app.post('/markUploadDone', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
    await saveSetting(catalystApp, 'last_upload_date', requireDate(req.body.value));
    res.status(200).json({ status: 'success' });
  } catch (err) {
    fail(res, err);
  }
});

/* ---------------- SMART EXCEL SYNC (optimized — skips unnecessary updates) ---------------- */

app.post('/syncEscortsFromExcel', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
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
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
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

// First IN of the duty day → a notification on the guard's phones. What it says comes from
// this week's Duty Chart (post + shift):
//   ESCORT post → "✅ IN 19:42 · Today your Seat 5 · Shift C (21:00–06:00)" (seat from the escort duty sheet)
//   POST        → "✅ IN 05:55 · Gate 3 · Shift A (06:00–15:00)"
//   not in the chart → "Duty not assigned yet"
// Later INs the same duty day (card swiped again after a break) send nothing.
async function onCardIn(catalystApp, guard, time, dutyDate) {
  const zcql = catalystApp.zcql();
  const ins = await zcql.executeZCQLQuery(`SELECT ROWID FROM AccessLog WHERE guard_id = ${guard.ROWID} AND duty_date = '${dutyDate}' AND direction = 'IN'`);
  const duty = await dutyOf(zcql, guard.ROWID, weekStartOf(shiftDate()), shiftDate());
  // POST guard: their DutyLog row starts "waiting" until they press Taken over (post.js).
  // Made on any IN of the day that finds none (the chart may have changed after the first IN);
  // a new row also means a new notification.
  const newPostLog = duty && duty.post.post_type === 'POST' ? (await post.onPostIn(catalystApp, guard, duty)).created : false;
  if (ins.length > 1 && !newPostLog) return { skipped: 'already IN today' };

  let body = 'Duty not assigned yet. Ask your supervisor.';
  let seat = null;
  // No post for today yet: the month roster may still say the shift (or a week off / leave).
  let rosterShift = '';
  if (!duty) {
    rosterShift = await roster.shiftOf(zcql, guard.ROWID, shiftDate());
    const sh = (await getShifts(zcql)).find(x => x.code === rosterShift);
    if (sh) body = 'Today: ' + shiftText(sh) + ' (month roster). Your supervisor will give your post.';
    else if (rosterShift === 'O') body = 'The month roster says today is your week off. Ask your supervisor.';
    else if (rosterShift === 'L') body = 'The month roster says you are on leave today. Ask your supervisor.';
  }
  if (duty && duty.post.post_type === 'ESCORT') {
    body = 'Your card IN is noted';
    if (guard.escort_id) {
      // Read-only look at the escort duty sheet; nothing is written on the escort side.
      const [escorts, start] = await Promise.all([
        selectAll(zcql, 'Escorts', "SELECT ROWID FROM Escorts WHERE is_active = 'true' ORDER BY sort_order ASC"),
        getSetting(zcql, 'start_date')
      ]);
      seat = seatOf(escorts, guard.escort_id, start && start.setting_value, dutyDate);
      if (seat) body = 'Today your Seat ' + seat;
    }
    body += ' · ' + shiftText(duty.shift);
  } else if (duty) {
    body = 'Your post for today is ready · ' + duty.post.post_name + ' · ' + shiftText(duty.shift);
  }
  const result = await sendPushToGuard(catalystApp, guard.ROWID, {
    title: '✅ IN ' + time,
    body,
    url: guard.guard_token ? 'index.html#guard/' + guard.guard_token : 'index.html'
  });
  return { ...result, seat, post: duty ? duty.post.post_name : null, shift: duty ? duty.shift.code : (rosterShift || null) };
}

// One door: the Card Simulator posts here today; the real access system can post here later.
app.post('/addAccessLog', async (req, res) => {
  try {
    auth.need(req, 'admin');
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
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
    } else {
      // Post guard: card OUT locks their duty page and marks the post empty (post.js).
      try {
        await post.onPostOut(catalystApp, guard);
      } catch (err) {
        console.error('Card OUT update failed:', err);
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
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
    const zcql = catalystApp.zcql();
    const me = await guardByToken(zcql, req.query.t);
    const dutyDate = dutyDateFor(req, req.query.date);
    // This week's chart decides the page: escort sheet, post, or "not assigned".
    const chartDay = req.query.date && dutyDate === req.query.date ? dutyDate : shiftDate();
    const duty = await dutyOf(zcql, me.ROWID, weekStartOf(chartDay), chartDay);

    // First IN time of each guard (by Guards ROWID) on this duty day.
    const ins = await selectAll(zcql, 'AccessLog', `SELECT guard_id, punch_time FROM AccessLog WHERE duty_date = '${dutyDate}' AND direction = 'IN' ORDER BY CREATEDTIME ASC`);
    const inTime = {};
    ins.forEach(r => { if (!inTime[String(r.guard_id)]) inTime[String(r.guard_id)] = r.punch_time; });
    const myId = String(me.ROWID);
    const base = {
      name: me.guard_name, dutyDate,
      dutyType: duty ? duty.post.post_type : null,
      postName: duty ? duty.post.post_name : null,
      shift: duty ? duty.shift : null
    };
    if (!inTime[myId]) {
      return res.status(200).json({ status: 'success', data: { ...base, locked: true } });
    }

    const day = dayOf(dutyDate);
    if (base.dutyType !== 'ESCORT' || !me.escort_id || day === 0 || day === 6) {
      return res.status(200).json({ status: 'success', data: { ...base, locked: false, inTime: inTime[myId], seats: [] } });
    }
    const [escorts, start, escortGuards, records, dayStops] = await Promise.all([
      selectAll(zcql, 'Escorts', "SELECT ROWID, escort_name, agency FROM Escorts WHERE is_active = 'true' ORDER BY sort_order ASC"),
      getSetting(zcql, 'start_date'),
      selectAll(zcql, 'Guards', 'SELECT ROWID, escort_id FROM Guards ORDER BY ROWID ASC'),
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
  if (!me.escort_id) throw new Error('Only escort guards fill trips');
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
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
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
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
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
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
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
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
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
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
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
    auth.need(req, 'admin');
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
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
const GUARD_COLS = 'ROWID, guard_name, agency, agency_id, branch_id, escort_id, guard_token, is_active';

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
// `devices` says what happened per phone, so the setup page can show which one failed.
// "sent" only means the push service (Google / Apple / Mozilla) took it; the phone's own
// settings still decide whether it is shown.
async function sendPushToGuard(catalystApp, guardId, payload) {
  const subs = await selectAll(catalystApp.zcql(), 'PushSubscriptions', `SELECT ROWID, subscription_json, device FROM PushSubscriptions WHERE guard_id = ${requireRowId(guardId)} ORDER BY ROWID ASC`);
  return sendPushToRows(catalystApp, 'PushSubscriptions', subs, payload);
}

// Same for any list of saved subscription rows (guards' phones or supervisors' browsers).
async function sendPushToRows(catalystApp, tableName, subs, payload) {
  if (!subs.length) return { phones: 0, sent: 0, devices: [] };
  const keys = await getVapidKeys(catalystApp);
  const table = catalystApp.datastore().table(tableName);
  const devices = [];
  for (const s of subs) {
    const device = s.device || 'other';
    try {
      await webpush.sendNotification(JSON.parse(s.subscription_json), JSON.stringify(payload), {
        vapidDetails: { subject: VAPID_SUBJECT, publicKey: keys.publicKey, privateKey: keys.privateKey },
        TTL: 60 * 60
      });
      devices.push({ device, result: 'sent' });
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        await table.deleteRow(s.ROWID);
        devices.push({ device, result: 'removed' });
      } else {
        console.error('Push failed:', err.statusCode, err.body || err.message);
        devices.push({ device, result: 'failed', code: err.statusCode || null });
      }
    }
  }
  return { phones: subs.length, sent: devices.filter(d => d.result === 'sent').length, devices };
}

// Card Simulator: every active guard from the master (POST and ESCORT).
app.get('/getGuards', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
    const zcql = catalystApp.zcql();
    const [guards, duties] = await Promise.all([
      selectAll(zcql, 'Guards', "SELECT ROWID, id_number, guard_name, agency, agency_id, branch_id FROM Guards WHERE is_active = 'true' ORDER BY id_number ASC"),
      weekDuties(zcql, weekStartOf(shiftDate()))
    ]);
    res.status(200).json({ status: 'success', data: auth.inArea(req, guards).map(g => ({ ...g, duty: duties[String(g.ROWID)] || null })) });
  } catch (err) {
    fail(res, err);
  }
});

/* ---------------- SHIFTS, POSTS, DUTY CHART (#posts, #chart) ---------------- */
// Guards = who the guard is. Posts = the places of a branch (Gate 3, Lobby, Escort).
// DutyChart = one row per guard per week: which post and which shift (A / B / C).

const POST_TYPES = ['POST', 'ESCORT'];
const SHIFT_START_HOUR = 4;

// The IST date a shift belongs to. Shift C starts 21:00 and runs past midnight, so a swipe
// before 04:00 still belongs to the day before; Shift A guards coming early (05:30) count today.
function shiftDate() {
  const d = new Date(Date.now() + IST_OFFSET_MIN * 60000);
  if (d.getUTCHours() < SHIFT_START_HOUR) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Monday of the week a date is in (charts run Monday → Sunday).
function weekStartOf(date) {
  const d = new Date(requireDate(date) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

function requireMonday(value) {
  if (weekStartOf(value) !== value) throw new Error('Week must start on a Monday');
  return value;
}

// Shift timings rarely change; kept while this function instance stays warm (saves reads).
let shiftCache = null;
async function getShifts(zcql) {
  if (!shiftCache) {
    const rows = await selectAll(zcql, 'Shifts', 'SELECT shift_code, start_time, end_time FROM Shifts ORDER BY shift_code ASC');
    shiftCache = rows.map(r => ({ code: r.shift_code, start: r.start_time, end: r.end_time }));
  }
  return shiftCache;
}

const shiftText = sh => 'Shift ' + sh.code + ' (' + sh.start + '–' + sh.end + ')';

// One guard's post + shift for a week, or null when the chart has no row for them.
// A published day schedule (supervisor's Schedule screen) for that date wins over the weekly chart.
async function dutyOf(zcql, guardId, week, day) {
  let c = null;
  if (day) {
    const planned = (await zcql.executeZCQLQuery(`SELECT post_id, shift_code FROM Schedule WHERE guard_id = ${requireRowId(guardId)} AND sched_date = '${requireDate(day)}' AND published = true`)).map(r => r.Schedule);
    // Extra duty (two shifts that day): the shift that has started latest by now, else the first one.
    if (planned.length > 1) {
      const shifts = await getShifts(zcql);
      const startOf = p => (shifts.find(x => x.code === p.shift_code) || {}).start || '99:99';
      const now = new Date(Date.now() + IST_OFFSET_MIN * 60000).toISOString().slice(11, 16);
      const started = planned.filter(p => startOf(p) <= now).sort((a, b) => startOf(b).localeCompare(startOf(a)));
      c = started[0] || planned.sort((a, b) => startOf(a).localeCompare(startOf(b)))[0];
    } else if (planned.length) c = planned[0];
  }
  if (!c) {
    const rows = await zcql.executeZCQLQuery(`SELECT post_id, shift_code FROM DutyChart WHERE guard_id = ${requireRowId(guardId)} AND week_start = '${week}'`);
    if (!rows.length) return null;
    c = rows[0].DutyChart;
  }
  const [posts, shifts] = await Promise.all([
    zcql.executeZCQLQuery(`SELECT ROWID, post_name, post_type FROM Posts WHERE ROWID = ${c.post_id}`),
    getShifts(zcql)
  ]);
  const shift = shifts.find(x => x.code === c.shift_code);
  if (!posts.length || !shift) return null;
  return { post: posts[0].Posts, shift };
}

// Every guard's duty for a week: { guard ROWID: { post_name, post_type, shift_code } }.
async function weekDuties(zcql, week) {
  const [chart, posts] = await Promise.all([
    selectAll(zcql, 'DutyChart', `SELECT guard_id, post_id, shift_code FROM DutyChart WHERE week_start = '${week}' ORDER BY ROWID ASC`),
    selectAll(zcql, 'Posts', 'SELECT ROWID, post_name, post_type FROM Posts ORDER BY ROWID ASC')
  ]);
  const postById = {};
  posts.forEach(p => { postById[String(p.ROWID)] = p; });
  const map = {};
  chart.forEach(c => {
    const p = postById[String(c.post_id)];
    if (p) map[String(c.guard_id)] = { post_name: p.post_name, post_type: p.post_type, shift_code: c.shift_code };
  });
  return map;
}

// Posts page: every post (switched-off ones too) and the branches to pick from.
app.get('/getPosts', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
    const zcql = catalystApp.zcql();
    const [posts, branches, agencies] = await Promise.all([
      selectAll(zcql, 'Posts', 'SELECT ROWID, branch_id, agency_id, post_name, post_type, vehicle_entry, extra_duty, auto_fill, section, sort_order, shift_codes, is_active FROM Posts ORDER BY post_name ASC'),
      activeBranches(req, zcql),
      admin.agencyList(zcql)
    ]);
    res.status(200).json({ status: 'success', data: { posts: auth.inArea(req, posts), branches, agencies } });
  } catch (err) {
    fail(res, err);
  }
});

function postFromBody(b) {
  const post_type = String(b.post_type || '').toUpperCase();
  if (!POST_TYPES.includes(post_type)) throw new Error('Type must be POST or ESCORT');
  return {
    branch_id: requireRowId(b.branch_id), agency_id: requireRowId(b.agency_id || fail.missing('Pick the agency of this post')), post_name: requireText(b.post_name, 'Post name', 50), post_type,
    vehicle_entry: b.vehicle_entry === true,
    // A guard may take this post as a second shift the same day (weekend cover, e.g. VTitan).
    extra_duty: b.extra_duty === true,
    // ⚡ Auto fill fills this post (switched on post by post, once its rules are checked).
    auto_fill: b.auto_fill === true,
    // Where it sits on the daily roster sheet, and the shifts it works ("ABC", "G"; empty = all).
    section: String(b.section || '').trim().slice(0, 30) || null,
    sort_order: Number.isInteger(Number(b.sort_order)) && String(b.sort_order).trim() !== '' ? Number(b.sort_order) : null,
    shift_codes: [...new Set(String(b.shift_codes || '').toUpperCase().replace(/[^ABCG]/g, ''))].join('') || null
  };
}

// The branch is in my area, the agency works there, and the post name is used nowhere else:
// one name = one post in the whole app (any branch, any agency).
async function checkPost(req, zcql, row, selfId) {
  auth.requireBranch(req, row.branch_id);
  const [branch, same, agency] = await Promise.all([
    zcql.executeZCQLQuery(`SELECT ROWID FROM Branches WHERE ROWID = ${row.branch_id} AND is_active = 'true'`),
    selectAll(zcql, 'Posts', 'SELECT ROWID, post_name, branch_id FROM Posts ORDER BY ROWID ASC'),
    zcql.executeZCQLQuery(`SELECT ROWID, branch_ids FROM Agencies WHERE ROWID = ${row.agency_id} AND is_active = true`)
  ]);
  if (!branch.length) throw new Error('Branch not found');
  if (!agency.length) throw new Error('Pick the agency of this post');
  if (!admin.worksIn(agency[0].Agencies, row.branch_id)) throw new Error('This agency does not work in this branch. Tick the branch in Admin → Agencies.');
  // "Kitchen-1", "kitchen - 1" and "KITCHEN 1" count as the same name.
  const key = name => String(name || '').toLowerCase().replace(/[\s-]+/g, '');
  const taken = same.find(p => key(p.post_name) === key(row.post_name) && String(p.ROWID) !== String(selfId || ''));
  if (taken) {
    const b = (await auth.branchList(zcql)).find(x => String(x.ROWID) === String(taken.branch_id));
    throw new Error('The post name ' + taken.post_name + ' is already used' + (b ? ' in ' + b.branch_name : '') + '. Post names must be unique.');
  }
}

app.post('/addPost', async (req, res) => {
  try {
    auth.need(req, 'branch_admin');
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
    const row = postFromBody(req.body || {});
    await checkPost(req, catalystApp.zcql(), row, null);
    const result = await catalystApp.datastore().table('Posts').insertRow(row);
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    fail(res, err);
  }
});

// Rename / change type, or switch a post off (never deleted: old charts point to it).
app.put('/updatePost', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
    auth.need(req, 'branch_admin');
    const b = req.body || {};
    const rowid = requireRowId(b.ROWID);
    const row = postFromBody(b);
    const zcql = catalystApp.zcql();
    const old = await zcql.executeZCQLQuery(`SELECT ROWID, branch_id FROM Posts WHERE ROWID = ${rowid}`);
    if (!old.length) throw new Error('Post not found');
    auth.requireBranch(req, old[0].Posts.branch_id);
    await checkPost(req, zcql, row, rowid);
    const result = await catalystApp.datastore().table('Posts').updateRow({
      ROWID: rowid, ...row, is_active: b.is_active === false ? 'false' : 'true'
    });
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    fail(res, err);
  }
});

// Duty Chart page: one branch, one week. Guards and posts of the branch, the shifts, and the
// chart rows of that week (4 to 5 SELECTs).
app.get('/getChart', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
    const zcql = catalystApp.zcql();
    const week = requireMonday(req.query.week || weekStartOf(shiftDate()));
    const [branches, shifts] = await Promise.all([activeBranches(req, zcql), getShifts(zcql)]);
    const branchId = req.query.branch ? auth.requireBranch(req, requireRowId(req.query.branch)) : (branches[0] && branches[0].ROWID);
    if (!branchId) throw new Error('No branch in your area yet.');
    const [guards, posts, chart] = await Promise.all([
      selectAll(zcql, 'Guards', `SELECT ROWID, id_number, guard_name, escort_id FROM Guards WHERE branch_id = ${branchId} AND is_active = 'true'${auth.agencyWhere(req)} ORDER BY id_number ASC`),
      selectAll(zcql, 'Posts', `SELECT ROWID, post_name, post_type FROM Posts WHERE branch_id = ${branchId} AND is_active = 'true'${auth.agencyWhere(req)} ORDER BY post_name ASC`),
      selectAll(zcql, 'DutyChart', `SELECT ROWID, guard_id, post_id, shift_code FROM DutyChart WHERE week_start = '${week}' ORDER BY ROWID ASC`)
    ]);
    const ids = new Set(guards.map(g => String(g.ROWID)));
    res.status(200).json({
      status: 'success',
      data: { week, branchId: String(branchId), branches, shifts, guards, posts, chart: chart.filter(c => ids.has(String(c.guard_id))) }
    });
  } catch (err) {
    fail(res, err);
  }
});

// Set one guard's post + shift for a week (one row per guard per week). No post = not assigned.
app.post('/saveChart', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
    const zcql = catalystApp.zcql();
    const b = req.body || {};
    const week = requireMonday(requireDate(b.week));
    const guard = auth.requireRow(req, await guardById(zcql, b.guard_id), 'guard');
    if (guard.is_active !== 'true') throw new Error(guard.guard_name + ' is not active');
    const table = catalystApp.datastore().table('DutyChart');
    const existing = await zcql.executeZCQLQuery(`SELECT ROWID FROM DutyChart WHERE guard_id = ${guard.ROWID} AND week_start = '${week}'`);
    if (!b.post_id) {
      if (existing.length) await table.deleteRow(existing[0].DutyChart.ROWID);
      return res.status(200).json({ status: 'success', data: null });
    }
    const [posts, shifts] = await Promise.all([
      zcql.executeZCQLQuery(`SELECT ROWID, branch_id, agency_id, post_type, is_active FROM Posts WHERE ROWID = ${requireRowId(b.post_id)}`),
      getShifts(zcql)
    ]);
    const post = posts.length && posts[0].Posts;
    if (!post || post.is_active !== 'true') throw new Error('Post not found');
    auth.requireRow(req, post, 'post');
    if (String(post.branch_id) !== String(guard.branch_id)) throw new Error('This post is in another branch');
    if (post.post_type === 'ESCORT' && !guard.escort_id) {
      throw new Error(guard.guard_name + ' is not linked to the escort duty sheet. Guard Master → Edit → Escort duty sheet name.');
    }
    const shift_code = String(b.shift_code || '').toUpperCase();
    if (!shifts.some(x => x.code === shift_code)) throw new Error('Pick a shift');
    const row = { post_id: post.ROWID, shift_code };
    const result = existing.length
      ? await table.updateRow({ ROWID: existing[0].DutyChart.ROWID, ...row })
      : await table.insertRow({ guard_id: guard.ROWID, week_start: week, ...row });
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    fail(res, err);
  }
});

// Next week usually looks like this week: copy last week's rows of one branch into this week,
// only for guards who have no row yet (nothing already set is changed).
app.post('/copyChart', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
    const zcql = catalystApp.zcql();
    const b = req.body || {};
    const week = requireMonday(requireDate(b.week));
    const prev = new Date(week + 'T00:00:00Z');
    prev.setUTCDate(prev.getUTCDate() - 7);
    const lastWeek = prev.toISOString().slice(0, 10);
    const branchId = auth.requireBranch(req, requireRowId(b.branch_id));
    const [guards, posts, chart] = await Promise.all([
      selectAll(zcql, 'Guards', `SELECT ROWID FROM Guards WHERE branch_id = ${branchId} AND is_active = 'true'${auth.agencyWhere(req)} ORDER BY ROWID ASC`),
      selectAll(zcql, 'Posts', `SELECT ROWID FROM Posts WHERE branch_id = ${branchId} AND is_active = 'true'${auth.agencyWhere(req)} ORDER BY ROWID ASC`),
      selectAll(zcql, 'DutyChart', `SELECT guard_id, post_id, shift_code, week_start FROM DutyChart WHERE week_start = '${lastWeek}' OR week_start = '${week}' ORDER BY ROWID ASC`)
    ]);
    const ids = new Set(guards.map(g => String(g.ROWID)));
    const livePosts = new Set(posts.map(p => String(p.ROWID)));
    const has = new Set(chart.filter(c => c.week_start === week).map(c => String(c.guard_id)));
    const rows = chart
      .filter(c => c.week_start === lastWeek && ids.has(String(c.guard_id)) && !has.has(String(c.guard_id)) && livePosts.has(String(c.post_id)))
      .map(c => ({ guard_id: c.guard_id, post_id: c.post_id, shift_code: c.shift_code, week_start: week }));
    const result = rows.length ? await catalystApp.datastore().table('DutyChart').insertRows(rows) : [];
    res.status(200).json({ status: 'success', data: { copied: rows.length, rows: result } });
  } catch (err) {
    fail(res, err);
  }
});

/* ---------------- GUARD MASTER (#master) ---------------- */

const ID_NUMBER_RE = /^[A-Za-z0-9-]{1,20}$/;

// Master page in one call: all guards of my area (left ones too, the page hides them), branches,
// agencies and which branches have an escort post (about 4 SELECTs). Refresh is the only reread.
app.get('/getMaster', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
    const zcql = catalystApp.zcql();
    const [guards, branches] = await Promise.all([
      selectAll(zcql, 'Guards', 'SELECT ROWID, id_number, card_number, guard_name, agency, agency_id, branch_id, area, escort_id, phone, photo_key, created_by, modified_by, CREATEDTIME, MODIFIEDTIME, is_active FROM Guards ORDER BY id_number ASC').then(g => auth.inArea(req, g)),
      activeBranches(req, zcql)
    ]);
    const [agencies, escortPosts] = await Promise.all([
      admin.agencyList(zcql),
      selectAll(zcql, 'Posts', "SELECT branch_id FROM Posts WHERE post_type = 'ESCORT' AND is_active = 'true' ORDER BY ROWID ASC")
    ]);
    // Branches with an escort post: only there the form asks for the escort duty sheet name.
    const escortBranches = [...new Set(escortPosts.map(p => String(p.branch_id)))];
    res.status(200).json({ status: 'success', data: { guards, branches, agencies, escortBranches } });
  } catch (err) {
    fail(res, err);
  }
});

// Guard form, "escort duty sheet name": escorts that no active guard is linked to (one guard per escort).
// ?keep=<escort ROWID> keeps the escort of the guard being edited in the list.
app.get('/getFreeEscorts', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
    const zcql = catalystApp.zcql();
    const keep = req.query.keep ? String(requireRowId(req.query.keep)) : '';
    const [escorts, linked] = await Promise.all([
      selectAll(zcql, 'Escorts', "SELECT ROWID, escort_name, agency FROM Escorts WHERE is_active = 'true' ORDER BY sort_order ASC"),
      selectAll(zcql, 'Guards', "SELECT escort_id FROM Guards WHERE is_active = 'true' ORDER BY ROWID ASC")
    ]);
    const taken = new Set(linked.filter(g => g.escort_id).map(g => String(g.escort_id)));
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

// Form fields -> a clean Guards row: the guard's own details only. Their post and shift are
// set week by week in the Duty Chart. `escort_id` (optional) says which escort duty sheet row is
// this same person, for guards who do escort duty.
function guardFromBody(b) {
  const id_number = String(b.id_number || '').trim().toUpperCase();
  if (!ID_NUMBER_RE.test(id_number)) throw new Error('ID number: letters, numbers and - only (max 20)');
  const card_number = String(b.card_number || '').trim().toUpperCase();
  if (card_number && !CARD_RE.test(card_number)) throw new Error('Card number: letters, numbers and - only (max 30)');
  const phone = String(b.phone || '').trim();
  if (phone && !/^[0-9+ ]{6,15}$/.test(phone)) throw new Error('Phone: numbers only (6 to 15)');
  return {
    id_number,
    card_number: card_number || null,
    guard_name: requireText(b.guard_name, 'Name', 100),
    agency_id: requireRowId(b.agency_id || fail.missing('Pick the agency')),
    branch_id: requireRowId(b.branch_id),
    // Work area inside the branch (PKL, MLCP, Escort, Hospital…), from the agency's monthly file.
    area: String(b.area || '').trim().slice(0, 30) || null,
    escort_id: b.escort_id ? requireRowId(b.escort_id) : null,
    phone: phone || null
  };
}

const CARD_RE = /^[A-Z0-9-]{1,30}$/;
// What the screens may see of a saved guard row (the unused aadhaar_enc column stays out).
function publicGuard(g) {
  const { aadhaar_enc, ...rest } = g || {};
  return rest;
}

// Rules shared by add and edit. `selfId` is the guard being edited (it may keep its own ID / escort).
// A supervisor's guards are always of their own agency; the agency name is kept as text too.
async function checkGuard(req, zcql, row, selfId) {
  if (req.scope.agency) row.agency_id = req.scope.agency;
  auth.requireRow(req, row, 'guard');
  const agency = await zcql.executeZCQLQuery(`SELECT agency_name, branch_ids FROM Agencies WHERE ROWID = ${row.agency_id} AND is_active = true`);
  if (!agency.length) throw new Error('Pick the agency');
  if (!admin.worksIn(agency[0].Agencies, row.branch_id)) throw new Error('This agency does not work in this branch. Tick the branch in Admin → Agencies.');
  row.agency = agency[0].Agencies.agency_name;
  const other = rows => rows.some(r => String(r.Guards.ROWID) !== String(selfId || ''));
  const checks = [
    zcql.executeZCQLQuery(`SELECT ROWID FROM Guards WHERE id_number = '${row.id_number}'`),
    zcql.executeZCQLQuery(`SELECT ROWID FROM Branches WHERE ROWID = ${row.branch_id} AND is_active = 'true'`),
    row.card_number ? zcql.executeZCQLQuery(`SELECT ROWID FROM Guards WHERE card_number = '${row.card_number}'`) : Promise.resolve([]),
    selectAll(zcql, 'Guards', 'SELECT ROWID, guard_name, id_number FROM Guards ORDER BY ROWID ASC')
  ];
  if (row.escort_id) {
    checks.push(zcql.executeZCQLQuery(`SELECT ROWID FROM Escorts WHERE ROWID = ${row.escort_id} AND is_active = 'true'`));
    checks.push(zcql.executeZCQLQuery(`SELECT ROWID FROM Guards WHERE escort_id = ${row.escort_id} AND is_active = 'true'`));
  }
  const [sameId, branch, sameCard, allGuards, escort, escortTaken] = await Promise.all(checks);
  if (other(sameId)) throw new Error('ID number ' + row.id_number + ' is already used');
  if (other(sameCard)) throw new Error('Card number ' + row.card_number + ' is already used');
  // One name = one guard in the whole app. Two people with the same name: add their number
  // ("Sudhakar M 4785"). Case, spaces, dots and dashes are ignored when comparing.
  const key = name => String(name || '').toLowerCase().replace(/[\s.-]+/g, '');
  const twin = allGuards.find(g => key(g.guard_name) === key(row.guard_name) && String(g.ROWID) !== String(selfId || ''));
  if (twin) throw new Error(twin.guard_name + ' (' + twin.id_number + ') already has this name. Add their number to the name, e.g. ' + row.guard_name + ' 1234.');
  if (!branch.length) throw new Error('Branch not found');
  if (row.escort_id && !escort.length) throw new Error('Escort not found');
  if (row.escort_id && other(escortTaken)) throw new Error('This escort is already linked to another guard');
}

app.post('/addGuard', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
    const row = guardFromBody(req.body || {});
    await checkGuard(req, catalystApp.zcql(), row, null);
    const result = await catalystApp.datastore().table('Guards').insertRow({ ...row, created_by: req.user.name, modified_by: req.user.name });
    res.status(200).json({ status: 'success', data: publicGuard(result) });
  } catch (err) {
    fail(res, err);
  }
});

app.put('/updateGuard', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
    const zcql = catalystApp.zcql();
    const current = auth.requireRow(req, await guardById(zcql, req.body && req.body.ROWID), 'guard');
    const row = guardFromBody(req.body);
    await checkGuard(req, zcql, row, current.ROWID);
    const result = await catalystApp.datastore().table('Guards').updateRow({ ROWID: current.ROWID, ...row, modified_by: req.user.name });
    res.status(200).json({ status: 'success', data: publicGuard(result) });
  } catch (err) {
    fail(res, err);
  }
});

// A guard who left is switched off, never deleted, so old swipes still show their name.
// Switched off: their link and phone stop working and the Card Simulator hides them.
app.put('/setGuardActive', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
    const zcql = catalystApp.zcql();
    const guard = auth.requireRow(req, await guardById(zcql, req.body && req.body.ROWID), 'guard');
    const active = req.body.active === true;
    if (active && guard.escort_id) {
      const taken = await zcql.executeZCQLQuery(`SELECT ROWID FROM Guards WHERE escort_id = ${guard.escort_id} AND is_active = 'true'`);
      if (taken.length) throw new Error('Another active guard is linked to this escort now. Edit one of them first.');
    }
    const result = await catalystApp.datastore().table('Guards').updateRow({ ROWID: guard.ROWID, is_active: active ? 'true' : 'false', modified_by: req.user.name });
    res.status(200).json({ status: 'success', data: publicGuard(result) });
  } catch (err) {
    fail(res, err);
  }
});

// Guard photo (optional): one picture per guard in the media bucket; the page gets a link valid
// for one hour. A new photo replaces the old one.
const GUARD_PHOTO_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const GUARD_PHOTO_MAX = 5 * 1048576;

app.post('/guardPhoto', express.raw({ type: () => true, limit: '6mb' }), async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
    const guard = auth.requireRow(req, await guardById(catalystApp.zcql(), req.query.guard), 'guard');
    const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    const ext = GUARD_PHOTO_TYPES[type];
    if (!ext) throw new Error('Photo must be JPG, PNG or WEBP.');
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw new Error('The photo is empty.');
    if (req.body.length > GUARD_PHOTO_MAX) throw new Error('Photo is too big (max 5 MB).');
    const bucket = catalystApp.stratus().bucket('escortcardaccess-media');
    const key = 'guards/' + guard.ROWID + '-' + crypto.randomBytes(6).toString('hex') + '.' + ext;
    await bucket.putObject(key, req.body, { contentType: type });
    const old = (await catalystApp.zcql().executeZCQLQuery(`SELECT photo_key FROM Guards WHERE ROWID = ${guard.ROWID}`))[0].Guards.photo_key;
    await catalystApp.datastore().table('Guards').updateRow({ ROWID: guard.ROWID, photo_key: key, modified_by: req.user.name });
    if (old) {
      try { await bucket.deleteObject(old); } catch (err) { console.error('Old guard photo not removed:', err.message || err); }
    }
    res.status(200).json({ status: 'success', data: { photo_key: key } });
  } catch (err) {
    fail(res, err);
  }
});

app.get('/guardPhotoUrl', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
    // One read: the photo key and what the area check needs.
    const rows = await catalystApp.zcql().executeZCQLQuery(`SELECT photo_key, branch_id, agency_id FROM Guards WHERE ROWID = ${requireRowId(req.query.guard)}`);
    if (!rows.length) throw new Error('Guard not found');
    const key = auth.requireRow(req, rows[0].Guards, 'guard').photo_key;
    if (!key) return res.status(200).json({ status: 'success', data: { url: null } });
    const r = await catalystApp.stratus().bucket('escortcardaccess-media').generatePreSignedUrl(key, 'GET', { expiryIn: '3600' });
    res.status(200).json({ status: 'success', data: { url: r.signature } });
  } catch (err) {
    fail(res, err);
  }
});

// Supervisor page: every active guard, their link token and how many phones are set up.
app.get('/getGuardLinks', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
    const zcql = catalystApp.zcql();
    const [guards, subs] = await Promise.all([
      selectAll(zcql, 'Guards', "SELECT ROWID, id_number, guard_name, agency, agency_id, branch_id, guard_token FROM Guards WHERE is_active = 'true' ORDER BY id_number ASC").then(g => auth.inArea(req, g)),
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
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
    const guard = auth.requireRow(req, await guardById(catalystApp.zcql(), req.body.guard_id), 'guard');
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

// The link was shared by mistake / the phone was lost: a new token makes the old link dead.
// Phones set up with the old link are removed too (someone else may have pressed Allow with it),
// so the guard sets up their phone again with the new link.
app.post('/resetGuardLink', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
    const zcql = catalystApp.zcql();
    const guard = auth.requireRow(req, await guardById(zcql, req.body.guard_id), 'guard');
    const token = crypto.randomBytes(16).toString('hex');
    await catalystApp.datastore().table('Guards').updateRow({ ROWID: guard.ROWID, guard_token: token });
    const subs = await selectAll(zcql, 'PushSubscriptions', `SELECT ROWID FROM PushSubscriptions WHERE guard_id = ${guard.ROWID} ORDER BY ROWID ASC`);
    const table = catalystApp.datastore().table('PushSubscriptions');
    await runInBatches(subs.map(s => s.ROWID), 10, id => table.deleteRow(id));
    res.status(200).json({ status: 'success', data: { token, phonesRemoved: subs.length } });
  } catch (err) {
    fail(res, err);
  }
});

// Guard setup page: whose link is this + the public key the phone needs to subscribe.
app.get('/guardInfo', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
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
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
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
// Tapping it opens the guard's duty page, the same page a real duty notification opens.
app.post('/testPush', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
    const guard = await guardByToken(catalystApp.zcql(), req.body.t);
    const result = await sendPushToGuard(catalystApp, guard.ROWID, {
      title: '🔔 Test notification',
      body: 'Hi ' + guard.guard_name + ', notifications are working.',
      url: 'index.html#guard/' + req.body.t
    });
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    fail(res, err);
  }
});

/* ---------------- ADMIN (admin.js) ---------------- */

const admin = require('./admin.js')(app, { catalyst, selectAll, requireRowId, requireText, fail, auth });

// Month roster (roster.js): the agency's monthly shift chart.
const roster = require('./roster.js')(app, { catalyst, selectAll, requireRowId, fail, auth });

// Switched-on branches of my area (from the warm cache, so usually no read).
async function activeBranches(req, zcql) {
  return (await auth.branchList(zcql)).filter(b => b.is_active === 'true' && auth.branchOk(req, b.ROWID));
}

/* ---------------- POST HANDOVER (post.js) ---------------- */

const post = require('./post.js')(app, {
  catalyst, selectAll, requireRowId, requireDate, fail, guardByToken, sendPushToGuard, sendPushToRows, getVapidKeys,
  getShifts, shiftDate, weekStartOf, IST_OFFSET_MIN, auth
});

module.exports = app;
