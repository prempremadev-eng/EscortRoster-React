"use strict"

/* ---------------- VEHICLE ENTRY (posts with Posts.vehicle_entry on) ---------------- */
// Brought in from the separate vehicle entry app (phase 1 + photo + plate scan + voice).
// One VehicleEntries row per vehicle visit: IN (guard or supervisor) → OUT (any guard of the post).
//   entry_type employee: vehicle no + employee no
//   entry_type visitor : vehicle no + name, phone, coming from, whom to meet
//   entry_type vendor  : vehicle no + name, phone, coming from (whom to meet optional)
// The names and the small fields live in `details` (JSON text), with who entered and who let it out.
// Old entries of the separate app are not brought over (Prem, 22 Oct).

const express = require('express');

const TYPES = ['employee', 'visitor', 'vendor'];
// The vehicle photo (one per entry) goes to the private media bucket, like the post timeline photos;
// the row keeps only its key (photo_key). Links are made when someone taps the photo (one hour).
const MEDIA_BUCKET = 'escortcardaccess-media';
const PHOTO_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const PHOTO_MAX = 8 * 1024 * 1024;
// Number plate scan: Plate Recognizer (same service as the old app), Indian plates. The token is kept in
// Settings (setting_key 'plate_recognizer_token'), not in git: this repo is public.
const PLATE_URL = 'https://api.platerecognizer.com/v1/plate-reader/';
const PLATE_MAX = 3 * 1024 * 1024; // the service's limit
// Voice to text: Sarvam (same as the old app: saaras:v3, Tamil + English mixed speech). Key in Settings
// (setting_key 'sarvam_api_key'), not in git. iPhone records mp4 / m4a, Android webm.
const SARVAM_URL = 'https://api.sarvam.ai/speech-to-text';
const VOICE_MAX = 10 * 1024 * 1024;
// Spoken language, picked on the phone (Tamil by default); 'unknown' = Sarvam finds it.
const VOICE_LANGS = ['ta-IN', 'en-IN', 'hi-IN', 'te-IN', 'kn-IN', 'ml-IN', 'bn-IN', 'od-IN', 'mr-IN', 'gu-IN', 'pa-IN', 'unknown'];
const VOICE_TYPES = { 'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/wav': 'wav' };
const PLATE_RE = /^[A-Z0-9 -]{4,20}$/;
const PHONE_RE = /^[0-9+ -]{6,20}$/;

// Number plate in the Indian layout "TN 12 AB 0987" (Prem, 23 Oct): capitals, a space wherever letters
// and digits meet; `full` also pads the RTO number to 2 and the last number to 4 digits.
// Bharat series ("22 BH 1234 AA") keeps its own order. Same rule on the phone and the server.
function formatPlate(value, full) {
  const raw = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  let out = raw.replace(/([A-Z])(?=[0-9])|([0-9])(?=[A-Z])/g, '$1$2 ');
  const m = full && out.match(/^([A-Z]{2}) ([0-9]{1,2})(?: ([A-Z]{1,3}))? ([0-9]{1,4})$/);
  if (m) out = [m[1], m[2].padStart(2, '0'), m[3], m[4].padStart(4, '0')].filter(Boolean).join(' ');
  return out;
}

module.exports = function vehicleRoutes(app, h) {
  const { catalyst, selectAll, requireRowId, requireDate, fail, nowStamp, hhmm, cleanText, isTrue, onDutyLog, shiftDate, auth, getSetting } = h;

  const detailsOf = row => { try { return JSON.parse(row.details || '{}'); } catch { return {}; } };

  function view(row, postName) {
    const d = detailsOf(row);
    return {
      id: String(row.ROWID), postId: String(row.post_id), post: postName || '', type: row.entry_type, vehicleNo: row.vehicle_no,
      status: row.status, date: row.duty_date, shift: row.shift_code, inTime: row.in_time || '', outTime: row.out_time || '',
      in: hhmm(row.in_time), out: hhmm(row.out_time),
      hasPhoto: !!row.photo_key, empNo: d.emp_no || '', name: d.name || '', phone: d.phone || '', from: d.from || '', meet: d.meet || '', by: d.by || '', outBy: d.out_by || ''
    };
  }

  // Checks the form by type (same rules as the old app) and gives the row fields.
  function readEntry(body) {
    const type = String(body.entry_type || '').toLowerCase();
    if (!TYPES.includes(type)) throw new Error('Pick Employee, Visitor or Vendor.');
    const plate = formatPlate(body.vehicle_no, true);
    if (!plate) throw new Error('Vehicle number is needed.');
    if (!PLATE_RE.test(plate)) throw new Error('Vehicle number looks wrong (letters and numbers only).');
    const d = {};
    if (type === 'employee') {
      d.emp_no = cleanText(body.emp_no, 'Employee number', 30, true);
    } else {
      d.name = cleanText(body.name, 'Name', 100, true);
      d.phone = cleanText(body.phone, 'Phone', 20, true);
      if (!PHONE_RE.test(d.phone)) throw new Error('Phone number looks wrong.');
      d.from = cleanText(body.from, 'Coming from', 100, true);
      d.meet = cleanText(body.meet, 'Whom to meet', 100, type === 'visitor');
    }
    return { type, plate, d };
  }

  // A vehicle already inside at this post cannot come IN again before its OUT.
  async function refuseTwice(zcql, postId, plate) {
    // Compared without spaces: entries saved before the plate layout (22 Oct) have none.
    const key = v => String(v || '').replace(/[^A-Z0-9]/g, '');
    const rows = (await zcql.executeZCQLQuery(`SELECT vehicle_no, in_time FROM VehicleEntries WHERE post_id = ${requireRowId(postId)} AND status = 'IN'`)).map(r => r.VehicleEntries);
    const same = rows.find(r => key(r.vehicle_no) === key(plate));
    if (same) throw new Error(plate + ' is already IN since ' + hhmm(same.in_time) + '. Mark it OUT first.');
  }

  async function postOf(zcql, postId) {
    const rows = await zcql.executeZCQLQuery(`SELECT ROWID, post_name, branch_id, agency_id, vehicle_entry FROM Posts WHERE ROWID = ${requireRowId(postId)}`);
    if (!rows.length) throw new Error('Post not found.');
    const p = rows[0].Posts;
    if (!isTrue(p.vehicle_entry)) throw new Error('Vehicle entry is not on for ' + p.post_name + '.');
    return p;
  }

  // Today's entries of the post, and vehicles still IN from earlier days, newest first.
  async function postEntries(zcql, postId, date) {
    const rows = await selectAll(zcql, 'VehicleEntries', `SELECT * FROM VehicleEntries WHERE post_id = ${requireRowId(postId)} AND (duty_date = '${date}' OR status = 'IN') ORDER BY CREATEDTIME DESC`);
    return rows;
  }

  /* ---------- guard (post page "+" → Vehicle entry) ---------- */

  app.get('/vehicles', async (req, res) => {
    try {
      const zcql = catalyst.initialize(req, { scope: 'admin' }).zcql();
      const { log } = await onDutyLog(zcql, req.query.t, req.query.post, true);
      const post = await postOf(zcql, log.post_id);
      const rows = await postEntries(zcql, log.post_id, log.duty_date);
      res.status(200).json({ status: 'success', data: { post: post.post_name, date: log.duty_date, entries: rows.map(r => view(r, post.post_name)) } });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post('/vehicleIn', async (req, res) => {
    try {
      const catalystApp = catalyst.initialize(req, { scope: 'admin' });
      const zcql = catalystApp.zcql();
      const { me, log } = await onDutyLog(zcql, req.body.t, req.body.post);
      const post = await postOf(zcql, log.post_id);
      const { type, plate, d } = readEntry(req.body);
      await refuseTwice(zcql, log.post_id, plate);
      d.by = me.guard_name;
      const row = await catalystApp.datastore().table('VehicleEntries').insertRow({
        branch_id: post.branch_id, post_id: log.post_id, guard_id: me.ROWID, duty_date: log.duty_date, shift_code: log.shift_code,
        entry_type: type, vehicle_no: plate, status: 'IN', in_time: nowStamp(), details: JSON.stringify(d)
      });
      res.status(200).json({ status: 'success', data: view(row, post.post_name) });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post('/vehicleOut', async (req, res) => {
    try {
      const catalystApp = catalyst.initialize(req, { scope: 'admin' });
      const zcql = catalystApp.zcql();
      const { me, log } = await onDutyLog(zcql, req.body.t, req.body.post);
      const rows = await zcql.executeZCQLQuery(`SELECT * FROM VehicleEntries WHERE ROWID = ${requireRowId(req.body.id)}`);
      const row = rows.length ? rows[0].VehicleEntries : null;
      if (!row || String(row.post_id) !== String(log.post_id)) throw new Error('This entry is not of your post.');
      res.status(200).json({ status: 'success', data: view(await markOut(catalystApp, row, me.ROWID, me.guard_name)) });
    } catch (err) {
      fail(res, err);
    }
  });

  async function markOut(catalystApp, row, guardId, byName) {
    if (row.status !== 'IN') throw new Error(row.vehicle_no + ' is already OUT.');
    const d = detailsOf(row);
    d.out_by = byName;
    return catalystApp.datastore().table('VehicleEntries').updateRow({
      ROWID: row.ROWID, status: 'OUT', out_time: nowStamp(), out_guard_id: guardId || null, details: JSON.stringify(d)
    });
  }

  /* ---------- photo (guard or supervisor, after the IN is saved) ---------- */

  async function entryOf(zcql, id) {
    const rows = await zcql.executeZCQLQuery(`SELECT * FROM VehicleEntries WHERE ROWID = ${requireRowId(id)}`);
    if (!rows.length) throw new Error('Entry not found.');
    return rows[0].VehicleEntries;
  }

  async function savePhoto(req, catalystApp, row) {
    const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    const ext = PHOTO_TYPES[type];
    if (!ext) throw new Error('Only a photo can be added here (' + (type || 'unknown') + ').');
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw new Error('The photo is empty.');
    if (req.body.length > PHOTO_MAX) throw new Error('Photo is too big (max 8 MB).');
    const bucket = catalystApp.stratus().bucket(MEDIA_BUCKET);
    const key = 'vehicle/' + row.post_id + '/' + row.duty_date + '/' + row.ROWID + '.' + ext;
    await bucket.putObject(key, req.body, { contentType: type });
    if (row.photo_key && row.photo_key !== key) {
      try { await bucket.deleteObject(row.photo_key); } catch (err) { console.error('Old vehicle photo not removed:', err.message || err); }
    }
    await catalystApp.datastore().table('VehicleEntries').updateRow({ ROWID: row.ROWID, photo_key: key });
  }

  async function photoLink(catalystApp, row) {
    if (!row.photo_key) throw new Error('No photo for this entry.');
    const r = await catalystApp.stratus().bucket(MEDIA_BUCKET).generatePreSignedUrl(row.photo_key, 'GET', { expiryIn: '3600' });
    return r.signature;
  }

  // Guard: only entries of the post they stand at now.
  async function guardEntry(zcql, query) {
    const { log } = await onDutyLog(zcql, query.t, query.post, true);
    const row = await entryOf(zcql, query.id);
    if (String(row.post_id) !== String(log.post_id)) throw new Error('This entry is not of your post.');
    return row;
  }

  app.post('/vehiclePhoto', express.raw({ type: () => true, limit: '9mb' }), async (req, res) => {
    try {
      const catalystApp = catalyst.initialize(req, { scope: 'admin' });
      await savePhoto(req, catalystApp, await guardEntry(catalystApp.zcql(), req.query));
      res.status(200).json({ status: 'success', data: { saved: true } });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get('/vehiclePhotoLink', async (req, res) => {
    try {
      const catalystApp = catalyst.initialize(req, { scope: 'admin' });
      res.status(200).json({ status: 'success', data: { url: await photoLink(catalystApp, await guardEntry(catalystApp.zcql(), req.query)) } });
    } catch (err) {
      fail(res, err);
    }
  });

  // Supervisor / admins: entries of a vehicle post in their area.
  async function areaEntry(req, zcql, id) {
    const row = await entryOf(zcql, id);
    auth.requireRow(req, await postOf(zcql, row.post_id), 'post');
    return row;
  }

  app.post('/vehiclePhotoAdd', express.raw({ type: () => true, limit: '9mb' }), async (req, res) => {
    try {
      const catalystApp = catalyst.initialize(req, { scope: 'admin' });
      await savePhoto(req, catalystApp, await areaEntry(req, catalystApp.zcql(), req.query.id));
      res.status(200).json({ status: 'success', data: { saved: true } });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get('/vehiclePhotoUrl', async (req, res) => {
    try {
      const catalystApp = catalyst.initialize(req, { scope: 'admin' });
      res.status(200).json({ status: 'success', data: { url: await photoLink(catalystApp, await areaEntry(req, catalystApp.zcql(), req.query.id)) } });
    } catch (err) {
      fail(res, err);
    }
  });

  /* ---------- number plate scan (the photo is read, not saved) ---------- */

  let plateToken = null; // kept while the function stays warm (one Settings read)
  async function readPlate(req, zcql) {
    const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (!PHOTO_TYPES[type]) throw new Error('Scan needs a photo.');
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw new Error('The photo is empty.');
    if (req.body.length > PLATE_MAX) throw new Error('Photo is too big to scan (max 3 MB).');
    if (!plateToken) {
      const row = await getSetting(zcql, 'plate_recognizer_token');
      plateToken = row && row.setting_value ? String(row.setting_value).trim() : null;
    }
    if (!plateToken) throw new Error('Number plate scan is not set up yet (no key). Type the number.');
    const form = new FormData();
    form.append('regions', 'in');
    // "fast" mode: quicker answer; a phone photo of one plate does not need the slow, thorough search.
    form.append('config', JSON.stringify({ mode: 'fast' }));
    form.append('upload', new Blob([req.body], { type }), 'plate.' + PHOTO_TYPES[type]);
    const r = await fetch(PLATE_URL, { method: 'POST', headers: { Authorization: 'Token ' + plateToken }, body: form });
    if (!r.ok) {
      console.error('Plate scan failed:', r.status, await r.text());
      if (r.status === 401 || r.status === 403) plateToken = null;
      throw new Error(r.status === 429 ? 'Scan limit reached for now. Type the number.' : 'Scan did not work. Type the number.');
    }
    const best = ((await r.json()).results || [])[0];
    return best ? { plate: String(best.plate).toUpperCase(), score: best.score } : { plate: '', score: 0 };
  }

  // Guard: only while on duty at a vehicle post.
  app.post('/vehiclePlate', express.raw({ type: () => true, limit: '4mb' }), async (req, res) => {
    try {
      const zcql = catalyst.initialize(req, { scope: 'admin' }).zcql();
      // The duty check and the scan run side by side (the scan was waiting for 3 reads); the answer
      // is given only when the guard is on duty at a vehicle post.
      const started = Date.now();
      const check = onDutyLog(zcql, req.query.t, req.query.post, true).then(({ log }) => postOf(zcql, log.post_id));
      const [, plate] = await Promise.all([check, readPlate(req, zcql)]);
      res.status(200).json({ status: 'success', data: { ...plate, ms: Date.now() - started } });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post('/vehiclePlateScan', express.raw({ type: () => true, limit: '4mb' }), async (req, res) => {
    try {
      const zcql = catalyst.initialize(req, { scope: 'admin' }).zcql();
      const started = Date.now();
      const plate = await readPlate(req, zcql);
      res.status(200).json({ status: 'success', data: { ...plate, ms: Date.now() - started } });
    } catch (err) {
      fail(res, err);
    }
  });

  /* ---------- voice to text (the clip is read, not saved) ---------- */

  let sarvamKey = null; // kept while the function stays warm
  async function readVoice(req, zcql) {
    const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    const ext = VOICE_TYPES[type];
    if (!ext) throw new Error('Voice: this recording type is not known (' + (type || 'unknown') + ').');
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw new Error("Didn't catch that. Tap 🎤 and speak again.");
    if (req.body.length > VOICE_MAX) throw new Error('Recording is too long.');
    if (!sarvamKey) {
      const row = await getSetting(zcql, 'sarvam_api_key');
      sarvamKey = row && row.setting_value ? String(row.setting_value).trim() : null;
    }
    if (!sarvamKey) throw new Error('Voice is not set up yet (no key). Type it.');
    const lang = VOICE_LANGS.includes(String(req.query.lang)) ? String(req.query.lang) : 'ta-IN';
    // "translit": the register is in English letters, so Tamil words come back in English letters too
    // ("Zoho", not "சோஹோ"; codemix gave Tamil script, 23 Oct). codemix only if translit is refused.
    const ask = mode => {
      const form = new FormData();
      form.append('file', new Blob([req.body], { type }), 'input.' + ext);
      form.append('model', 'saaras:v3');
      form.append('mode', mode);
      form.append('language_code', lang);
      return fetch(SARVAM_URL, { method: 'POST', headers: { 'api-subscription-key': sarvamKey }, body: form });
    };
    let r = await ask('translit');
    if (r.status === 400 || r.status === 422) {
      console.error('Sarvam translit refused:', r.status, await r.text());
      r = await ask('codemix');
    }
    if (!r.ok) {
      console.error('Sarvam failed:', r.status, await r.text());
      if (r.status === 401 || r.status === 403) sarvamKey = null;
      throw new Error(r.status === 429 ? 'Voice limit reached for now. Type it.' : 'Voice did not work. Type it.');
    }
    return { text: String((await r.json()).transcript || '') };
  }

  app.post('/vehicleVoice', express.raw({ type: () => true, limit: '11mb' }), async (req, res) => {
    try {
      const zcql = catalyst.initialize(req, { scope: 'admin' }).zcql();
      const started = Date.now();
      const check = onDutyLog(zcql, req.query.t, req.query.post, true).then(({ log }) => postOf(zcql, log.post_id));
      const [, voice] = await Promise.all([check, readVoice(req, zcql)]);
      res.status(200).json({ status: 'success', data: { ...voice, ms: Date.now() - started } });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post('/vehicleVoiceText', express.raw({ type: () => true, limit: '11mb' }), async (req, res) => {
    try {
      const zcql = catalyst.initialize(req, { scope: 'admin' }).zcql();
      const started = Date.now();
      const voice = await readVoice(req, zcql);
      res.status(200).json({ status: 'success', data: { ...voice, ms: Date.now() - started } });
    } catch (err) {
      fail(res, err);
    }
  });

  /* ---------- supervisor / admins (Vehicles page) ---------- */

  // Vehicle posts of the area (one branch or ALL), with the branch name.
  async function areaPosts(req, zcql, branch) {
    const branches = (await auth.branchList(zcql)).filter(b => b.is_active === 'true' && auth.branchOk(req, b.ROWID));
    const list = branch === 'ALL' ? branches : branches.filter(b => String(b.ROWID) === String(auth.requireBranch(req, requireRowId(branch))));
    if (!list.length) return { posts: [], branchName: {} };
    const ids = list.map(b => requireRowId(b.ROWID));
    const posts = auth.inArea(req, await selectAll(zcql, 'Posts', `SELECT ROWID, post_name, branch_id, agency_id, vehicle_entry, is_active FROM Posts WHERE branch_id IN (${ids.join(', ')}) ORDER BY post_name ASC`))
      .filter(p => isTrue(p.vehicle_entry));
    const branchName = {};
    list.forEach(b => { branchName[String(b.ROWID)] = b.branch_name; });
    return { posts, branchName };
  }

  // One day's entries (plus vehicles still IN from earlier days) of the vehicle posts in the area.
  app.get('/vehicleList', async (req, res) => {
    try {
      const zcql = catalyst.initialize(req, { scope: 'admin' }).zcql();
      const date = requireDate(req.query.date);
      const { posts, branchName } = await areaPosts(req, zcql, req.query.branch);
      let entries = [];
      if (posts.length) {
        const name = {};
        posts.forEach(p => { name[String(p.ROWID)] = p; });
        const rows = await selectAll(zcql, 'VehicleEntries', `SELECT * FROM VehicleEntries WHERE post_id IN (${posts.map(p => requireRowId(p.ROWID)).join(', ')}) AND (duty_date = '${date}' OR status = 'IN') ORDER BY CREATEDTIME DESC`);
        entries = rows.map(r => ({ ...view(r, name[String(r.post_id)].post_name), branch: branchName[String(r.branch_id)] || '' }));
      }
      res.status(200).json({
        status: 'success',
        data: { date, today: shiftDate(), posts: posts.map(p => ({ id: String(p.ROWID), name: p.post_name, branch: branchName[String(p.branch_id)] || '' })), entries }
      });
    } catch (err) {
      fail(res, err);
    }
  });

  // "+ New entry" by a supervisor / admin (to test, or when the guard's phone is down).
  app.post('/vehicleAdd', async (req, res) => {
    try {
      const catalystApp = catalyst.initialize(req, { scope: 'admin' });
      const zcql = catalystApp.zcql();
      const post = auth.requireRow(req, await postOf(zcql, req.body.post_id), 'post');
      const { type, plate, d } = readEntry(req.body);
      await refuseTwice(zcql, post.ROWID, plate);
      d.by = req.user.name + ' (' + req.user.role.replace('_', ' ') + ')';
      const row = await catalystApp.datastore().table('VehicleEntries').insertRow({
        branch_id: post.branch_id, post_id: post.ROWID, duty_date: shiftDate(),
        entry_type: type, vehicle_no: plate, status: 'IN', in_time: nowStamp(), details: JSON.stringify(d)
      });
      res.status(200).json({ status: 'success', data: view(row, post.post_name) });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post('/vehicleMarkOut', async (req, res) => {
    try {
      const catalystApp = catalyst.initialize(req, { scope: 'admin' });
      const zcql = catalystApp.zcql();
      const rows = await zcql.executeZCQLQuery(`SELECT * FROM VehicleEntries WHERE ROWID = ${requireRowId(req.body.id)}`);
      const row = rows.length ? rows[0].VehicleEntries : null;
      if (!row) throw new Error('Entry not found.');
      auth.requireRow(req, await postOf(zcql, row.post_id), 'post');
      const done = await markOut(catalystApp, row, null, req.user.name + ' (' + req.user.role.replace('_', ' ') + ')');
      res.status(200).json({ status: 'success', data: view(done) });
    } catch (err) {
      fail(res, err);
    }
  });
};
