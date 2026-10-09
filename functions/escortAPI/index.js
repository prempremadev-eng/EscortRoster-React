"use strict"

const express = require('express');
const catalyst = require('zcatalyst-sdk-node');

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
