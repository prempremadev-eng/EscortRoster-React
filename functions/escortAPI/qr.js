'use strict';

// QR attendance (Prem, 29 Oct, Cumbum: no card machine, no supervisor on site). A QR at the gate opens
// #qr/<key> on any phone without a login: GPS must be within the branch's radius of the gate, the front
// camera takes a live photo, Zia facial comparison finds which registered guard it is (Guards.photo_key),
// then IN or OUT is saved in AccessLog (source QR) with the GPS, distance, selfie and score, exactly like a
// card swipe, so the duty pages, Live board and Today count it. Only branches with a gate location and a
// QR key use it; Estancia's card system is untouched.
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const BUCKET = 'escortcardaccess-media';
const KEY_RE = /^[a-f0-9]{24}$/;
const MAX_ACCURACY_M = 100; // GPS worse than this: ask to step outside and try again
const TICKET_MS = 3 * 60000; // the photo check is valid for 3 minutes before IN / OUT is pressed
const OPEN_IN_HOURS = 16; // an IN older than this is not closed by the next scan (forgotten OUT)

module.exports = function qrRoutes(app, h) {
  const { catalyst, fail, requireRowId, auth, istNow, getShifts, getVapidKeys, onCardIn, onPostOut, rosterShiftOf } = h;
  const admin = req => catalyst.initialize(req, { scope: 'admin' });
  const ok = (res, data) => res.status(200).json({ status: 'success', data });

  // Metres between two GPS points (haversine).
  function metres(lat1, lng1, lat2, lng2) {
    const r = Math.PI / 180, R = 6371000;
    const a = Math.sin((lat2 - lat1) * r / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin((lng2 - lng1) * r / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.sqrt(a)));
  }
  const num = (v, min, max) => { const n = Number(v); if (!Number.isFinite(n) || n < min || n > max) throw new Error('Location missing. Allow location and try again.'); return n; };

  async function branchByKey(zcql, key) {
    if (!KEY_RE.test(String(key || ''))) throw new Error('This QR is not valid.');
    const rows = await zcql.executeZCQLQuery(`SELECT ROWID, branch_name, lat, lng, radius_m, is_active FROM Branches WHERE qr_key = '${key}'`);
    if (!rows.length || rows[0].Branches.is_active !== 'true') throw new Error('This QR is not valid.');
    return rows[0].Branches;
  }

  // The check → punch ticket is signed, so the IN / OUT cannot be made up without the photo check.
  async function secret(catalystApp) { return (await getVapidKeys(catalystApp)).privateKey; }
  const sign = (s, body) => crypto.createHmac('sha256', s).update(body).digest('hex').slice(0, 32);
  async function makeTicket(catalystApp, data) {
    const body = Buffer.from(JSON.stringify({ ...data, t: Date.now() })).toString('base64url');
    return body + '.' + sign(await secret(catalystApp), body);
  }
  async function readTicket(catalystApp, ticket) {
    const [body, mac] = String(ticket || '').split('.');
    if (!body || mac !== sign(await secret(catalystApp), body)) throw new Error('Scan again.');
    const data = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (Date.now() - data.t > TICKET_MS) throw new Error('Too slow: scan again.');
    return data;
  }

  // A data URL photo → a temporary file stream (Zia takes file streams).
  const tmpFiles = [];
  function tmpFile(buf, ext) {
    const f = os.tmpdir() + '/qr-' + crypto.randomBytes(6).toString('hex') + '.' + ext;
    fs.writeFileSync(f, buf);
    tmpFiles.push(f);
    return f;
  }
  function cleanTmp() { while (tmpFiles.length) { try { fs.unlinkSync(tmpFiles.pop()); } catch (e) { /* gone */ } } }
  async function storedPhoto(bucket, key) {
    const obj = await bucket.getObject(key);
    const chunks = [];
    for await (const c of obj) chunks.push(Buffer.from(c));
    return tmpFile(Buffer.concat(chunks), (key.split('.').pop() || 'jpg'));
  }
  const yes = v => v === true || v === 'true';
  // The duty day of a QR IN: the calendar day in India (A 06:00, G 09:00, B 14:00, C 22:00 all start the same day);
  // only a very late C IN after midnight (before 04:00) belongs to the day before. (The card's istNow() counts
  // swipes before 08:00 as the night before, which would put Cumbum's 05:40 A IN on the wrong day.)
  function qrDay() {
    const d = new Date(Date.now() + 330 * 60000);
    if (d.getUTCHours() < 4) d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }

  // Front face only (Prem, 29 Oct: side and tilted faces matched too). Zia face analysis gives the eyes and the
  // nose: the nose must sit between the eyes, the eyes level, one face, big enough. Returns '' or the reason.
  const centre = v => {
    const flat = []; (function walk(x) { if (Array.isArray(x)) x.forEach(walk); else if (Number.isFinite(Number(x))) flat.push(Number(x)); })(v);
    if (flat.length < 2) return null;
    let sx = 0, sy = 0, n = 0;
    for (let i = 0; i + 1 < flat.length; i += 2) { sx += flat[i]; sy += flat[i + 1]; n++; }
    return { x: sx / n, y: sy / n };
  };
  async function frontFace(catalystApp, file, imgWidth) {
    let r;
    try { r = await catalystApp.zia().analyseFace(fs.createReadStream(file), { mode: 'advanced' }); } catch (err) { console.error('analyseFace failed:', err.message || err); return ''; }
    const faces = (r && r.faces) || [];
    if (!faces.length) return '🙂 No face found. Face the camera in good light.';
    if (faces.length > 1) return '🙂 Only one person in the photo, please.';
    const f = faces[0], lm = f.landmarks || {};
    const k = name => Object.keys(lm).find(x => x.toLowerCase().replace(/[^a-z]/g, '').includes(name));
    const le = centre(lm[k('lefteye')]), re = centre(lm[k('righteye')]), no = centre(lm[k('nose')]);
    console.log('qr front check', JSON.stringify({ keys: Object.keys(lm), le, re, no, box: f.co_ordinates }));
    if (!le || !re || !no) return ''; // no landmarks: the face match alone decides
    const eye = Math.hypot(re.x - le.x, re.y - le.y);
    if (!eye) return '';
    const box = f.co_ordinates || [];
    if (imgWidth && box.length >= 4 && Math.abs(box[2] - box[0]) < imgWidth * 0.2) return '🙂 Come closer to the camera.';
    if (Math.abs(re.y - le.y) / eye > 0.25) return '🙂 Keep your head straight (not tilted).';
    if (Math.abs(no.x - (le.x + re.x) / 2) / eye > 0.18) return '🙂 Look straight at the camera (not to the side).';
    return '';
  }

  // The guard's last swipe within OPEN_IN_HOURS: an IN means this scan is the OUT (also after midnight).
  async function openIn(zcql, guardId) {
    const r = await zcql.executeZCQLQuery(`SELECT direction, duty_date, CREATEDTIME FROM AccessLog WHERE guard_id = ${requireRowId(guardId)} ORDER BY CREATEDTIME DESC LIMIT 1`);
    if (!r.length || r[0].AccessLog.direction !== 'IN') return null;
    const at = new Date(String(r[0].AccessLog.CREATEDTIME).slice(0, 19).replace(' ', 'T') + '+05:30').getTime();
    return Date.now() - at < OPEN_IN_HOURS * 3600000 ? r[0].AccessLog : null;
  }

  // ---------- office: gate location and QR ----------

  app.get('/qrAdmin', async (req, res) => {
    try {
      auth.need(req, 'branch_admin');
      const branch = auth.requireBranch(req, requireRowId(req.query.branch));
      const r = await admin(req).zcql().executeZCQLQuery(`SELECT lat, lng, radius_m, qr_key FROM Branches WHERE ROWID = ${branch}`);
      const b = r.length ? r[0].Branches : {};
      ok(res, { lat: b.lat || '', lng: b.lng || '', radius_m: b.radius_m || 100, qr_key: b.qr_key || '' });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post('/qrAdmin', async (req, res) => {
    try {
      auth.need(req, 'branch_admin');
      const branch = auth.requireBranch(req, requireRowId(req.body.branch));
      const lat = num(req.body.lat, -90, 90), lng = num(req.body.lng, -180, 180);
      const radius = Math.round(Number(req.body.radius_m) || 100);
      if (radius < 30 || radius > 1000) throw new Error('Distance: 30 to 1000 m.');
      const zcql = admin(req).zcql();
      const old = (await zcql.executeZCQLQuery(`SELECT qr_key FROM Branches WHERE ROWID = ${branch}`))[0].Branches.qr_key;
      // A new key (old printed QR stops working) only when asked or when there is none yet.
      const qr_key = !old || req.body.newKey === true ? crypto.randomBytes(12).toString('hex') : old;
      await admin(req).datastore().table('Branches').updateRow({ ROWID: branch, lat, lng, radius_m: radius, qr_key });
      ok(res, { lat, lng, radius_m: radius, qr_key });
    } catch (err) {
      fail(res, err);
    }
  });

  // ---------- the guard's phone at the gate (no login) ----------

  app.get('/qrSite', async (req, res) => {
    try {
      const b = await branchByKey(admin(req).zcql(), req.query.k);
      ok(res, { branch: b.branch_name, ready: !!(b.lat && b.lng) });
    } catch (err) {
      fail(res, err);
    }
  });

  // GPS + live photo → which guard (face), IN or OUT next. Nothing is saved yet except the photo.
  app.post('/qrCheck', async (req, res) => {
    try {
      const catalystApp = admin(req);
      const zcql = catalystApp.zcql();
      const b = await branchByKey(zcql, req.body.k);
      if (!b.lat || !b.lng) throw new Error('The gate location is not set yet. Ask the office.');
      const lat = num(req.body.lat, -90, 90), lng = num(req.body.lng, -180, 180);
      const acc = Number(req.body.acc) || 999;
      if (acc > MAX_ACCURACY_M) throw new Error('📍 GPS is weak (' + Math.round(acc) + ' m). Step outside and try again.');
      const distance = metres(lat, lng, Number(b.lat), Number(b.lng));
      const radius = Number(b.radius_m) || 100;
      if (distance > radius) throw new Error('📍 You are ' + distance + ' m from the gate (allowed ' + radius + ' m). Come to the gate.');
      const m = String(req.body.photo || '').match(/^data:image\/jpeg;base64,(.+)$/);
      if (!m) throw new Error('No photo. Try again.');
      const photo = Buffer.from(m[1], 'base64');
      if (photo.length > 1048576) throw new Error('Photo too big.');

      // Registered guards of this branch with a photo. Typed ID → only that guard; else the guard who is
      // IN now comes first (likely OUT), then those whose roster says a shift today.
      const guards = (await zcql.executeZCQLQuery(`SELECT ROWID, guard_name, id_number, photo_key, branch_id, agency_id, escort_id, guard_token, is_active FROM Guards WHERE branch_id = ${b.ROWID} AND is_active = 'true'`))
        .map(r => r.Guards).filter(g => g.photo_key);
      const typed = String(req.body.id || '').trim().replace(/^0+/, '').toUpperCase();
      let list = typed ? guards.filter(g => String(g.id_number).replace(/^0+/, '').toUpperCase() === typed) : guards;
      if (typed && !list.length) throw new Error('ID ' + req.body.id + ' has no registered face here. Ask the office.');
      const rank = {};
      for (const g of list) rank[g.ROWID] = (await openIn(zcql, g.ROWID)) ? 0 : 'ABCG'.includes(await rosterShiftOf(zcql, g.ROWID, qrDay()) || '-') ? 1 : 2;
      list = list.sort((x, y) => rank[x.ROWID] - rank[y.ROWID]);

      const bucket = catalystApp.stratus().bucket(BUCKET);
      const selfieFile = tmpFile(photo, 'jpg');
      const notFront = await frontFace(catalystApp, selfieFile, Number(req.body.w) || 0);
      if (notFront) { cleanTmp(); throw new Error(notFront); }
      let found = null, score = null;
      try {
        for (const g of list.slice(0, 8)) {
          const regFile = await storedPhoto(bucket, g.photo_key);
          const r = await catalystApp.zia().compareFace(fs.createReadStream(regFile), fs.createReadStream(selfieFile));
          if (yes(r && r.matched)) { found = g; score = Number(r.confidence) || null; break; }
        }
      } finally {
        cleanTmp();
      }
      if (!found) return ok(res, { matched: false, distance });

      // Keep the selfie (90 days) and say what the next press does.
      const day = qrDay();
      const selfie_key = 'qr/' + b.ROWID + '/' + day + '/' + found.ROWID + '-' + crypto.randomBytes(5).toString('hex') + '.jpg';
      await bucket.putObject(selfie_key, photo, { contentType: 'image/jpeg' });
      const open = await openIn(zcql, found.ROWID);
      const action = open ? 'OUT' : 'IN';
      const code = open ? '' : await rosterShiftOf(zcql, found.ROWID, day);
      const sh = (await getShifts(zcql, b.ROWID)).find(x => x.code === code);
      const ticket = await makeTicket(catalystApp, { g: String(found.ROWID), b: String(b.ROWID), a: action, s: selfie_key, la: lat, ln: lng, d: distance, m: score, dd: open ? open.duty_date : '' });
      ok(res, {
        matched: true, ticket, action, distance,
        guard: { name: found.guard_name, id: found.id_number },
        shift: sh ? { code: sh.code, start: sh.start, end: sh.end } : (code ? { code } : null),
        since: open ? String(open.CREATEDTIME).slice(11, 16) : ''
      });
    } catch (err) {
      cleanTmp();
      fail(res, err);
    }
  });

  // The press after a successful check: the IN / OUT is saved like a card swipe.
  app.post('/qrPunch', async (req, res) => {
    try {
      const catalystApp = admin(req);
      const zcql = catalystApp.zcql();
      const b = await branchByKey(zcql, req.body.k);
      const t = await readTicket(catalystApp, req.body.ticket);
      if (t.b !== String(b.ROWID)) throw new Error('Scan again.');
      const g = (await zcql.executeZCQLQuery(`SELECT ROWID, guard_name, id_number, branch_id, agency_id, escort_id, guard_token, is_active FROM Guards WHERE ROWID = ${requireRowId(t.g)}`))[0];
      const guard = g && g.Guards;
      if (!guard || guard.is_active !== 'true') throw new Error('Guard not found.');
      // Pressed twice, or the state changed since the check: refuse.
      const open = await openIn(zcql, guard.ROWID);
      if ((t.a === 'IN') !== !open) throw new Error('Already ' + (open ? 'IN' : 'OUT') + '. Scan again.');
      const { time } = istNow();
      const day = t.a === 'OUT' && t.dd ? t.dd : qrDay(); // an OUT belongs to its IN's duty day (C shift)
      await catalystApp.datastore().table('AccessLog').insertRow({
        guard_id: guard.ROWID, direction: t.a, punch_time: time, duty_date: day, source: 'QR',
        lat: t.la, lng: t.ln, distance_m: t.d, selfie_key: t.s, match_score: t.m
      });
      try {
        if (t.a === 'IN') await onCardIn(catalystApp, guard, time, day);
        else await onPostOut(catalystApp, guard);
      } catch (err) {
        console.error('QR swipe follow-up failed:', err.message || err);
      }
      ok(res, { action: t.a, time, name: guard.guard_name });
    } catch (err) {
      fail(res, err);
    }
  });
};
