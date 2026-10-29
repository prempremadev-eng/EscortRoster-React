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
  const { catalyst, fail, requireRowId, auth, istNow, getShifts, getVapidKeys, onCardIn, onPostOut, rosterShiftOf, notify, getSetting } = h;
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
  // { why, byJaw } of one photo: why = '' when it is a good front face.
  async function frontFace(catalystApp, file, imgWidth) {
    const m = await measureFace(catalystApp, file, imgWidth);
    return m.why;
  }
  async function measureFace(catalystApp, file, imgWidth) {
    let r;
    try { r = await catalystApp.zia().analyseFace(fs.createReadStream(file), { mode: 'advanced' }); } catch (err) { console.error('analyseFace failed:', err.message || err); return { why: '' }; }
    const faces = (r && r.faces) || [];
    if (!faces.length) return { why: '🙂 No face found. Face the camera in good light.' };
    if (faces.length > 1) return { why: '🙂 Only one person in the photo, please.' };
    const f = faces[0], lm = f.landmarks || {};
    const k = name => Object.keys(lm).find(x => x.toLowerCase().replace(/[^a-z]/g, '') === name);
    // Points as [x, y] pairs. Nose: the last 5 points are the tip and nostrils (the bridge stays centred when
    // the head turns, 29 Oct log); jaw: its two ends are the sides of the face.
    const pts = v => { const flat = []; (function walk(x) { if (Array.isArray(x)) x.forEach(walk); else if (Number.isFinite(Number(x))) flat.push(Number(x)); })(v); const out = []; for (let i = 0; i + 1 < flat.length; i += 2) out.push({ x: flat[i], y: flat[i + 1] }); return out; };
    const mid = list => list.length ? { x: list.reduce((a, p) => a + p.x, 0) / list.length, y: list.reduce((a, p) => a + p.y, 0) / list.length } : null;
    const le = mid(pts(lm[k('lefteye')])), re = mid(pts(lm[k('righteye')]));
    const nose = pts(lm[k('nose')]), jaw = pts(lm[k('jaw')]);
    const tip = mid(nose.length >= 5 ? nose.slice(-5) : nose);
    const box = f.co_ordinates || [];
    const facts = { le, re, tip, jawL: jaw[0], jawR: jaw[jaw.length - 1] };
    if (!le || !re || !tip) { console.log('qr front check: no landmarks', Object.keys(lm)); return { why: '' }; }
    const eye = Math.hypot(re.x - le.x, re.y - le.y);
    const byEyes = (tip.x - Math.min(le.x, re.x)) / Math.abs(le.x - re.x); // 0.5 = nose tip between the eyes
    const byJaw = jaw.length >= 2 ? (tip.x - Math.min(jaw[0].x, jaw[jaw.length - 1].x)) / Math.abs(jaw[jaw.length - 1].x - jaw[0].x) : 0.5;
    console.log('qr front check', JSON.stringify({ ...facts, eye, byEyes, byJaw, tilt: Math.abs(re.y - le.y) / eye, box }));
    // How open the eyes are: height / width of each eye's points (open ≈ 0.3, closed ≈ 0.1); for the blink check.
    const open = list => { if (list.length < 3) return null; const xs = list.map(p => p.x), ys = list.map(p => p.y); const w = Math.max(...xs) - Math.min(...xs); return w ? (Math.max(...ys) - Math.min(...ys)) / w : null; };
    const eo = [open(pts(lm[k('lefteye')])), open(pts(lm[k('righteye')]))].filter(v => v !== null);
    const out = { byJaw, byEyes, eyes: eo.length ? eo.reduce((a, b) => a + b, 0) / eo.length : null };
    if (imgWidth && box.length >= 4 && Math.abs(box[2] - box[0]) < imgWidth * 0.2) return { ...out, why: '🙂 Come closer to the camera.' };
    if (Math.abs(re.y - le.y) / eye > 0.2) return { ...out, why: '🙂 Keep your head straight (not tilted).' };
    if (Math.abs(byEyes - 0.5) > 0.12 || Math.abs(byJaw - 0.5) > 0.1) return { ...out, why: '🙂 Look straight at the camera (not to the side).' };
    return { ...out, why: '' };
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

  // Live person, not a photo or a screen (Prem, 29 Oct: an AI picture of the guard on a screen was let OUT):
  // the server picks LEFT or RIGHT; after the front photo the guard turns the head that way for a second
  // photo. A flat photo cannot turn: its nose tip stays in the middle of the jaw.
  app.get('/qrChallenge', async (req, res) => {
    try {
      const catalystApp = admin(req);
      await branchByKey(catalystApp.zcql(), req.query.k);
      const dir = crypto.randomInt(2) ? 'LEFT' : 'RIGHT';
      ok(res, { dir, c: await makeTicket(catalystApp, { dir }) });
    } catch (err) {
      fail(res, err);
    }
  });

  // 🔔 to the office (step 5): the branch's post chat channel (SupervisorSubs of that branch), so the phones that
  // turned on notifications for this branch hear it. Never fails the guard's action.
  async function tellOffice(catalystApp, branchId, title, body) {
    try {
      const p = await catalystApp.zcql().executeZCQLQuery(`SELECT ROWID FROM Posts WHERE branch_id = ${requireRowId(branchId)} AND post_type = 'POST' AND is_active = 'true' LIMIT 1`);
      if (p.length) await notify(catalystApp, p[0].Posts.ROWID, title, body, true);
    } catch (err) { console.error('QR office alert failed:', err.message || err); }
  }

  // ---------- relievers (step 2, Prem 29 Oct) ----------
  // On a guard's off day the ISI field officer sends someone not known before. The guard on duty adds him for
  // the next shift (new: name + phone; known: from the list); only an added reliever can IN. The first time
  // his live photo becomes his registered face; later the face finds him like a regular guard.
  const NEXT = { A: 'B', B: 'C', C: 'A' };
  const plusDay = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const phoneOf = v => { const d = String(v || '').replace(/\D/g, '').slice(-10); if (d.length !== 10) throw new Error('Phone: 10 digits.'); return d; };
  const masked = p => (p ? '••••' + String(p).slice(-4) : '');
  // The shift after the one this guard is on, and its duty day (C → next day's A).
  async function nextSlot(zcql, guardId, open, branchId) {
    const code = await shiftNow(zcql, branchId, guardId, open);
    const next = NEXT[code];
    return next ? { code: next, day: code === 'C' ? plusDay(open.duty_date, 1) : open.duty_date } : null;
  }
  async function reliefRows(zcql, branchId, days) {
    return (await zcql.executeZCQLQuery(`SELECT ROWID, duty_date, shift_code, reliever_id, added_by, in_at, out_at, CREATEDTIME FROM ReliefShifts WHERE branch_id = ${branchId} AND duty_date IN (${days.map(d => `'${d}'`).join(', ')})`)).map(r => r.ReliefShifts);
  }
  // A slot can have more than one reliever in a day (one left, another came, 29 Oct): the one not OUT yet counts.
  const activeRow = (rows, code) => rows.filter(r => r.shift_code === code && !r.out_at).sort((x, y) => String(y.CREATEDTIME).localeCompare(String(x.CREATEDTIME)))[0] || null;
  async function relieversOf(zcql, branchId) {
    return (await zcql.executeZCQLQuery(`SELECT ROWID, name, phone, photo_key, visits FROM Relievers WHERE branch_id = ${branchId} ORDER BY name ASC`)).map(r => r.Relievers);
  }

  // Step 3, handover (Prem, 29 Oct): a guard may OUT only when the next shift is IN: the regular guard whose roster
  // says that shift, or the added reliever. G (09–18) has no next shift. Nobody IN → OUT stays locked.
  // The shift a guard is on: his roster; with no roster (29 Oct test), the A/B/C shift whose start is nearest his
  // IN time.
  async function shiftNow(zcql, branchId, guardId, open) {
    const code = await rosterShiftOf(zcql, guardId, open.duty_date);
    if ('ABC'.includes(code || '-') || code === 'G') return code;
    const at = String(open.CREATEDTIME).slice(11, 16);
    const mins = t => +t.slice(0, 2) * 60 + +t.slice(3, 5);
    const gap = sh => { const d = Math.abs(mins(at) - mins(sh.start)); return Math.min(d, 1440 - d); };
    const best = (await getShifts(zcql, branchId)).filter(sh => 'ABC'.includes(sh.code) && sh.start).sort((x, y) => gap(x) - gap(y))[0];
    return best ? best.code : ''; // no 3-hour limit (29 Oct: a 17:31 IN found no shift and slipped past the lock)
  }
  async function handover(zcql, branchId, guardId, open) {
    const code = await shiftNow(zcql, branchId, guardId, open);
    const next = NEXT[code];
    if (!next) return { ok: true, code: '', regulars: [], reliever: null };
    const day = code === 'C' ? plusDay(open.duty_date, 1) : open.duty_date;
    const guards = (await zcql.executeZCQLQuery(`SELECT ROWID, guard_name FROM Guards WHERE branch_id = ${requireRowId(branchId)} AND is_active = 'true'`)).map(r => r.Guards)
      .filter(g => String(g.ROWID) !== String(guardId));
    const regulars = [];
    for (const g of guards) {
      if ((await rosterShiftOf(zcql, g.ROWID, day)) !== next) continue;
      const ins = await zcql.executeZCQLQuery(`SELECT punch_time FROM AccessLog WHERE guard_id = ${g.ROWID} AND duty_date = '${day}' AND direction = 'IN' LIMIT 1`);
      regulars.push({ name: g.guard_name, in: ins.length ? ins[0].AccessLog.punch_time : '' });
    }
    const row = activeRow(await reliefRows(zcql, branchId, [day]), next);
    let reliever = null;
    if (row) {
      const p = (await relieversOf(zcql, branchId)).find(x => String(x.ROWID) === String(row.reliever_id));
      reliever = { name: p ? p.name : '?', phone: p ? masked(p.phone) : '', in: row.in_at ? String(row.in_at).slice(11, 16) : '' };
    }
    return { ok: regulars.some(g => g.in) || !!(reliever && reliever.in), code: next, day, regulars, reliever };
  }

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
      await readTicket(catalystApp, req.body.c); // a fresh check started from this page
      // Live person (Prem, 29 Oct: the head turn confused the guards): the second photo has the eyes closed. A
      // photo or a screen cannot close its eyes. Both photos must be the same person.
      const m2 = String(req.body.photo2 || '').match(/^data:image\/jpeg;base64,(.+)$/);
      if (!m2) { cleanTmp(); throw new Error('😌 Close your eyes when asked and try again.'); }
      const turnFile = tmpFile(Buffer.from(m2[1], 'base64'), 'jpg');
      const first = await measureFace(catalystApp, selfieFile, 0);
      const shut = await measureFace(catalystApp, turnFile, 0);
      console.log('qr blink', JSON.stringify({ open: first.eyes, closed: shut.eyes }));
      if (!first.eyes || shut.eyes === null || shut.eyes === undefined || !(shut.eyes < first.eyes * 0.65)) { cleanTmp(); throw new Error('😌 Close your eyes when asked (2 seconds) and try again.'); }
      const same = await catalystApp.zia().compareFace(fs.createReadStream(selfieFile), fs.createReadStream(turnFile));
      if (!yes(same && same.matched)) { cleanTmp(); throw new Error('The two photos are not the same person. Try again.'); }
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
      if (!found) {
        // Not a regular guard: an added reliever? (expected IN, or IN now and leaving)
        const today = qrDay();
        const rows = (await reliefRows(zcql, b.ROWID, [plusDay(today, -1), today, plusDay(today, 1)])).filter(r => !r.out_at);
        const people = await relieversOf(zcql, b.ROWID);
        const byId = new Map(people.map(p => [String(p.ROWID), p]));
        let hit = null;
        const phone = req.body.phone ? phoneOf(req.body.phone) : '';
        try {
          const self2 = tmpFile(photo, 'jpg');
          for (const r of rows) {
            const p = byId.get(String(r.reliever_id));
            if (!p) continue;
            if (p.photo_key) {
              const reg = await storedPhoto(bucket, p.photo_key);
              const cmp = await catalystApp.zia().compareFace(fs.createReadStream(reg), fs.createReadStream(self2));
              if (yes(cmp && cmp.matched)) { hit = { r, p, score: Number(cmp.confidence) || null }; break; }
            } else if (!r.in_at && phone && String(p.phone) === phone) {
              hit = { r, p, score: null, register: true }; // first time: this photo becomes his face
              break;
            }
          }
        } finally {
          cleanTmp();
        }
        if (!hit && phone) await tellOffice(catalystApp, b.ROWID, '⚠️ Unknown reliever at the gate', 'Phone ••••' + phone.slice(-4) + ' tried to IN but was not added by the guard on duty.');
        if (!hit) return ok(res, { matched: false, distance, relieverWanted: rows.some(r => !r.in_at && !(byId.get(String(r.reliever_id)) || {}).photo_key) });
        const action = hit.r.in_at ? 'OUT' : 'IN';
        const key = 'qr/' + b.ROWID + '/' + today + '/rel-' + hit.p.ROWID + '-' + crypto.randomBytes(5).toString('hex') + '.jpg';
        await bucket.putObject(key, photo, { contentType: 'image/jpeg' });
        const sh = (await getShifts(zcql, b.ROWID)).find(x => x.code === hit.r.shift_code);
        const ticket = await makeTicket(catalystApp, { rs: String(hit.r.ROWID), rel: String(hit.p.ROWID), b: String(b.ROWID), a: 'R' + action, s: key, d: distance, reg: !!hit.register });
        return ok(res, {
          matched: true, reliever: true, ticket, action, distance,
          guard: { name: hit.p.name + ' (reliever)', id: masked(hit.p.phone) },
          shift: sh ? { code: sh.code, start: sh.start, end: sh.end } : { code: hit.r.shift_code },
          since: hit.r.in_at ? String(hit.r.in_at).slice(11, 16) : '',
          addedBy: hit.r.added_by || ''
        });
      }

      // Keep the selfie (90 days) and say what the next press does.
      const day = qrDay();
      const selfie_key = 'qr/' + b.ROWID + '/' + day + '/' + found.ROWID + '-' + crypto.randomBytes(5).toString('hex') + '.jpg';
      await bucket.putObject(selfie_key, photo, { contentType: 'image/jpeg' });
      const open = await openIn(zcql, found.ROWID);
      const action = open ? 'OUT' : 'IN';
      const code = open ? '' : await rosterShiftOf(zcql, found.ROWID, day);
      const sh = (await getShifts(zcql, b.ROWID)).find(x => x.code === code);
      const ticket = await makeTicket(catalystApp, { g: String(found.ROWID), b: String(b.ROWID), a: action, s: selfie_key, la: lat, ln: lng, d: distance, m: score, dd: open ? open.duty_date : '' });
      // On duty now: he may add the reliever for the next shift.
      let relief = null;
      if (open) {
        const slot = await nextSlot(zcql, found.ROWID, open, b.ROWID);
        if (slot) {
          const row = activeRow(await reliefRows(zcql, b.ROWID, [slot.day]), slot.code);
          const people = await relieversOf(zcql, b.ROWID);
          const who = row && people.find(p => String(p.ROWID) === String(row.reliever_id));
          relief = { code: slot.code, day: slot.day, added: who ? who.name + ' ' + masked(who.phone) : '', list: people.map(p => ({ id: String(p.ROWID), name: p.name, phone: masked(p.phone), visits: Number(p.visits) || 0 })) };
        }
      }
      const hand = open ? await handover(zcql, b.ROWID, found.ROWID, open) : null;
      ok(res, {
        matched: true, ticket, action, distance, relief, handover: hand,
        guard: { name: found.guard_name, id: found.id_number },
        shift: sh ? { code: sh.code, start: sh.start, end: sh.end } : (code ? { code } : null),
        since: open ? String(open.CREATEDTIME).slice(11, 16) : ''
      });
    } catch (err) {
      cleanTmp();
      fail(res, err);
    }
  });

  // The guard on duty adds the reliever for the next shift (needs his fresh check ticket).
  app.post('/qrReliever', async (req, res) => {
    try {
      const catalystApp = admin(req);
      const zcql = catalystApp.zcql();
      const b = await branchByKey(zcql, req.body.k);
      const t = await readTicket(catalystApp, req.body.ticket);
      if (t.b !== String(b.ROWID) || t.a !== 'OUT' || !t.g) throw new Error('Scan again.');
      const g = (await zcql.executeZCQLQuery(`SELECT ROWID, guard_name FROM Guards WHERE ROWID = ${requireRowId(t.g)}`))[0].Guards;
      const open = await openIn(zcql, g.ROWID);
      if (!open) throw new Error('You are not IN. Scan again.');
      const slot = await nextSlot(zcql, g.ROWID, open, b.ROWID);
      if (!slot) throw new Error('No next shift for you to hand over.');
      let relId = req.body.reliever_id ? String(requireRowId(req.body.reliever_id)) : '';
      const people = await relieversOf(zcql, b.ROWID);
      if (relId && !people.some(p => String(p.ROWID) === relId)) throw new Error('Reliever not found.');
      if (!relId) {
        const name = String(req.body.name || '').replace(/[^A-Za-z .]/g, '').trim().slice(0, 60);
        if (name.length < 2) throw new Error('Reliever name, please.');
        const phone = phoneOf(req.body.phone);
        const same = people.find(p => String(p.phone) === phone);
        if (same) relId = String(same.ROWID); // known by the phone number
        else relId = String((await catalystApp.datastore().table('Relievers').insertRow({ branch_id: b.ROWID, name: name.toUpperCase(), phone, visits: 0, created_by: g.guard_name })).ROWID);
      }
      const table = catalystApp.datastore().table('ReliefShifts');
      const row = activeRow(await reliefRows(zcql, b.ROWID, [slot.day]), slot.code); // an OUT reliever's row is done
      if (row && row.in_at) throw new Error('The reliever of shift ' + slot.code + ' is already IN.');
      if (row) await table.updateRow({ ROWID: row.ROWID, reliever_id: relId, added_by: g.guard_name });
      else await table.insertRow({ branch_id: b.ROWID, duty_date: slot.day, shift_code: slot.code, reliever_id: relId, added_by: g.guard_name });
      const who = (await relieversOf(zcql, b.ROWID)).find(p => String(p.ROWID) === relId);
      ok(res, { code: slot.code, day: slot.day, name: who ? who.name : '' });
    } catch (err) {
      fail(res, err);
    }
  });

  // ---------- office (step 4 / 6): who is at the gate now, with selfies; Allow OUT ----------
  const signed = async (bucket, key) => { try { return key ? (await bucket.generatePreSignedUrl(key, 'GET', { expiryIn: '3600' })).signature : ''; } catch (e) { return ''; } };
  app.get('/qrOnDuty', async (req, res) => {
    try {
      auth.need(req, 'supervisor');
      const catalystApp = admin(req);
      const zcql = catalystApp.zcql();
      const branch = auth.requireBranch(req, requireRowId(req.query.branch));
      const br = (await zcql.executeZCQLQuery(`SELECT qr_key FROM Branches WHERE ROWID = ${branch}`))[0].Branches;
      if (!br.qr_key) return ok(res, { gate: false });
      const bucket = catalystApp.stratus().bucket(BUCKET);
      const guards = (await zcql.executeZCQLQuery(`SELECT ROWID, guard_name, id_number FROM Guards WHERE branch_id = ${branch} AND is_active = 'true'${auth.agencyWhere(req)}`)).map(r => r.Guards);
      const on = [];
      for (const g of guards) {
        const open = await openIn(zcql, g.ROWID);
        if (!open) continue;
        const last = (await zcql.executeZCQLQuery(`SELECT punch_time, selfie_key, distance_m, source FROM AccessLog WHERE guard_id = ${g.ROWID} AND direction = 'IN' ORDER BY CREATEDTIME DESC LIMIT 1`))[0].AccessLog;
        const hand = await handover(zcql, branch, g.ROWID, open);
        on.push({ id: String(g.ROWID), name: g.guard_name, idNo: g.id_number, in: last.punch_time, since: String(open.CREATEDTIME).slice(0, 16), distance: last.distance_m, selfie: await signed(bucket, last.selfie_key), next: hand.code, nextOk: hand.ok });
      }
      const today = qrDay();
      const rel = (await reliefRows(zcql, branch, [plusDay(today, -1), today, plusDay(today, 1)])).filter(r => !r.out_at);
      const people = await relieversOf(zcql, branch);
      const relievers = [];
      for (const r of rel) {
        const p = people.find(x => String(x.ROWID) === String(r.reliever_id)) || {};
        const sel = (await zcql.executeZCQLQuery(`SELECT in_selfie FROM ReliefShifts WHERE ROWID = ${r.ROWID}`))[0].ReliefShifts.in_selfie;
        relievers.push({ rs: String(r.ROWID), name: p.name || '?', phone: masked(p.phone), shift: r.shift_code, day: r.duty_date, in: r.in_at ? String(r.in_at).slice(11, 16) : '', addedBy: r.added_by || '', selfie: await signed(bucket, sel) });
      }
      ok(res, { gate: true, on, relievers });
    } catch (err) {
      fail(res, err);
    }
  });

  // 🔔 Late (step 5): a Catalyst cron calls this at each shift start + 15 min (Cumbum: 06:15, 09:15, 14:15, 22:15)
  // with the secret from Settings 'qr_cron_key'. For every QR branch, the shift that started 10–30 min ago: if
  // none of its rostered guards nor its reliever is IN, the branch's notification phones hear it.
  app.get('/qrLateCheck', async (req, res) => {
    try {
      const catalystApp = admin(req);
      const zcql = catalystApp.zcql();
      const key = await getSetting(zcql, 'qr_cron_key');
      if (!key || !key.setting_value || String(req.query.key || '') !== key.setting_value) throw new Error('Not allowed.');
      const day = qrDay();
      const nowMin = (() => { const d = new Date(Date.now() + 330 * 60000); return d.getUTCHours() * 60 + d.getUTCMinutes(); })();
      const branches = (await zcql.executeZCQLQuery("SELECT ROWID, branch_name FROM Branches WHERE qr_key IS NOT NULL AND is_active = 'true'")).map(r => r.Branches);
      const told = [];
      for (const b of branches) {
        for (const sh of await getShifts(zcql, b.ROWID)) {
          if (!sh.start) continue;
          const since = (nowMin - (+sh.start.slice(0, 2) * 60 + +sh.start.slice(3, 5)) + 1440) % 1440;
          if (since < 10 || since > 30) continue;
          const guards = (await zcql.executeZCQLQuery(`SELECT ROWID, guard_name FROM Guards WHERE branch_id = ${b.ROWID} AND is_active = 'true'`)).map(r => r.Guards);
          const expected = [];
          let inNow = false;
          for (const g of guards) {
            if ((await rosterShiftOf(zcql, g.ROWID, day)) !== sh.code) continue;
            expected.push(g.guard_name);
            if ((await zcql.executeZCQLQuery(`SELECT ROWID FROM AccessLog WHERE guard_id = ${g.ROWID} AND duty_date = '${day}' AND direction = 'IN' LIMIT 1`)).length) inNow = true;
          }
          const rel = (await reliefRows(zcql, b.ROWID, [day])).find(r => r.shift_code === sh.code);
          if (rel && rel.in_at) inNow = true;
          if (inNow || (!expected.length && !rel)) continue; // someone is IN, or nobody is planned (e.g. G on Sunday)
          const relName = rel ? ((await relieversOf(zcql, b.ROWID)).find(p => String(p.ROWID) === String(rel.reliever_id)) || {}).name : '';
          await tellOffice(catalystApp, b.ROWID, '🚨 ' + b.branch_name + ' Shift ' + sh.code + ': nobody IN', 'Started ' + sh.start + '. Expected: ' + [...expected, relName ? 'reliever ' + relName : ''].filter(Boolean).join(', ') + '.');
          told.push(b.branch_name + ' ' + sh.code);
        }
      }
      ok(res, { told });
    } catch (err) {
      fail(res, err);
    }
  });

  // Setup → Relievers (Prem, 29 Oct): everyone a guard ever added at this branch, with the registered photo.
  app.get('/qrRelievers', async (req, res) => {
    try {
      auth.need(req, 'supervisor');
      const catalystApp = admin(req);
      const zcql = catalystApp.zcql();
      const branch = auth.requireBranch(req, requireRowId(req.query.branch));
      const bucket = catalystApp.stratus().bucket(BUCKET);
      const list = [];
      for (const p of await relieversOf(zcql, branch)) {
        const last = (await zcql.executeZCQLQuery(`SELECT duty_date, shift_code, in_at, added_by FROM ReliefShifts WHERE reliever_id = ${p.ROWID} ORDER BY CREATEDTIME DESC LIMIT 1`)).map(r => r.ReliefShifts)[0] || {};
        list.push({ id: String(p.ROWID), name: p.name, phone: p.phone, visits: Number(p.visits) || 0, photo: await signed(bucket, p.photo_key), last: last.duty_date ? last.duty_date + ' · ' + last.shift_code + (last.in_at ? '' : ' (did not come)') : '', addedBy: last.added_by || '' });
      }
      ok(res, list.sort((a, b) => b.visits - a.visits || a.name.localeCompare(b.name)));
    } catch (err) {
      fail(res, err);
    }
  });

  // The office lets a guard go OUT when nobody came (Prem, 29 Oct: "office Allow OUT"); recorded with who allowed.
  app.post('/qrAllowOut', async (req, res) => {
    try {
      auth.need(req, 'supervisor');
      const catalystApp = admin(req);
      const zcql = catalystApp.zcql();
      const g = (await zcql.executeZCQLQuery(`SELECT ROWID, guard_name, branch_id, agency_id, escort_id, guard_token, is_active FROM Guards WHERE ROWID = ${requireRowId(req.body.guard_id)}`))[0];
      const guard = auth.requireRow(req, g && g.Guards, 'guard');
      const open = await openIn(zcql, guard.ROWID);
      if (!open) throw new Error(guard.guard_name + ' is not IN.');
      const { time } = istNow();
      await catalystApp.datastore().table('AccessLog').insertRow({ guard_id: guard.ROWID, direction: 'OUT', punch_time: time, duty_date: open.duty_date, source: 'QR', allowed_by: req.user.name });
      try { await onPostOut(catalystApp, guard); } catch (err) { console.error('Allow OUT follow-up failed:', err.message || err); }
      ok(res, { name: guard.guard_name, time });
    } catch (err) {
      fail(res, err);
    }
  });

  // A one-post site without a supervisor (Cumbum): no one publishes a day schedule, so a QR IN puts the guard
  // on that post for his roster shift (published), like a card IN on a published day. The post page then opens.
  async function autoSchedule(catalystApp, zcql, guard, day) {
    const has = await zcql.executeZCQLQuery(`SELECT ROWID FROM Schedule WHERE guard_id = ${guard.ROWID} AND sched_date = '${day}' AND published = true LIMIT 1`);
    if (has.length) return;
    const posts = (await zcql.executeZCQLQuery(`SELECT ROWID, shift_codes FROM Posts WHERE branch_id = ${requireRowId(guard.branch_id)} AND agency_id = ${requireRowId(guard.agency_id)} AND post_type = 'POST' AND is_active = 'true'`)).map(r => r.Posts);
    if (posts.length !== 1) return;
    const code = await rosterShiftOf(zcql, guard.ROWID, day);
    const p = posts[0];
    if (!'ABCG'.includes(code || '-') || (p.shift_codes && !String(p.shift_codes).includes(code))) return;
    const taken = (await zcql.executeZCQLQuery(`SELECT ROWID, guard_id FROM Schedule WHERE post_id = ${p.ROWID} AND sched_date = '${day}' AND shift_code = '${code}'`)).map(r => r.Schedule);
    const table = catalystApp.datastore().table('Schedule');
    const mine = taken.find(x => String(x.guard_id) === String(guard.ROWID));
    if (mine) await table.updateRow({ ROWID: mine.ROWID, published: true });
    else if (!taken.length) await table.insertRow({ branch_id: guard.branch_id, sched_date: day, post_id: p.ROWID, shift_code: code, guard_id: guard.ROWID, published: true });
  }

  // The press after a successful check: the IN / OUT is saved like a card swipe.
  app.post('/qrPunch', async (req, res) => {
    try {
      const catalystApp = admin(req);
      const zcql = catalystApp.zcql();
      const b = await branchByKey(zcql, req.body.k);
      const t = await readTicket(catalystApp, req.body.ticket);
      if (t.b !== String(b.ROWID)) throw new Error('Scan again.');
      if (t.a === 'RIN' || t.a === 'ROUT') {
        const { time } = istNow();
        const now = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 16).replace('T', ' ');
        const row = (await zcql.executeZCQLQuery(`SELECT ROWID, in_at, out_at FROM ReliefShifts WHERE ROWID = ${requireRowId(t.rs)}`))[0];
        const r = row && row.ReliefShifts;
        if (!r || r.out_at || (t.a === 'RIN') !== !r.in_at) throw new Error('Scan again.');
        const rel = (await zcql.executeZCQLQuery(`SELECT ROWID, name, visits FROM Relievers WHERE ROWID = ${requireRowId(t.rel)}`))[0].Relievers;
        if (t.a === 'RIN') {
          await catalystApp.datastore().table('ReliefShifts').updateRow({ ROWID: r.ROWID, in_at: now, in_selfie: t.s, in_distance_m: t.d });
          await catalystApp.datastore().table('Relievers').updateRow({ ROWID: rel.ROWID, visits: (Number(rel.visits) || 0) + 1, last_seen: now, ...(t.reg ? { photo_key: t.s } : {}) });
        } else {
          await catalystApp.datastore().table('ReliefShifts').updateRow({ ROWID: r.ROWID, out_at: now, out_selfie: t.s });
        }
        return ok(res, { action: t.a.slice(1), time, name: rel.name + ' (reliever)', token: '' });
      }
      const g = (await zcql.executeZCQLQuery(`SELECT ROWID, guard_name, id_number, branch_id, agency_id, escort_id, guard_token, is_active FROM Guards WHERE ROWID = ${requireRowId(t.g)}`))[0];
      const guard = g && g.Guards;
      if (!guard || guard.is_active !== 'true') throw new Error('Guard not found.');
      // Pressed twice, or the state changed since the check: refuse.
      const open = await openIn(zcql, guard.ROWID);
      if ((t.a === 'IN') !== !open) throw new Error('Already ' + (open ? 'IN' : 'OUT') + '. Scan again.');
      if (t.a === 'OUT') {
        const hand = await handover(zcql, b.ROWID, guard.ROWID, open);
        if (!hand.ok) {
          await tellOffice(catalystApp, b.ROWID, '🔒 ' + guard.guard_name + ' wants to go OUT', 'Shift ' + hand.code + (hand.reliever ? ': reliever ' + hand.reliever.name + ' not IN' : ': nobody IN, no reliever added') + '. Allow OUT on the Schedule page if needed.');
          throw new Error('🔒 OUT locked: the Shift ' + hand.code + ' guard or reliever is not IN yet. Wait, or ask the office.');
        }
      }
      const { time } = istNow();
      const day = t.a === 'OUT' && t.dd ? t.dd : qrDay(); // an OUT belongs to its IN's duty day (C shift)
      await catalystApp.datastore().table('AccessLog').insertRow({
        guard_id: guard.ROWID, direction: t.a, punch_time: time, duty_date: day, source: 'QR',
        lat: t.la, lng: t.ln, distance_m: t.d, selfie_key: t.s, match_score: t.m
      });
      let token = '';
      try {
        if (t.a === 'IN') {
          await autoSchedule(catalystApp, zcql, guard, day);
          await onCardIn(catalystApp, guard, time, day);
          // The guard's own duty page opens on this phone after the IN (face + gate GPS proved who it is).
          token = guard.guard_token || crypto.randomBytes(16).toString('hex');
          if (!guard.guard_token) await catalystApp.datastore().table('Guards').updateRow({ ROWID: guard.ROWID, guard_token: token });
        } else await onPostOut(catalystApp, guard);
      } catch (err) {
        console.error('QR swipe follow-up failed:', err.message || err);
      }
      ok(res, { action: t.a, time, name: guard.guard_name, token });
    } catch (err) {
      fail(res, err);
    }
  });
};
