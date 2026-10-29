"use strict"

const express = require('express');
const catalyst = require('zcatalyst-sdk-node');
const crypto = require('crypto');
const webpush = require('web-push');
const { ROTATION, computeDisplayRows, dayOf } = require('./seats.js');
const { escortDay } = require('./escortRoster.js');

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
    // Month Roster weekday (notes/ESCORT-RULES.md): the rows are today's C escorts, already in seat
    // order (6 to 5, then 9 to 6), details from Guard Master; the page shows them as they come.
    const rosterDay = await escortDay(catalystApp, date);
    if (rosterDay) {
      const [duty, stops] = await Promise.all([
        selectAll(zcql, 'DutyRecords', `SELECT * FROM DutyRecords WHERE duty_date = '${date}' ORDER BY ROWID ASC`),
        selectAll(zcql, 'TripStops', `SELECT * FROM TripStops WHERE duty_date = '${date}' ORDER BY CREATEDTIME ASC`)
      ]);
      // First card IN of each escort today (supervisor's sheet only; late = after 18:00 / 21:00 or after midnight).
      const onDuty = rosterDay.rows.filter(r => r.onDuty);
      const ins = onDuty.length ? await selectAll(zcql, 'AccessLog', `SELECT guard_id, punch_time FROM AccessLog WHERE duty_date = '${date}' AND direction = 'IN' AND guard_id IN (${onDuty.map(r => requireRowId(r.guardId)).join(', ')}) ORDER BY CREATEDTIME ASC`) : [];
      const firstIn = {};
      ins.forEach(x => { if (!firstIn[String(x.guard_id)]) firstIn[String(x.guard_id)] = x.punch_time; });
      const escorts = onDuty.map(r => {
        const at = firstIn[r.guardId] || '';
        const start = r.batch === '6 to 5' ? '18:00' : '21:00';
        return {
          ROWID: String(r.guard.escort_id), escort_name: r.guard.guard_name, agency: r.guard.agency || '',
          mobile: r.guard.phone || '', id_no: r.guard.id_number || '', sort_order: r.seat, seat: r.seat, batch: r.batch,
          in_time: at, in_late: !!at && (at > start || at < '12:00')
        };
      });
      return res.status(200).json({ status: 'success', data: { escorts, duty, stops, roster: { day0: rosterDay.day0 } } });
    }
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
// A guard's swipes of a duty day, newest first (IN / OUT and time).
async function punchesOf(zcql, guardId, dutyDate) {
  return (await zcql.executeZCQLQuery(`SELECT direction, punch_time FROM AccessLog WHERE guard_id = ${guardId} AND duty_date = '${dutyDate}' ORDER BY CREATEDTIME DESC LIMIT 0, 50`)).map(r => r.AccessLog);
}

async function onCardIn(catalystApp, guard, time, dutyDate) {
  const zcql = catalystApp.zcql();
  const ins = await zcql.executeZCQLQuery(`SELECT ROWID FROM AccessLog WHERE guard_id = ${guard.ROWID} AND duty_date = '${dutyDate}' AND direction = 'IN'`);
  const duty = await dutyOf(zcql, guard.ROWID, weekStartOf(shiftDate()), shiftDate());
  // POST guard: their DutyLog row starts "waiting" until they press Taken over (post.js).
  // Made on any IN of the day that finds none (the chart may have changed after the first IN);
  // a new row also means a new notification.
  const newPostLog = duty && duty.post.post_type === 'POST' ? (await post.onPostIn(catalystApp, guard, duty)).created : false;
  // Back IN after a card OUT the same duty day: notify again (the escort page opens again).
  const punches = await punchesOf(zcql, guard.ROWID, dutyDate);
  const backAfterOut = punches[1] && punches[1].direction === 'OUT';
  if (ins.length > 1 && !newPostLog && !backAfterOut) return { skipped: 'already IN today' };

  let body = 'Duty not assigned yet. Ask your supervisor.';
  let seat = null;
  // No post for today yet: the month roster may still say the shift (or a week off / leave).
  let rosterShift = '';
  if (!duty) {
    rosterShift = await roster.shiftOf(zcql, guard.ROWID, shiftDate());
    const sh = (await getShifts(zcql, guard.branch_id)).find(x => x.code === rosterShift);
    if (sh) body = 'Today: ' + shiftText(sh) + ' (month roster). Your supervisor will give your post.';
    else if (rosterShift === 'O') body = 'The month roster says today is your week off. Ask your supervisor.';
    else if (rosterShift === 'L') body = 'The month roster says you are on leave today. Ask your supervisor.';
  }
  // Month Roster escort duty (C escort on a weekday): "Today your Seat 5 · Escort 6 to 5".
  const rosterDay = !duty || duty.post.post_type === 'ESCORT' ? await escortDay(catalystApp, dutyDate) : null;
  const myRow = rosterDay && rosterDay.rows.find(r => r.guardId === String(guard.ROWID) && r.onDuty);
  if (myRow) {
    seat = myRow.seat;
    const sh = (await getShifts(zcql, guard.branch_id)).find(x => x.code === 'C');
    body = 'Today your Seat ' + seat + ' · Escort ' + myRow.batch + (sh ? ' · ' + shiftText(sh) : '');
  } else if (duty && duty.post.post_type === 'ESCORT') {
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
      // Escort guard: tell the phone, so an open escort page refreshes and locks.
      if (guard.escort_id) {
        try {
          push = await sendPushToGuard(catalystApp, guard.ROWID, {
            title: '🚪 OUT ' + time, body: 'Your escort page is closed. Swipe IN to open it again.',
            url: guard.guard_token ? 'index.html#guard/' + guard.guard_token : 'index.html'
          });
        } catch (err) {
          console.error('Card OUT push failed:', err);
        }
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
    // Month Roster escort duty (C escort on a weekday) comes before the old weekly chart.
    const rosterDay = !duty || duty.post.post_type === 'ESCORT' ? await escortDay(catalystApp, dutyDate) : null;
    const myRow = rosterDay && rosterDay.rows.find(r => r.guardId === String(me.ROWID) && r.onDuty);
    const shiftC = myRow ? (await getShifts(zcql, me.branch_id)).find(x => x.code === 'C') : null;

    // First IN time of each guard (by Guards ROWID) on this duty day.
    const ins = await selectAll(zcql, 'AccessLog', `SELECT guard_id, punch_time FROM AccessLog WHERE duty_date = '${dutyDate}' AND direction = 'IN' ORDER BY CREATEDTIME ASC`);
    const inTime = {};
    ins.forEach(r => { if (!inTime[String(r.guard_id)]) inTime[String(r.guard_id)] = r.punch_time; });
    const myId = String(me.ROWID);
    const base = {
      name: me.guard_name, dutyDate,
      dutyType: myRow ? 'ESCORT' : duty ? duty.post.post_type : null,
      postName: myRow ? 'Escort · ' + myRow.batch : duty ? duty.post.post_name : null,
      shift: myRow ? shiftC : duty ? duty.shift : null
    };
    const myEscortRow = myRow ? String(myRow.guard.escort_id) : me.escort_id;
    if (!inTime[myId]) {
      return res.status(200).json({ status: 'success', data: { ...base, locked: true } });
    }
    // Card OUT after the IN (left in between): the page locks until the next IN.
    const last = (await punchesOf(zcql, me.ROWID, dutyDate))[0];
    if (last && last.direction === 'OUT') {
      return res.status(200).json({ status: 'success', data: { ...base, locked: true, outTime: last.punch_time } });
    }
    // Latest IN (after an OUT and back IN): the phone starts again from the "Your seat" screen.
    base.lastIn = last ? last.punch_time : inTime[myId];
    // No post yet: is today's schedule made but not published? (the page then says so, not "not assigned")
    if (!base.dutyType) {
      const drafts = await zcql.executeZCQLQuery(`SELECT ROWID FROM Schedule WHERE guard_id = ${requireRowId(me.ROWID)} AND sched_date = '${chartDay}' AND published = false LIMIT 1`);
      base.waitPublish = drafts.length > 0;
    }

    const day = dayOf(dutyDate);
    if (base.dutyType !== 'ESCORT' || !myEscortRow || day === 0 || day === 6) {
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
    const myEscortId = String(myEscortRow);
    // The whole duty sheet of the day in the supervisor's layout; only the guard's own row can be
    // changed (the write routes below check that). Other rows send no employee details, only how
    // many employees a trip has. Mobile and ID numbers are left out: every guard sees this page.
    const stopCount = {};
    dayStops.forEach(x => { stopCount[String(x.duty_record_id)] = (stopCount[String(x.duty_record_id)] || 0) + 1; });
    const byEscort = {};
    records.forEach(r => { (byEscort[String(r.escort_id)] = byEscort[String(r.escort_id)] || []).push(r); });
    // Roster day: both lists (6 to 5, then 9 to 6) with their seat numbers, like the supervisor's sheet; else the old sheet.
    const rows = myRow
      ? rosterDay.rows.filter(r => r.onDuty).map(r => ({ ROWID: r.guard.escort_id, escort_name: r.guard.guard_name, agency: r.guard.agency || '', seat: r.seat, batch: r.batch }))
      : computeDisplayRows(escorts, ROTATION, start && start.setting_value, dutyDate);
    const sheet = rows.map((e, i) => {
      const id = String(e.ROWID);
      const recs = byEscort[id] || [];
      const first = recs.find(r => (parseInt(r.route_no, 10) || 1) === 1);
      return {
        escortId: id, seat: e.seat || i + 1, batch: e.batch || '', me: id === myEscortId, name: e.escort_name, agency: e.agency,
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
  const last = (await punchesOf(zcql, me.ROWID, dutyDate))[0];
  if (last && last.direction === 'OUT') throw new Error('Your card is OUT (' + last.punch_time + '). Swipe IN to continue.');
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
      // Seat on the sheet for this day, so the supervisor sees it on the right row
      // (Month Roster seat on a roster weekday, else the old Start Date rotation).
      const rosterDay = await escortDay(catalystApp, ctx.dutyDate);
      const myRow = rosterDay && rosterDay.rows.find(r => r.guardId === String(ctx.me.ROWID) && r.onDuty);
      let seat = myRow ? myRow.seat : null;
      if (!rosterDay) {
        const [escorts, start] = await Promise.all([
          selectAll(zcql, 'Escorts', "SELECT ROWID FROM Escorts WHERE is_active = 'true' ORDER BY sort_order ASC"),
          getSetting(zcql, 'start_date')
        ]);
        seat = seatOf(escorts, ctx.me.escort_id, start && start.setting_value, ctx.dutyDate);
      }
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
// Each branch may have its own times (Prem, 29 Oct: Cumbum B 14–22, Estancia B 13–21): Branches.shift_times
// "A 06:00-14:00, B 14:00-22:00, C 22:00-06:00, G 09:00-18:00". A shift not written there keeps the common
// time from the Shifts table. Read with the branches every 5 minutes at most.
let branchTimes = null, branchTimesAt = 0;
function parseShiftTimes(text) {
  const out = {};
  String(text || '').split(',').forEach(part => {
    const m = part.trim().toUpperCase().match(/^([ABCG])\s*(\d{1,2}):?(\d{2})\s*-\s*(\d{1,2}):?(\d{2})$/);
    if (m) out[m[1]] = { start: m[2].padStart(2, '0') + ':' + m[3], end: m[4].padStart(2, '0') + ':' + m[5] };
  });
  return out;
}
async function branchShiftTimes(zcql) {
  if (!branchTimes || Date.now() - branchTimesAt > 5 * 60000) {
    try {
      const rows = await selectAll(zcql, 'Branches', 'SELECT ROWID, shift_times FROM Branches ORDER BY ROWID ASC');
      branchTimes = {};
      rows.forEach(r => { const t = parseShiftTimes(r.shift_times); if (Object.keys(t).length) branchTimes[String(r.ROWID)] = t; });
    } catch (err) {
      branchTimes = {}; // no shift_times column yet: everybody keeps the common times
    }
    branchTimesAt = Date.now();
  }
  return branchTimes;
}
function forgetShiftTimes() { branchTimes = null; }
async function getShifts(zcql, branchId) {
  if (!shiftCache) {
    const rows = await selectAll(zcql, 'Shifts', 'SELECT shift_code, start_time, end_time FROM Shifts ORDER BY shift_code ASC');
    shiftCache = rows.map(r => ({ code: r.shift_code, start: r.start_time, end: r.end_time }));
  }
  if (!branchId) return shiftCache;
  const own = (await branchShiftTimes(zcql))[String(branchId)];
  return own ? shiftCache.map(sh => (own[sh.code] ? { ...sh, ...own[sh.code] } : sh)) : shiftCache;
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
  // The weekly Duty Chart is no longer a fallback (Prem, 22 Oct): no published schedule → no post.
  if (!c) return null;
  const posts = await zcql.executeZCQLQuery(`SELECT ROWID, post_name, post_type, branch_id FROM Posts WHERE ROWID = ${c.post_id}`);
  const shifts = await getShifts(zcql, posts.length ? posts[0].Posts.branch_id : null); // the post's branch times
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
      selectAll(zcql, 'Posts', 'SELECT ROWID, branch_id, agency_id, post_name, post_type, vehicle_entry, extra_duty, auto_fill, section, sort_order, shift_codes, regular_guards, relief_guards, is_active FROM Posts ORDER BY post_name ASC'),
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

// Posts: Branch Admin, and a supervisor for their own agency's posts (Prem, 25 Oct: the ISS shift incharge
// sets up ISS posts). A supervisor's post always gets their agency.
// Auto fill details from the Post setup form (Prem, 25 Oct: no more setting them in the database by hand).
// body.rules = { regular: [guard ids, first = first choice], relief: [ids], priority: '1'–'9' or '',
//   never_empty: F, daily: D, weekdays: W, regular_only: '' | shifts ('ABCG' = every shift) }.
// Posts.relief_guards keeps "relief ; weekend ; lady shifts ; flags": the weekend list and lady shifts
// (not in the form) stay as they were. Only guards of the post's branch and agency are kept.
async function applyRules(zcql, row, rules, oldRelief) {
  if (!rules || typeof rules !== 'object') return row;
  const ids = list => (Array.isArray(list) ? list : []).map(x => String(requireRowId(x)));
  const wanted = [...new Set(ids(rules.regular).concat(ids(rules.relief)))];
  const ok = new Set(wanted.length ? (await zcql.executeZCQLQuery(`SELECT ROWID FROM Guards WHERE branch_id = ${row.branch_id} AND agency_id = ${row.agency_id} AND ROWID IN (${wanted.join(', ')})`)).map(r => String(r.Guards.ROWID)) : []);
  const keep = list => [...new Set(ids(list))].filter(id => ok.has(id));
  const parts = String(oldRelief || '').split(';');
  while (parts.length < 4) parts.push('');
  const only = String(rules.regular_only || '').toUpperCase().replace(/[^ABCG]/g, '');
  const flags = (/^[1-9]$/.test(String(rules.priority || '')) ? String(rules.priority) : '') + (rules.never_empty ? 'F' : '') + (rules.daily ? 'D' : '')
    + (rules.weekdays ? 'W' : '') + (rules.regular_only ? 'R' + (only === 'ABCG' ? '' : only) : '');
  parts[0] = keep(rules.relief).join(',');
  parts[3] = flags;
  row.regular_guards = keep(rules.regular).join(',') || null;
  row.relief_guards = parts.join(';').replace(/^;+$/, '') || null;
  return row;
}
const ownAgency = (req, row) => { if (req.user.role === 'supervisor') row.agency_id = requireRowId(req.user.agency_id); return row; };
app.post('/addPost', async (req, res) => {
  try {
    auth.need(req, 'supervisor');
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
    const row = ownAgency(req, postFromBody(req.body || {}));
    await checkPost(req, catalystApp.zcql(), row, null);
    await applyRules(catalystApp.zcql(), row, req.body.rules, '');
    const result = await catalystApp.datastore().table('Posts').insertRow(row);
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    fail(res, err);
  }
});

// Delete a post for good (Prem, 28 Oct: test posts). Only a post that is switched off and was never used:
// no schedule, chart, duty, chat, break, alert, presence, safety, vehicle or work row points to it.
// A used post stays (switched off) so old history keeps its name.
app.post('/deletePost', async (req, res) => {
  try {
    auth.need(req, 'supervisor');
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
    const zcql = catalystApp.zcql();
    const id = requireRowId(req.body.ROWID);
    const found = await zcql.executeZCQLQuery(`SELECT ROWID, branch_id, agency_id, is_active, post_name FROM Posts WHERE ROWID = ${id}`);
    if (!found.length) throw new Error('Post not found');
    const post = auth.requireRow(req, found[0].Posts, 'post');
    if (String(post.is_active) === 'true') throw new Error('Switch the post off first.');
    const uses = ['Schedule', 'DutyChart', 'DutyLog', 'PostMessages', 'WorkUpdates', 'Breaks', 'Alerts', 'Presence', 'SafetyEntries', 'VehicleEntries']
      .map(t => [t, `SELECT ROWID FROM ${t} WHERE post_id = ${id} LIMIT 1`]);
    uses.push(['Breaks (cover)', `SELECT ROWID FROM Breaks WHERE cover_post_id = ${id} LIMIT 1`]);
    const used = [];
    for (const [t, sql] of uses) if ((await zcql.executeZCQLQuery(sql)).length) used.push(t);
    if (used.length) throw new Error(post.post_name + ' has history (' + used.join(', ') + '), so it stays switched off and is not deleted.');
    await catalystApp.datastore().table('Posts').deleteRow(id);
    res.status(200).json({ status: 'success', data: { deleted: post.post_name } });
  } catch (err) {
    fail(res, err);
  }
});

// The order of the posts on the daily sheet (Prem, 28 Oct: a supervisor adds a post any day and puts it where
// it suits him): the posts in their new order, numbered 1, 2, 3 … Only posts he may edit.
app.post('/postOrder', async (req, res) => {
  try {
    auth.need(req, 'supervisor');
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
    const ids = (Array.isArray(req.body.ids) ? req.body.ids : []).map(requireRowId);
    if (!ids.length || ids.length > 300) throw new Error('Nothing to order.');
    const found = await catalystApp.zcql().executeZCQLQuery(`SELECT ROWID, branch_id, agency_id FROM Posts WHERE ROWID IN (${ids.join(', ')})`);
    if (found.length !== new Set(ids).size) throw new Error('Post not found');
    found.forEach(r => auth.requireRow(req, r.Posts, 'post'));
    if (new Set(found.map(r => String(r.Posts.branch_id) + '-' + String(r.Posts.agency_id))).size > 1) throw new Error('Order the posts of one branch and agency at a time.');
    const rows = ids.map((id, i) => ({ ROWID: id, sort_order: i + 1 }));
    const table = catalystApp.datastore().table('Posts');
    for (let i = 0; i < rows.length; i += 100) await table.updateRows(rows.slice(i, i + 100));
    res.status(200).json({ status: 'success', data: { ordered: rows.length } });
  } catch (err) {
    fail(res, err);
  }
});

// Rename / change type, or switch a post off (never deleted: old charts point to it).
app.put('/updatePost', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
    auth.need(req, 'supervisor');
    const b = req.body || {};
    const rowid = requireRowId(b.ROWID);
    const row = ownAgency(req, postFromBody(b));
    const zcql = catalystApp.zcql();
    const old = await zcql.executeZCQLQuery(`SELECT ROWID, branch_id, agency_id, relief_guards FROM Posts WHERE ROWID = ${rowid}`);
    if (!old.length) throw new Error('Post not found');
    auth.requireRow(req, old[0].Posts, 'post');
    await checkPost(req, zcql, row, rowid);
    await applyRules(zcql, row, b.rules, old[0].Posts.relief_guards);
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
      selectAll(zcql, 'Guards', 'SELECT ROWID, id_number, card_number, guard_name, agency, agency_id, branch_id, area, tags, escort_id, phone, photo_key, gender, designation, date_of_joining, date_of_birth, emergency_contact, aadhaar_last4, aadhaar_file_key, relieved_date, relieved_reason, created_by, modified_by, CREATEDTIME, MODIFIEDTIME, is_active FROM Guards ORDER BY id_number ASC').then(g => auth.inArea(req, g)),
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
    phone: phone || null,
    // Tags (Prem, 28 Oct): Lady, Document, Driver … for lists in the roster and schedule. Sent only by the form.
    ...(b.tags !== undefined ? { tags: cleanTags(b.tags) } : {}),
    // The agency's "All Security Details" columns (Prem, 29 Oct: one format for every branch). Sent only by the form
    // and the Excel import, so older screens do not clear them.
    ...personalFromBody(b)
  };
}
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
function personalFromBody(b) {
  const out = {};
  const date = (k, label) => { if (b[k] === undefined) return; const v = String(b[k] || '').trim(); if (v && !DATE_ONLY.test(v)) throw new Error(label + ': pick a date'); out[k] = v || null; };
  if (b.gender !== undefined) { const g = String(b.gender || '').trim(); if (g && !['Male', 'Female', 'Other'].includes(g)) throw new Error('Gender: Male, Female or Other'); out.gender = g || null; }
  if (b.designation !== undefined) out.designation = String(b.designation || '').trim().slice(0, 40) || null;
  date('date_of_joining', 'Date of joining');
  date('date_of_birth', 'Date of birth');
  if (b.emergency_contact !== undefined) { const e = String(b.emergency_contact || '').trim(); if (e && !/^[0-9+ ]{6,15}$/.test(e)) throw new Error('Emergency contact: numbers only (6 to 15)'); out.emergency_contact = e || null; }
  return out;
}
// Aadhaar number: kept encrypted (AES-256-GCM, key in Settings 'aadhaar_key'); screens see only the last 4 digits.
async function aadhaarFields(catalystApp, value) {
  if (value === undefined) return {};
  const n = String(value || '').replace(/\s/g, '');
  if (!n) return { aadhaar_enc: null, aadhaar_last4: null };
  if (!/^\d{12}$/.test(n)) throw new Error('Aadhaar No: 12 digits');
  const zcql = catalystApp.zcql();
  let key = await getSetting(zcql, 'aadhaar_key');
  if (!key || !key.setting_value) { await saveSetting(catalystApp, 'aadhaar_key', crypto.randomBytes(32).toString('hex')); key = await getSetting(zcql, 'aadhaar_key'); }
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', Buffer.from(key.setting_value, 'hex'), iv);
  const enc = Buffer.concat([c.update(n, 'utf8'), c.final()]);
  return { aadhaar_enc: [iv, c.getAuthTag(), enc].map(x => x.toString('base64')).join('.'), aadhaar_last4: n.slice(-4) };
}
// "Lady, document ,Lady" → "Lady,Document": words only, first letter capital, no repeats, at most 10.
function cleanTags(v) {
  const list = (Array.isArray(v) ? v : String(v || '').split(','))
    .map(t => String(t).replace(/[^A-Za-z0-9 ]/g, '').trim().slice(0, 20))
    .filter(Boolean)
    .map(t => t.charAt(0).toUpperCase() + t.slice(1));
  return [...new Set(list)].slice(0, 10).join(',') || null;
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
  // An all-digit ID / card is the same with or without leading zeros (024187 = 24187, Prem 28 Oct), as the
  // roster upload reads it; so both spellings count as taken.
  const spellings = v => (/^\d+$/.test(v) ? [...new Set([0, 1, 2, 3].map(n => '0'.repeat(n) + String(v).replace(/^0+/, '')))] : [v]).map(x => `'${x}'`).join(', ');
  const checks = [
    zcql.executeZCQLQuery(`SELECT ROWID FROM Guards WHERE id_number IN (${spellings(row.id_number)})`),
    zcql.executeZCQLQuery(`SELECT ROWID FROM Branches WHERE ROWID = ${row.branch_id} AND is_active = 'true'`),
    row.card_number ? zcql.executeZCQLQuery(`SELECT ROWID FROM Guards WHERE card_number IN (${spellings(row.card_number)})`) : Promise.resolve([]),
    selectAll(zcql, 'Guards', `SELECT ROWID, guard_name, id_number FROM Guards WHERE agency_id = ${requireRowId(row.agency_id)} ORDER BY ROWID ASC`)
  ];
  if (row.escort_id) {
    checks.push(zcql.executeZCQLQuery(`SELECT ROWID FROM Escorts WHERE ROWID = ${row.escort_id} AND is_active = 'true'`));
    checks.push(zcql.executeZCQLQuery(`SELECT ROWID FROM Guards WHERE escort_id = ${row.escort_id} AND is_active = 'true'`));
  }
  const [sameId, branch, sameCard, allGuards, escort, escortTaken] = await Promise.all(checks);
  if (other(sameId)) throw new Error('ID number ' + row.id_number + ' is already used');
  if (other(sameCard)) throw new Error('Card number ' + row.card_number + ' is already used');
  // One name = one guard in the same agency (Prem, 26 Oct: an ISI and an IPF guard may share a name; the
  // message no longer shows another agency's guard). Two people with the same name in one agency: add their
  // number ("Name M 1234"). Case, spaces, dots and dashes are ignored. ID and card stay unique app-wide.
  const key = name => String(name || '').toLowerCase().replace(/[\s.-]+/g, '');
  const twin = allGuards.find(g => key(g.guard_name) === key(row.guard_name) && String(g.ROWID) !== String(selfId || ''));
  if (twin) throw new Error(twin.guard_name + ' (' + twin.id_number + ') already has this name. Add their number to the name, e.g. ' + row.guard_name + ' 1234.');
  if (!branch.length) throw new Error('Branch not found');
  if (row.escort_id && !escort.length) throw new Error('Escort not found');
  if (row.escort_id && other(escortTaken)) throw new Error('This escort is already linked to another guard');
}

// "⭐ Shift Incharge" tick in the guard form (Prem, 25 Oct): keeps Agencies.incharge_ids in step, so
// whoever adds a guard can mark the incharge without the Admin page. Only the guard's own agency lists them.
async function setIncharge(catalystApp, zcql, guardId, agencyId, on) {
  if (on === undefined) return;
  const agencies = (await zcql.executeZCQLQuery('SELECT ROWID, incharge_ids FROM Agencies')).map(r => r.Agencies);
  const table = catalystApp.datastore().table('Agencies');
  for (const a of agencies) {
    const ids = String(a.incharge_ids || '').split(',').map(x => x.trim()).filter(Boolean);
    const want = on === true && String(a.ROWID) === String(agencyId);
    const has = ids.includes(String(guardId));
    if (want && !has) await table.updateRow({ ROWID: a.ROWID, incharge_ids: ids.concat(String(guardId)).join(',') });
    if (!want && has) await table.updateRow({ ROWID: a.ROWID, incharge_ids: ids.filter(x => x !== String(guardId)).join(',') });
  }
}
app.post('/addGuard', async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
    const row = { ...guardFromBody(req.body || {}), ...(await aadhaarFields(catalystApp, (req.body || {}).aadhaar_no)) };
    await checkGuard(req, catalystApp.zcql(), row, null);
    const result = await catalystApp.datastore().table('Guards').insertRow({ ...row, created_by: req.user.name, modified_by: req.user.name });
    await setIncharge(catalystApp, catalystApp.zcql(), result.ROWID, row.agency_id, req.body.incharge);
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
    const row = { ...guardFromBody(req.body), ...(await aadhaarFields(catalystApp, req.body.aadhaar_no)) };
    await checkGuard(req, zcql, row, current.ROWID);
    const result = await catalystApp.datastore().table('Guards').updateRow({ ROWID: current.ROWID, ...row, modified_by: req.user.name });
    await setIncharge(catalystApp, zcql, current.ROWID, row.agency_id || current.agency_id, req.body.incharge);
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
    // Switched off = relieved (Prem, 29 Oct): the date (today if not given) and the reason are kept; back on clears them.
    const today = new Date(Date.now() + IST_OFFSET_MIN * 60000).toISOString().slice(0, 10);
    const rd = String(req.body.relieved_date || '').trim();
    if (rd && !DATE_ONLY.test(rd)) throw new Error('Relieved date: pick a date');
    const relieved = active ? { relieved_date: null, relieved_reason: null } : { relieved_date: rd || today, relieved_reason: String(req.body.relieved_reason || '').trim().slice(0, 255) || null };
    const result = await catalystApp.datastore().table('Guards').updateRow({ ROWID: guard.ROWID, is_active: active ? 'true' : 'false', ...relieved, modified_by: req.user.name });
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

// 🧪 Face match test (Prem, 29 Oct, before the Cumbum QR attendance): two photos → Zia facial comparison
// (IN data centre). Admin only; nothing is saved. Photos come as data URLs, written to /tmp because the SDK
// sends file streams.
app.post('/faceTest', async (req, res) => {
  const files = [];
  try {
    auth.need(req, 'admin');
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
    const take = (v, name) => {
      const m = String(v || '').match(/^data:image\/(jpeg|png|webp);base64,(.+)$/);
      if (!m) throw new Error('Pick two photos (JPG / PNG / WEBP).');
      const file = require('os').tmpdir() + '/face-' + crypto.randomBytes(6).toString('hex') + '-' + name + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1]);
      require('fs').writeFileSync(file, Buffer.from(m[2], 'base64'));
      files.push(file);
      return require('fs').createReadStream(file);
    };
    const a = take(req.body.a, 'a'), b = take(req.body.b, 'b');
    const t0 = Date.now();
    const result = await catalystApp.zia().compareFace(a, b);
    const ms = Date.now() - t0;
    // Where the eyes and nose are on photo 2 (front face / head turn checks for the gate QR).
    let face = null;
    try { face = await catalystApp.zia().analyseFace(require('fs').createReadStream(files[1]), { mode: 'advanced' }); } catch (e) { face = { error: e.message }; }
    console.log('faceTest analyseFace', JSON.stringify(face));
    res.status(200).json({ status: 'success', data: { result, ms, face } });
  } catch (err) {
    fail(res, err);
  } finally {
    files.forEach(f => { try { require('fs').unlinkSync(f); } catch (e) { /* gone */ } });
  }
});

// Aadhaar file (photo or PDF) of a guard, private in the media bucket; opened with a 10-minute link.
const AADHAAR_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf' };
app.post('/guardAadhaarFile', express.raw({ type: () => true, limit: '6mb' }), async (req, res) => {
  try {
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
    const guard = auth.requireRow(req, await guardById(catalystApp.zcql(), req.query.guard), 'guard');
    const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    const ext = AADHAAR_TYPES[type];
    if (!ext) throw new Error('Aadhaar file: JPG, PNG or PDF.');
    if (!Buffer.isBuffer(req.body) || !req.body.length || req.body.length > GUARD_PHOTO_MAX) throw new Error('Aadhaar file: up to 5 MB.');
    const bucket = catalystApp.stratus().bucket('escortcardaccess-media');
    const key = 'aadhaar/' + guard.ROWID + '-' + crypto.randomBytes(8).toString('hex') + '.' + ext;
    await bucket.putObject(key, req.body, { contentType: type });
    const old = (await catalystApp.zcql().executeZCQLQuery(`SELECT aadhaar_file_key FROM Guards WHERE ROWID = ${guard.ROWID}`))[0].Guards.aadhaar_file_key;
    await catalystApp.datastore().table('Guards').updateRow({ ROWID: guard.ROWID, aadhaar_file_key: key, modified_by: req.user.name });
    if (old) { try { await bucket.deleteObject(old); } catch (err) { console.error('Old Aadhaar file not removed:', err.message || err); } }
    res.status(200).json({ status: 'success', data: { aadhaar_file_key: key } });
  } catch (err) {
    fail(res, err);
  }
});
app.get('/guardAadhaarUrl', async (req, res) => {
  try {
    auth.need(req, 'supervisor');
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
    const rows = await catalystApp.zcql().executeZCQLQuery(`SELECT aadhaar_file_key, branch_id, agency_id FROM Guards WHERE ROWID = ${requireRowId(req.query.guard)}`);
    if (!rows.length) throw new Error('Guard not found');
    const key = auth.requireRow(req, rows[0].Guards, 'guard').aadhaar_file_key;
    if (!key) return res.status(200).json({ status: 'success', data: { url: null } });
    const r = await catalystApp.stratus().bucket('escortcardaccess-media').generatePreSignedUrl(key, 'GET', { expiryIn: '600' });
    res.status(200).json({ status: 'success', data: { url: r.signature } });
  } catch (err) {
    fail(res, err);
  }
});

// Guard photos for the 📤 Export Excel (29 Oct: the Photo column holds the real picture): up to 5 guards per call,
// as data the browser can shrink and put into the sheet.
app.post('/guardPhotosData', async (req, res) => {
  try {
    auth.need(req, 'supervisor');
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
    const ids = (Array.isArray(req.body.ids) ? req.body.ids : []).slice(0, 5).map(requireRowId);
    if (!ids.length) return res.status(200).json({ status: 'success', data: [] });
    const rows = (await catalystApp.zcql().executeZCQLQuery(`SELECT ROWID, photo_key, branch_id, agency_id FROM Guards WHERE ROWID IN (${ids.join(', ')})`)).map(r => r.Guards);
    const bucket = catalystApp.stratus().bucket('escortcardaccess-media');
    const out = [];
    for (const g of rows) {
      if (!g.photo_key) continue;
      auth.requireRow(req, g, 'guard');
      try {
        const obj = await bucket.getObject(g.photo_key);
        const chunks = [];
        for await (const c of obj) chunks.push(Buffer.from(c));
        const ext = String(g.photo_key).split('.').pop().toLowerCase();
        out.push({ id: String(g.ROWID), mime: ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg', b64: Buffer.concat(chunks).toString('base64') });
      } catch (err) { console.error('Photo for export failed:', err.message || err); }
    }
    res.status(200).json({ status: 'success', data: out });
  } catch (err) {
    fail(res, err);
  }
});

// 📥 Guards from the agency's "All Security Details" Excel (Prem, 29 Oct): one row per guard; Clock NO is the
// ID. A Clock NO already in the app updates that guard, a new one adds a guard. Agency and Branch by name.
app.post('/guardImport', async (req, res) => {
  try {
    auth.need(req, 'supervisor');
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
    const zcql = catalystApp.zcql();
    const rows = Array.isArray(req.body.rows) ? req.body.rows.slice(0, 1000) : [];
    if (!rows.length) throw new Error('No rows in the file.');
    const [agencies, branches, guards] = await Promise.all([
      admin.agencyList(zcql),
      activeBranches(req, zcql),
      selectAll(zcql, 'Guards', 'SELECT ROWID, id_number, branch_id, agency_id FROM Guards ORDER BY ROWID ASC').then(g => auth.inArea(req, g))
    ]);
    const norm = v => String(v || '').trim().toUpperCase().replace(/^0+(?=\d)/, '');
    const byId = new Map(guards.map(g => [norm(g.id_number), g]));
    // "Cumbum - ISI" → ISI: the longest agency name inside the text.
    const agencyOf = t => agencies.filter(a => String(t || '').toUpperCase().includes(String(a.agency_name).toUpperCase())).sort((x, y) => y.agency_name.length - x.agency_name.length)[0];
    const branchOf = t => branches.find(b => String(b.branch_name).trim().toUpperCase() === String(t || '').trim().toUpperCase());
    const table = catalystApp.datastore().table('Guards');
    let added = 0, updated = 0;
    const skipped = [], ids = {}; // Clock NO → guard, so the page can add the photos from the Excel
    for (const [i, r] of rows.entries()) {
      const line = 'Row ' + (i + 2);
      try {
        const id = String(r.clock || '').trim();
        if (!id) throw new Error('no Clock NO');
        const ag = agencyOf(r.agency), br = branchOf(r.branch);
        if (!ag) throw new Error('agency "' + r.agency + '" not found');
        if (!br) throw new Error('branch "' + r.branch + '" not found');
        const body = {
          id_number: id, card_number: r.vendor || '', guard_name: r.name, agency_id: ag.ROWID, branch_id: br.ROWID, phone: String(r.mobile || '').replace(/[^0-9+ ]/g, '').slice(-15),
          gender: r.gender || '', designation: r.designation || '', date_of_joining: r.doj || '', date_of_birth: r.dob || '', emergency_contact: String(r.emergency || '').replace(/[^0-9+ ]/g, '')
        };
        const row = { ...guardFromBody(body), ...(r.aadhaar ? await aadhaarFields(catalystApp, r.aadhaar) : {}) };
        const old = byId.get(norm(id));
        await checkGuard(req, zcql, row, old ? old.ROWID : null);
        const relieved = /relie|inactive|left/i.test(String(r.status || ''));
        const state = relieved ? { is_active: 'false', relieved_date: DATE_ONLY.test(String(r.relievedDate || '')) ? r.relievedDate : null, relieved_reason: String(r.relievedReason || '').slice(0, 255) || null } : {};
        if (old) { await table.updateRow({ ROWID: old.ROWID, ...row, ...state, modified_by: req.user.name }); updated++; ids[id] = String(old.ROWID); }
        else { const ins = await table.insertRow({ ...row, ...state, created_by: req.user.name, modified_by: req.user.name }); byId.set(norm(id), ins); added++; ids[id] = String(ins.ROWID); }
      } catch (err) {
        skipped.push(line + ': ' + (err.message || err));
      }
    }
    res.status(200).json({ status: 'success', data: { added, updated, skipped, ids } });
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

const admin = require('./admin.js')(app, { catalyst, selectAll, requireRowId, requireText, fail, auth, parseShiftTimes, forgetShiftTimes });

// Month roster (roster.js): the agency's monthly shift chart.
const roster = require('./roster.js')(app, { catalyst, selectAll, requireRowId, fail, auth });

// Switched-on branches of my area (from the warm cache, so usually no read).
async function activeBranches(req, zcql) {
  return (await auth.branchList(zcql)).filter(b => b.is_active === 'true' && auth.branchOk(req, b.ROWID));
}

/* ---------------- POST HANDOVER (post.js) ---------------- */

const post = require('./post.js')(app, {
  catalyst, selectAll, requireRowId, requireDate, fail, guardByToken, sendPushToGuard, sendPushToRows, getVapidKeys,
  getShifts, shiftDate, weekStartOf, IST_OFFSET_MIN, auth, getSetting, dutyOf, istNow
});

// QR attendance at a gate without a card machine (qr.js, Cumbum, 29 Oct).
require('./qr.js')(app, {
  catalyst, fail, requireRowId, auth, istNow, getShifts, getVapidKeys, onCardIn,
  onPostOut: (...a) => post.onPostOut(...a), rosterShiftOf: (...a) => roster.shiftOf(...a),
  notify: (...a) => post.notify(...a), getSetting
});

module.exports = app;
