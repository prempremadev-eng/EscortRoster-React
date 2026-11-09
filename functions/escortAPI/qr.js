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

const BUCKET = (process.env.MEDIA_BUCKET || 'escortcardaccess-media');
const KEY_RE = /^[a-f0-9]{24}$/;
const MAX_ACCURACY_M = 100; // GPS worse than this: ask to step outside and try again
const TICKET_MS = 3 * 60000; // the photo check is valid for 3 minutes before IN / OUT is pressed
const OPEN_IN_HOURS = 16; // an IN older than this is not closed by the next scan (forgotten OUT)

module.exports = function qrRoutes(app, h) {
  const { catalyst, fail, requireRowId, auth, istNow, getShifts, getVapidKeys, onCardIn, onPostOut, rosterShiftOf, notify, getSetting, sendPushToGuard } = h;
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
    if (Date.now() - data.t > (data.x || TICKET_MS)) throw new Error(data.x ? 'Scan again.' : 'Too slow: scan again.');
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

  // 🔊 Tamil voice for the face check (Prem, 6 Nov): made once with Sarvam (key in Settings, never sent to
  // the phone), kept in Stratus, then served from there. Same voice on every phone.
  // Every gate result is spoken too (Prem, 6 Nov: "ellame voice la sollanum"). Fixed sentences only (no free text).
  const VOICE_TEXT = {
    look: 'கேமராவை நேராகப் பாருங்கள்', close: 'கண்ணை மூடுங்கள்', open: 'கண்ணைத் திறங்கள்',
    in_ok: 'IN பதிவு செய்யப்பட்டது. நன்றி.', out_ok: 'OUT பதிவு செய்யப்பட்டது. நன்றி.',
    reg_ok: 'உங்கள் முகம் பதிவு செய்யப்பட்டது. IN முடிந்தது.',
    nomatch: 'முகம் பொருந்தவில்லை. மீண்டும் முயற்சிக்கவும். முதல் முறை என்றால் புதிய பதிவு செய்யவும்.',
    already: 'நீங்கள் ஏற்கனவே IN செய்துள்ளீர்கள். உங்கள் பணி பக்கம் திறக்கிறது.',
    notin: 'நீங்கள் இன்னும் IN செய்யவில்லை. முதலில் IN அழுத்தவும்.',
    blink: 'கண்ணை மூடவில்லை. சொல்லும்போது கண்ணை மூடி, மீண்டும் முயற்சிக்கவும்.',
    notsame: 'இரண்டு புகைப்படங்களும் ஒரே நபர் இல்லை. மீண்டும் முயற்சிக்கவும்.',
    far: 'நீங்கள் கேட்டிலிருந்து தொலைவில் உள்ளீர்கள். கேட் அருகே வாருங்கள்.',
    gps: 'இடம் சரியாகக் கிடைக்கவில்லை. வெளியே வந்து மீண்டும் முயற்சிக்கவும்.',
    dark: 'இருட்டாக உள்ளது. வெளிச்சத்தில் நின்று மீண்டும் முயற்சிக்கவும்.',
    front: 'முகம் சரியாகத் தெரியவில்லை. கேமராவை நேராகப் பார்த்து மீண்டும் முயற்சிக்கவும்.',
    locked: 'OUT பூட்டப்பட்டுள்ளது. அடுத்த ஷிஃப்ட் காவலர் வரும் வரை காத்திருங்கள்.',
    noduty: 'இன்று உங்களுக்கு பணி இல்லை. அலுவலகத்தைக் கேளுங்கள்.',
    time: 'இது உங்கள் ஷிஃப்ட் நேரம் இல்லை. திரையில் உள்ள நேரத்தைப் பாருங்கள்.',
    swap: 'இது வேறு ஷிஃப்ட். அலுவலகத்திடம் அனுமதி கேளுங்கள்.',
    regdetails: 'விவரங்கள் பொருந்தவில்லை. சரியான பெயர் மற்றும் தொலைபேசி எண்ணைக் கொடுங்கள்.',
    registered: 'நீங்கள் ஏற்கனவே பதிவு செய்துள்ளீர்கள். IN அழுத்தவும்.',
    dupface: 'இந்த முகம் ஏற்கனவே வேறு பெயரில் பதிவு செய்யப்பட்டுள்ளது. ஒருவருக்கு ஒரு பதிவு மட்டுமே. அலுவலகத்தைக் கேளுங்கள்.',
    retry: 'மீண்டும் முயற்சிக்கவும்.'
  };
  const voiceCache = {}; // name → Buffer while the function stays warm
  app.get('/qrVoice', async (req, res) => {
    try {
      let n = String(req.query.n || '');
      const catalystApp = admin(req);
      const site = await branchByKey(catalystApp.zcql(), req.query.k);
      // "dup-<guard>": the duplicate-face sentence with that guard's name (Prem, 9 Nov). Only a guard of this site.
      let text = VOICE_TEXT[n], key = 'voice/ta-' + n + '-v3-kavitha.mp3'; // mp3 (Prem, 6 Nov: wav was ~4 MB in all, too slow on site data)
      const dupM = n.match(/^dup-(\d{5,20})$/);
      if (dupM) {
        const g = (await catalystApp.zcql().executeZCQLQuery(`SELECT guard_name FROM Guards WHERE ROWID = ${requireRowId(dupM[1])} AND branch_id = ${site.ROWID}`))[0];
        if (!g) throw new Error('Unknown voice.');
        const name = String(g.Guards.guard_name || '').trim();
        text = 'இந்த முகம் ஏற்கனவே ' + name + ' பெயரில் பதிவு செய்யப்பட்டுள்ளது. ஒருவருக்கு ஒரு பதிவு மட்டுமே. அலுவலகத்தைக் கேளுங்கள்.';
        n = n + '-' + crypto.createHash('sha1').update(name).digest('hex').slice(0, 8); // a new name → a new clip
        key = 'voice/' + n + '.mp3';
      }
      if (!text) throw new Error('Unknown voice.');
      if (!voiceCache[n]) {
        const bucket = catalystApp.stratus().bucket(BUCKET);
        try {
          const chunks = [];
          for await (const c of await bucket.getObject(key)) chunks.push(Buffer.from(c));
          voiceCache[n] = Buffer.concat(chunks);
        } catch (e) {
          const row = await getSetting(catalystApp.zcql(), 'sarvam_api_key');
          const apiKey = row && row.setting_value ? String(row.setting_value).trim() : '';
          if (!apiKey) throw new Error('Voice is not set up (no key).');
          const r = await fetch('https://api.sarvam.ai/text-to-speech', {
            method: 'POST', headers: { 'api-subscription-key': apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ inputs: [text], target_language_code: 'ta-IN', model: 'bulbul:v3', speaker: 'kavitha', output_audio_codec: 'mp3' })
          });
          if (!r.ok) { const t = await r.text(); console.error('Sarvam TTS failed:', r.status, t); throw new Error('Voice failed (' + r.status + '): ' + t.slice(0, 160)); }
          const audio = Buffer.from((await r.json()).audios[0], 'base64');
          await bucket.putObject(key, audio, { contentType: 'audio/mpeg' });
          voiceCache[n] = audio;
        }
      }
      res.set({ 'Content-Type': 'audio/mpeg', 'Cache-Control': 'public, max-age=604800' });
      res.status(200).send(voiceCache[n]);
    } catch (err) {
      fail(res, err);
    }
  });

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
  // ⏰ Shift times (Prem, 2 Nov): IN from 40 min before the start (A 06:00 → 05:20); OUT only after the end
  // (A → 14:00). Another shift today: a 🔄 swap, asked at the gate from 40 min before its start till 15 min
  // after, and the office OK makes it (the day sheet changes; the month roster stays).
  const EARLY_MIN = 40, SWAP_LATE_MIN = 15, SWAP_MAX_ASKS = 2, IN_AFTER_END_MIN = 10; // IN till 10 min after the end (A → 14:10, Prem 2 Nov)
  const hm = t => +String(t).slice(0, 2) * 60 + +String(t).slice(3, 5);
  const clock = m => String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, '0') + ':' + String(((m % 60) + 60) % 60).padStart(2, '0');
  const spanOf = sh => { const st = hm(sh.start); let en = hm(sh.end); if (en <= st) en += 1440; return { st, en }; };
  // Guard messages in Tamil (Prem, 2 Nov): 22:00 → "இரவு 10 மணி", 05:20 → "காலை 5:20 மணி".
  function taWhen(m) {
    const t = ((m % 1440) + 1440) % 1440, h = Math.floor(t / 60), mm = t % 60;
    const part = h >= 4 && h < 12 ? 'காலை' : h >= 12 && h < 16 ? 'மதியம்' : h >= 16 && h < 19 ? 'மாலை' : 'இரவு';
    return part + ' ' + ((h % 12) || 12) + (mm ? ':' + String(mm).padStart(2, '0') : '') + ' மணி';
  }
  const minsInto = day => Math.floor((Date.now() + 330 * 60000 - Date.parse(day + 'T00:00:00Z')) / 60000);
  // His shift on a day: the published day sheet first (a swap the office OK'd), else the month roster.
  async function dutyCode(zcql, guardId, day) {
    const codes = (await zcql.executeZCQLQuery(`SELECT shift_code FROM Schedule WHERE guard_id = ${requireRowId(guardId)} AND sched_date = '${day}' AND published = true`)).map(r => r.Schedule.shift_code);
    return codes.find(c => 'ABC'.includes(c || '-')) || codes[0] || await rosterShiftOf(zcql, guardId, day);
  }
  // null when an IN fits now; else { why, swapTo } (swapTo: the shift starting now, for a 🔄 swap).
  function inCheck(shifts, code, day) {
    const now = minsInto(day);
    const sh = shifts.find(x => x.code === code && x.start && x.end);
    if (sh) { const { st, en } = spanOf(sh); if (now >= st - EARLY_MIN && now < en + IN_AFTER_END_MIN) return null; }
    const to = shifts.find(x => x.code !== code && 'ABCG'.includes(x.code) && x.start && now >= hm(x.start) - EARLY_MIN && now <= hm(x.start) + SWAP_LATE_MIN);
    if (to) return { swapTo: to.code, why: (sh ? 'இன்று நீங்கள் ' + taWhen(hm(sh.start)) + 'க்கு Shift ' + code + '-ல் பணிபுரிய வேண்டும்.' : 'இன்று உங்களுக்கு பணி இல்லை.') + ' Shift ' + to.code + ' வேண்டுமென்றால் அலுவலகத்தின் அனுமதி பெற வேண்டும்.' };
    if (!sh) return { why: '📅 இன்று ரோஸ்டரில் உங்களுக்கு பணி இல்லை. அலுவலகத்தைக் கேளுங்கள்.' };
    const { st, en } = spanOf(sh);
    return { why: now < st - EARLY_MIN ? '⏰ Shift ' + code + ' ' + taWhen(st) + 'க்கு தொடங்கும். ' + taWhen(st - EARLY_MIN) + ' முதல் IN செய்யலாம்.' : '⏰ Shift ' + code + ' ' + taWhen(en) + 'க்கு முடிந்தது. IN ' + taWhen(en + IN_AFTER_END_MIN) + ' வரை மட்டும்.' };
  }
  // '' when an OUT fits now (the shift is over); else why not.
  function outCheck(shifts, code, day) {
    const sh = shifts.find(x => x.code === code && x.start && x.end);
    if (!sh) return '';
    const { en } = spanOf(sh);
    return minsInto(day) < en ? '⏰ Shift ' + code + ' ' + taWhen(en) + 'க்கு முடியும். அதன் பிறகு OUT செய்யவும் (அல்லது அலுவலகத்தைக் கேளுங்கள்).' : '';
  }
  // 🔄 Swap asks live in the Catalyst cache for a few hours (one list per branch): { id, g, name, from, to, day, at, status }.
  const swapKey = branchId => 'swap_' + branchId;
  async function swapsOf(catalystApp, branchId) {
    try { const v = await catalystApp.cache().segment().getValue(swapKey(branchId)); return v ? JSON.parse(v) : []; } catch (e) { return []; }
  }
  async function saveSwaps(catalystApp, branchId, list) {
    const keep = list.filter(x => Date.now() - x.t < 12 * 3600000);
    await catalystApp.cache().segment().put(swapKey(branchId), JSON.stringify(keep), 12);
  }
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
    return (await zcql.executeZCQLQuery(`SELECT ROWID, name, phone, photo_key, visits, guard_id FROM Relievers WHERE branch_id = ${branchId} ORDER BY name ASC`)).map(r => r.Relievers);
  }

  // Step 3, handover (Prem, 29 Oct): a guard may OUT only when the next shift is IN: the regular guard whose roster
  // says that shift, or the added reliever. G (09–18) has no next shift. Nobody IN → OUT stays locked.
  // The shift a guard is on: his roster; with no roster (29 Oct test), the A/B/C shift whose start is nearest his
  // IN time.
  async function shiftNow(zcql, branchId, guardId, open) {
    const code = await dutyCode(zcql, guardId, open.duty_date);
    if ('ABC'.includes(code || '-') || code === 'G') return code;
    const at = String(open.CREATEDTIME).slice(11, 16);
    const mins = t => +t.slice(0, 2) * 60 + +t.slice(3, 5);
    const gap = sh => { const d = Math.abs(mins(at) - mins(sh.start)); return Math.min(d, 1440 - d); };
    const best = (await getShifts(zcql, branchId)).filter(sh => 'ABC'.includes(sh.code) && sh.start).sort((x, y) => gap(x) - gap(y))[0];
    return best ? best.code : ''; // no 3-hour limit (29 Oct: a 17:31 IN found no shift and slipped past the lock)
  }
  // `code`: the shift he is on when it is known (a reliever's ReliefShifts row), else from the roster / IN time.
  async function handover(zcql, branchId, guardId, open, code) {
    code = code || await shiftNow(zcql, branchId, guardId, open);
    const next = NEXT[code];
    if (!next) return { ok: true, code: '', regulars: [], reliever: null };
    const day = code === 'C' ? plusDay(open.duty_date, 1) : open.duty_date;
    const guards = (await zcql.executeZCQLQuery(`SELECT ROWID, guard_name FROM Guards WHERE branch_id = ${requireRowId(branchId)} AND is_active = 'true'`)).map(r => r.Guards)
      .filter(g => String(g.ROWID) !== String(guardId));
    const regulars = [];
    for (const g of guards) {
      if ((await dutyCode(zcql, g.ROWID, day)) !== next) continue;
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

  // 🆕 Who is registering: checked before the camera (Prem, 29 Oct: wrong phone / name → no photo) and again with
  // the photo. Regular: ID + name + last 4 of the phone. Reliever: phone + name the guard on duty added.
  // The full name must match (Prem, 29 Oct); capitals, spaces and dots do not count ("Ravi kumar P" = "RAVIKUMAR.P").
  const sameName = (typed, saved) => { const n = x => String(x || '').toUpperCase().replace(/[^A-Z]/g, ''); return n(typed).length >= 2 && n(typed) === n(saved); };
  async function regWho(catalystApp, zcql, b, body, day, tell) {
    if (body.reg === 'reliever') {
      const phone = phoneOf(body.phone);
      const p = (await relieversOf(zcql, b.ROWID)).find(x => String(x.phone) === phone);
      const row = p && (await reliefRows(zcql, b.ROWID, [plusDay(day, -1), day, plusDay(day, 1)])).filter(r => String(r.reliever_id) === String(p.ROWID) && !r.in_at && !r.out_at)[0];
      if (!p || !row) {
        if (tell) await tellOffice(catalystApp, b.ROWID, '⚠️ Unknown reliever at the gate', 'Phone ••••' + phone.slice(-4) + ' tried to register but was not added by the guard on duty.');
        throw new Error('This phone number is not added today. Check the number, or ask the guard on duty to add your name and phone.');
      }
      if (!sameName(body.name, p.name)) throw new Error('Name does not match this phone number. Give your full name as the guard on duty added it.');
      if (p.photo_key) throw new Error('Already registered. Press ✅ IN.');
      return { p, row };
    }
    const idT = String(body.id || '').trim().replace(/^0+/, '').toUpperCase();
    const g = (await zcql.executeZCQLQuery(`SELECT ROWID, guard_name, id_number, phone, photo_key, tags FROM Guards WHERE branch_id = ${b.ROWID} AND is_active = 'true'`)).map(r => r.Guards)
      .find(x => String(x.id_number).replace(/^0+/, '').toUpperCase() === idT);
    if (!g) throw new Error('ID ' + (body.id || '') + ' is not a guard of this site. Check the ID, or ask the office.');
    if (g.photo_key) throw new Error('Already registered. Press ✅ IN.');
    if (!sameName(body.name, g.guard_name)) throw new Error('Name does not match ID ' + body.id + '. Give your full name as in the office records (with the initial).');
    if (g.phone && String(body.phone4 || '').replace(/\D/g, '') !== String(g.phone).replace(/\D/g, '').slice(-4)) throw new Error('Phone (last 4 digits) does not match. Give your correct phone number.');
    if (await openIn(zcql, g.ROWID)) throw new Error('Already IN.');
    return { g };
  }
  app.post('/qrRegCheck', async (req, res) => {
    try {
      const catalystApp = admin(req);
      const zcql = catalystApp.zcql();
      const b = await branchByKey(zcql, req.body.k);
      const who = await regWho(catalystApp, zcql, b, req.body, qrDay(), true);
      ok(res, { name: who.p ? who.p.name : who.g.guard_name });
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
      const guards = (await zcql.executeZCQLQuery(`SELECT ROWID, guard_name, id_number, photo_key, tags, branch_id, agency_id, escort_id, guard_token, is_active FROM Guards WHERE branch_id = ${b.ROWID} AND is_active = 'true'`))
        .map(r => r.Guards).filter(g => g.photo_key);
      const typed = req.body.purpose === 'REG' ? '' // REG: the typed ID is for registering, not a face filter (29 Oct)
        : String(req.body.id || '').trim().replace(/^0+/, '').toUpperCase();
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
      // Up to 3 eyes-closed photos (29 Oct: a guard closed late after the beep); the first one with the eyes shut counts.
      const shots = [req.body.photo2, req.body.photo3, req.body.photo4].map(x => String(x || '').match(/^data:image\/jpeg;base64,(.+)$/)).filter(Boolean);
      if (!shots.length) { cleanTmp(); throw new Error('😌 Close your eyes when asked and try again.'); }
      const first = await measureFace(catalystApp, selfieFile, 0);
      // 29 Oct tests: real blink 0.18–0.23 against 0.32 open (0.55–0.70); a photo stays ≈ 1.0. Limit 0.75.
      let turnFile = null;
      const seen = [];
      for (const m2 of first.eyes ? shots : []) {
        const f = tmpFile(Buffer.from(m2[1], 'base64'), 'jpg');
        const shut = await measureFace(catalystApp, f, 0);
        seen.push(shut.eyes);
        if (shut.eyes !== null && shut.eyes !== undefined && shut.eyes < first.eyes * 0.75) { turnFile = f; break; }
      }
      console.log('qr blink', JSON.stringify({ open: first.eyes, closed: seen, light: Number(req.body.light) || null }));
      if (!turnFile) { cleanTmp(); throw new Error('😌 Close your eyes when you hear the beep (2 seconds) and try again. First time here? Press 🆕 New Registration.'); }
      const same = await catalystApp.zia().compareFace(fs.createReadStream(selfieFile), fs.createReadStream(turnFile));
      if (!yes(same && same.matched)) { cleanTmp(); throw new Error('The two photos are not the same person. Try again.'); }
      const purpose = ['IN', 'OUT', 'REG'].includes(req.body.purpose) ? req.body.purpose : '';
      const day = qrDay();
      const shifts = await getShifts(zcql, b.ROWID);
      const shiftOf = code => { const sh = shifts.find(x => x.code === code); return sh ? { code: sh.code, start: sh.start, end: sh.end } : (code ? { code } : null); };
      const keyFor = who => 'qr/' + b.ROWID + '/' + day + '/' + who + '-' + crypto.randomBytes(5).toString('hex') + '.jpg';

      // 🆕 New Registration (Prem, 29 Oct): the first time, the live photo becomes the face. Regular guard: ID +
      // name + last 4 of his phone, and no face yet. Reliever: the name + phone the guard on duty added.
      if (purpose === 'REG') {
        // One face, one person (Prem, 9 Nov: his face got registered for two guards). The new face is checked
        // against every registered face here (guards and relievers); a match stops the registration.
        let dup = null;
        try {
          for (const g of guards.slice(0, 40)) {
            const regFile = await storedPhoto(bucket, g.photo_key);
            const r = await catalystApp.zia().compareFace(fs.createReadStream(regFile), fs.createReadStream(selfieFile));
            if (yes(r && r.matched)) { dup = { g, conf: Number(r.confidence) || 0 }; break; }
          }
        } finally {
          cleanTmp();
        }
        if (dup) {
          console.log('qr reg duplicate', JSON.stringify({ g: String(dup.g.ROWID), conf: dup.conf }));
          await tellOffice(catalystApp, b.ROWID, '⚠️ Same face, second registration', 'Someone tried to register with the face of ' + dup.g.guard_name + '.');
          return ok(res, { dup: true, name: dup.g.guard_name, gid: String(dup.g.ROWID) });
        }
        const who = await regWho(catalystApp, zcql, b, req.body, day, false);
        if (who.p) {
          const { p, row } = who;
          const late = inCheck(shifts, row.shift_code, row.duty_date);
          if (late) throw new Error(late.swapTo ? '⏰ உங்கள் reliever பணி Shift ' + row.shift_code + '. அந்த நேரத்தில் வாருங்கள்.' : late.why);
          const key = keyFor('rel-' + p.ROWID);
          await catalystApp.stratus().bucket(BUCKET).putObject(key, photo, { contentType: 'image/jpeg' });
          const ticket = await makeTicket(catalystApp, { rs: String(row.ROWID), rel: String(p.ROWID), b: String(b.ROWID), a: 'RIN', s: key, d: distance, reg: true });
          return ok(res, { matched: true, reliever: true, registering: true, ticket, action: 'IN', distance, guard: { name: p.name + ' 🔁 reliever', id: masked(p.phone) }, shift: shiftOf(row.shift_code), addedBy: row.added_by || '' });
        }
        const g = who.g;
        const code = await dutyCode(zcql, g.ROWID, day);
        const late = inCheck(shifts, code, day);
        if (late) throw new Error(late.why + (late.swapTo ? ' உங்கள் shift நேரத்தில் பதிவு செய்யவும்.' : ''));
        const key = keyFor(g.ROWID);
        await catalystApp.stratus().bucket(BUCKET).putObject(key, photo, { contentType: 'image/jpeg' });
        const ticket = await makeTicket(catalystApp, { g: String(g.ROWID), b: String(b.ROWID), a: 'IN', s: key, la: lat, ln: lng, d: distance, m: null, dd: '', reg: true });
        return ok(res, { matched: true, registering: true, ticket, action: 'IN', distance, guard: { name: g.guard_name, id: g.id_number }, shift: shiftOf(code) });
      }

      let found = null, score = null;
      try {
        // Best match, not the first one (Prem, 6 Nov: a new person was taken for a registered guard). Every
        // score is logged so the safe limit can be set from real tests.
        const scores = [];
        for (const g of list.slice(0, 10)) {
          const regFile = await storedPhoto(bucket, g.photo_key);
          const r = await catalystApp.zia().compareFace(fs.createReadStream(regFile), fs.createReadStream(selfieFile));
          const conf = Number(r && r.confidence) || 0;
          scores.push({ g: String(g.ROWID), ok: yes(r && r.matched), conf });
          if (yes(r && r.matched) && conf > (score || 0)) { found = g; score = conf || null; }
        }
        console.log('qr match', JSON.stringify({ purpose: req.body.purpose || '', scores }));
      } finally {
        cleanTmp();
      }
      if (!found) return ok(res, { matched: false, distance });

      // A reliever (a guard profile with the Reliever tag): IN only with a duty allotted today (Prem, 29 Oct).
      if (String(found.tags || '').split(',').includes('Reliever')) {
        const p = (await zcql.executeZCQLQuery(`SELECT ROWID, name, phone FROM Relievers WHERE guard_id = ${found.ROWID}`)).map(r => r.Relievers)[0];
        const rows = p ? (await reliefRows(zcql, b.ROWID, [plusDay(day, -1), day, plusDay(day, 1)])).filter(r => String(r.reliever_id) === String(p.ROWID) && !r.out_at) : [];
        const inRow = rows.find(r => r.in_at), waiting = rows.find(r => !r.in_at);
        const act = purpose === 'OUT' ? 'OUT' : purpose === 'IN' ? 'IN' : (inRow ? 'OUT' : 'IN');
        const row = act === 'OUT' ? inRow : waiting;
        // Already IN (pressed IN again, 6 Nov): say so, like a regular guard; not "no duty allotted".
        if (act === 'IN' && !waiting && inRow) return ok(res, { already: true, token: found.guard_token || '', name: found.guard_name, since: String(inRow.in_at).slice(11, 16) });
        if (!row) {
          if (act === 'IN') await tellOffice(catalystApp, b.ROWID, '⚠️ Reliever without duty at the gate', found.guard_name + ' scanned IN but no guard added him today.');
          throw new Error(act === 'IN' ? '🔁 ' + found.guard_name + ': no duty allotted today. Ask the guard on duty to add you.' : 'You are not IN. Press ✅ IN.');
        }
        if (act === 'IN') { const late = inCheck(shifts, row.shift_code, row.duty_date); if (late) throw new Error(late.swapTo ? '⏰ உங்கள் reliever பணி Shift ' + row.shift_code + '. அந்த நேரத்தில் வாருங்கள்.' : late.why); }
        else { const early = outCheck(shifts, row.shift_code, row.duty_date); if (early) throw new Error(early); }
        // A reliever waits for the next shift too (Prem, 2 Nov), like a regular guard.
        const hand = act === 'OUT' ? await handover(zcql, b.ROWID, found.ROWID, { duty_date: row.duty_date }, row.shift_code) : null;
        const key = keyFor('rel-' + p.ROWID);
        await bucket.putObject(key, photo, { contentType: 'image/jpeg' });
        const ticket = await makeTicket(catalystApp, { rs: String(row.ROWID), rel: String(p.ROWID), b: String(b.ROWID), a: 'R' + act, s: key, d: distance });
        return ok(res, { matched: true, reliever: true, ticket, action: act, distance, handover: hand, guard: { name: found.guard_name + ' 🔁 reliever', id: masked(p.phone) }, shift: shiftOf(row.shift_code), since: row.in_at ? String(row.in_at).slice(11, 16) : '', addedBy: row.added_by || '' });
      }

      const open = await openIn(zcql, found.ROWID);
      // Already IN + the face matched (Prem, 6 Nov): open his duty page, no link needed.
      if (purpose === 'IN' && open) return ok(res, { already: true, token: found.guard_token || '', name: found.guard_name, since: String(open.CREATEDTIME).slice(11, 16) });
      if (purpose === 'OUT' && !open) throw new Error('You are not IN. Press ✅ IN.');
      const action = open ? 'OUT' : 'IN';
      const code = open ? '' : await dutyCode(zcql, found.ROWID, day);
      // Too early for OUT: the screen still opens (Prem, 2 Nov night: the C guard adds the A reliever before 06:00),
      // only without the OUT button.
      const early = open ? outCheck(shifts, await shiftNow(zcql, b.ROWID, found.ROWID, open), open.duty_date) : '';
      if (!open) {
        const late = inCheck(shifts, code, day);
        if (late && !late.swapTo) throw new Error(late.why);
        if (late) {
          // 🔄 Another shift now: ask the office (once); after its OK the day sheet has him there and this passes.
          const asks = (await swapsOf(catalystApp, b.ROWID)).filter(x => x.g === String(found.ROWID) && x.day === day && x.to === late.swapTo);
          const mine = asks[asks.length - 1];
          // Two asks at most (Prem, 2 Nov): after two "no" he calls the office.
          if (asks.filter(x => x.status === 'no').length >= SWAP_MAX_ASKS) throw new Error('❌ அலுவலகம் ' + SWAP_MAX_ASKS + ' முறை ஏற்கவில்லை. இன்று உங்கள் shift: ' + (code ? 'Shift ' + code : 'இல்லை') + '. அலுவலகத்தை phone-ல் தொடர்பு கொள்ளுங்கள்.');
          if (mine && mine.status === 'pending') throw new Error('⏳ Shift ' + mine.to + ' மாற்றம் ' + mine.at + '-க்கு கேட்கப்பட்டது. அலுவலக அனுமதி வந்ததும் மீண்டும் ஸ்கேன் செய்யவும்.');
          // Said no before: he may ask again (Prem, 2 Nov: the office pressed No by mistake).
          const refused = !!(mine && mine.status === 'no');
          // The face check is done now: its photo and place become his IN when the office says OK (Prem, 2 Nov: no second scan).
          const swapSelfie = keyFor(found.ROWID);
          await bucket.putObject(swapSelfie, photo, { contentType: 'image/jpeg' });
          const swapTicket = await makeTicket(catalystApp, { g: String(found.ROWID), b: String(b.ROWID), a: 'SWAP', from: code || '', to: late.swapTo, day, s: swapSelfie, la: lat, ln: lng, d: distance, x: 30 * 60000 });
          return ok(res, { matched: true, swap: { from: code || '', to: late.swapTo, why: late.why, ticket: swapTicket, refused }, guard: { name: found.guard_name, id: found.id_number }, distance });
        }
      }
      // Keep the selfie (90 days) and say what the next press does.
      const selfie_key = keyFor(found.ROWID);
      await bucket.putObject(selfie_key, photo, { contentType: 'image/jpeg' });
      const sh = shiftOf(code);
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
        pass: hand && !hand.ok && hand.reliever ? await waitPass(catalystApp, found.ROWID, b.ROWID) : '',
        early,
        guard: { name: found.guard_name, id: found.id_number },
        shift: sh,
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
      ok(res, { code: slot.code, day: slot.day, name: who ? who.name : '', pass: await waitPass(catalystApp, g.ROWID, b.ROWID) });
    } catch (err) {
      fail(res, err);
    }
  });

  // The office adds the reliever (Prem, 30 Oct: no regular on duty to hand over, e.g. a roster "Off Reliever"
  // shift): Schedule page → 🔁 RELIEVERS → ➕ Add reliever, for a day and a shift. Then the reliever registers
  // and INs at the QR exactly as if the guard on duty had added them.
  app.post('/qrRelieverOffice', async (req, res) => {
    try {
      auth.need(req, 'supervisor');
      const catalystApp = admin(req);
      const zcql = catalystApp.zcql();
      const branch = String(auth.requireBranch(req, requireRowId(req.body.branch)));
      const day = String(req.body.date || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Pick the day.');
      const code = String(req.body.shift || '').toUpperCase();
      if (!['A', 'B', 'C', 'G'].includes(code)) throw new Error('Pick the shift.');
      const people = await relieversOf(zcql, branch);
      let relId = req.body.reliever_id ? String(requireRowId(req.body.reliever_id)) : '';
      if (relId && !people.some(p => String(p.ROWID) === relId)) throw new Error('Reliever not found.');
      if (!relId) {
        const name = String(req.body.name || '').replace(/[^A-Za-z .]/g, '').trim().slice(0, 60);
        if (name.length < 2) throw new Error('Reliever name, please.');
        const phone = phoneOf(req.body.phone);
        const same = people.find(p => String(p.phone) === phone);
        if (same) relId = String(same.ROWID);
        else relId = String((await catalystApp.datastore().table('Relievers').insertRow({ branch_id: branch, name: name.toUpperCase(), phone, visits: 0, created_by: req.user.name })).ROWID);
      }
      const by = 'Office · ' + req.user.name;
      const table = catalystApp.datastore().table('ReliefShifts');
      const row = activeRow(await reliefRows(zcql, branch, [day]), code);
      if (row && row.in_at) throw new Error('The reliever of shift ' + code + ' is already IN.');
      if (row) await table.updateRow({ ROWID: row.ROWID, reliever_id: relId, added_by: by });
      else await table.insertRow({ branch_id: branch, duty_date: day, shift_code: code, reliever_id: relId, added_by: by });
      const who = (await relieversOf(zcql, branch)).find(p => String(p.ROWID) === relId);
      ok(res, { name: who ? who.name : '', code, day });
    } catch (err) {
      fail(res, err);
    }
  });

  // Wait pass (Prem, 29 Oct): once the guard on duty has added the reliever, pressing 🏁 OUT again while the reliever
  // is not IN shows the lock straight away, with no photo: only looking, nothing is saved. The OUT itself still
  // needs the face. Kept on that phone, valid 16 hours.
  const waitPass = (catalystApp, guardId, branchId) => makeTicket(catalystApp, { w: 1, g: String(guardId), b: String(branchId), x: 16 * 3600000 });
  app.post('/qrWait', async (req, res) => {
    try {
      const catalystApp = admin(req);
      const zcql = catalystApp.zcql();
      const b = await branchByKey(zcql, req.body.k);
      const t = await readTicket(catalystApp, req.body.pass);
      if (!t.w || t.b !== String(b.ROWID)) throw new Error('Scan again.');
      const g = (await zcql.executeZCQLQuery(`SELECT ROWID, guard_name, id_number FROM Guards WHERE ROWID = ${requireRowId(t.g)}`))[0].Guards;
      const open = await openIn(zcql, g.ROWID);
      if (!open) return ok(res, { locked: false, out: true, name: g.guard_name }); // already OUT (e.g. the office allowed it)
      const hand = await handover(zcql, b.ROWID, g.ROWID, open);
      // Unlocked, or the reliever was cancelled: the normal photo check.
      if (hand.ok || !hand.reliever) return ok(res, { locked: false });
      ok(res, { locked: true, guard: { name: g.guard_name, id: g.id_number }, since: String(open.CREATEDTIME).slice(11, 16), handover: hand });
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
      // Reliever profiles show in the relievers list below, not twice.
      const guards = (await zcql.executeZCQLQuery(`SELECT ROWID, guard_name, id_number, tags FROM Guards WHERE branch_id = ${branch} AND is_active = 'true'${auth.agencyWhere(req)}`)).map(r => r.Guards)
        .filter(g => !String(g.tags || '').split(',').includes('Reliever'));
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
        // Waiting: his registered face (if he came before), so the office sees who should come.
        const hand = r.in_at && p.guard_id ? await handover(zcql, branch, p.guard_id, { duty_date: r.duty_date }, r.shift_code) : null;
        relievers.push({ rs: String(r.ROWID), name: p.name || '?', phone: masked(p.phone), shift: r.shift_code, day: r.duty_date, in: r.in_at ? String(r.in_at).slice(11, 16) : '', addedBy: r.added_by || '', selfie: await signed(bucket, sel || p.photo_key), registered: !!p.photo_key, next: hand ? hand.code : '', nextOk: hand ? hand.ok : true });
      }
      const swaps = (await swapsOf(catalystApp, branch)).filter(x => x.status === 'pending' && x.day === today)
        .map(x => ({ id: x.id, name: x.name, idNo: x.idNo, from: x.from, to: x.to, at: x.at }));
      ok(res, { gate: true, on, relievers, swaps });
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
          // 🏁 10 min after the end: still IN → the guard and the office hear it (Prem, 2 Nov). Not when the
          // next shift is not IN yet: then he must stay (the OUT lock), and the start alert already told the office.
          const sinceEnd = sh.end ? (nowMin - hm(sh.end) + 1440) % 1440 : 9999;
          if (sinceEnd >= 10 && sinceEnd <= 15) {
            const stay = [];
            for (const g of (await zcql.executeZCQLQuery(`SELECT ROWID, guard_name, tags FROM Guards WHERE branch_id = ${b.ROWID} AND is_active = 'true'`)).map(r => r.Guards)) {
              const open = await openIn(zcql, g.ROWID);
              if (!open) continue;
              const rel = String(g.tags || '').split(',').includes('Reliever');
              const relRow = rel ? (await reliefRows(zcql, b.ROWID, [open.duty_date, plusDay(open.duty_date, -1)])).find(r => r.in_at && !r.out_at && r.shift_code === sh.code) : null;
              const code = rel ? (relRow ? sh.code : '') : await shiftNow(zcql, b.ROWID, g.ROWID, open);
              if (code !== sh.code) continue;
              const hand = await handover(zcql, b.ROWID, g.ROWID, open, code);
              if (!hand.ok) continue;
              stay.push(g.guard_name);
              try { await sendPushToGuard(catalystApp, g.ROWID, { title: '🏁 Shift ' + sh.code + ' முடிந்தது', body: 'Shift ' + sh.code + ' ' + taWhen(hm(sh.end)) + 'க்கு முடிந்தது. இன்னும் OUT செய்யவில்லை. Gate QR-ல் OUT செய்யவும்.', url: '/' }); } catch (err) { console.error('OUT push failed:', err.message || err); }
            }
            if (stay.length) {
              await tellOffice(catalystApp, b.ROWID, '🏁 ' + b.branch_name + ' Shift ' + sh.code + ': not OUT', 'Ended ' + sh.end + '. Still IN: ' + stay.join(', ') + '.');
              told.push(b.branch_name + ' ' + sh.code + ' OUT');
            }
            continue;
          }
          if (since > 5) continue; // the start alert: the cron runs at the shift start (Prem, 2 Nov)
          const guards = (await zcql.executeZCQLQuery(`SELECT ROWID, guard_name FROM Guards WHERE branch_id = ${b.ROWID} AND is_active = 'true'`)).map(r => r.Guards);
          const expected = [], missing = [];
          let inNow = false;
          for (const g of guards) {
            if ((await dutyCode(zcql, g.ROWID, day)) !== sh.code) continue; // the day sheet (a swap) first, else the roster
            expected.push(g.guard_name);
            if ((await zcql.executeZCQLQuery(`SELECT ROWID FROM AccessLog WHERE guard_id = ${g.ROWID} AND duty_date = '${day}' AND direction = 'IN' LIMIT 1`)).length) inNow = true;
            else missing.push(g);
          }
          // The guard who has not come hears it too (Prem, 2 Nov), in Tamil.
          for (const g of missing) {
            try { await sendPushToGuard(catalystApp, g.ROWID, { title: '⏰ Shift ' + sh.code + ' தொடங்கிவிட்டது', body: 'Shift ' + sh.code + ' ' + taWhen(hm(sh.start)) + 'க்கு தொடங்கியது. நீங்கள் இன்னும் IN செய்யவில்லை. உடனே gate QR-ல் IN செய்யவும்.', url: '/' }); } catch (err) { console.error('Late push failed:', err.message || err); }
          }
          const relRows = (await reliefRows(zcql, b.ROWID, [day])).filter(r => r.shift_code === sh.code);
          if (relRows.some(r => r.in_at)) inNow = true;
          const rel = activeRow(relRows, sh.code);
          if ((inNow && !missing.length) || (!expected.length && !rel)) continue; // all IN, or nobody is planned (e.g. G on Sunday)
          const relName = rel ? ((await relieversOf(zcql, b.ROWID)).find(p => String(p.ROWID) === String(rel.reliever_id)) || {}).name : '';
          await tellOffice(catalystApp, b.ROWID, '🚨 ' + b.branch_name + ' Shift ' + sh.code + ': ' + (inNow ? 'not all IN' : 'nobody IN'), 'Started ' + sh.start + '. Not IN: ' + [...missing.map(g => g.guard_name), rel && !rel.in_at && relName ? 'reliever ' + relName : ''].filter(Boolean).join(', ') + '.');
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
      const people = await relieversOf(zcql, branch);
      // 📋 Copy link (Prem, 6 Nov): the reliever's duty page link (his guard profile, made at the first IN).
      const gids = people.map(p => p.guard_id).filter(Boolean).map(requireRowId);
      const tokens = {};
      if (gids.length) (await zcql.executeZCQLQuery(`SELECT ROWID, guard_token FROM Guards WHERE ROWID IN (${gids.join(', ')}) AND is_active = 'true'`)).forEach(r => { tokens[String(r.Guards.ROWID)] = r.Guards.guard_token || ''; });
      for (const p of people) {
        const last = (await zcql.executeZCQLQuery(`SELECT duty_date, shift_code, in_at, added_by FROM ReliefShifts WHERE reliever_id = ${p.ROWID} ORDER BY CREATEDTIME DESC LIMIT 1`)).map(r => r.ReliefShifts)[0] || {};
        list.push({ id: String(p.ROWID), name: p.name, phone: p.phone, visits: Number(p.visits) || 0, photo: await signed(bucket, p.photo_key), last: last.duty_date ? last.duty_date + ' · ' + last.shift_code + (last.in_at ? '' : ' (did not come)') : '', addedBy: last.added_by || '', token: tokens[String(p.guard_id)] || '' });
      }
      ok(res, list.sort((a, b) => b.visits - a.visits || a.name.localeCompare(b.name)));
    } catch (err) {
      fail(res, err);
    }
  });

  // Office clean-up (Prem, 29 Oct: "she left, remove her fully"). Cancel: one waiting (not IN) relief of a shift.
  // Remove: the reliever, all their relief rows and every photo of them.
  async function reliefBranchCheck(req, zcql, branchId) {
    auth.need(req, 'supervisor');
    auth.requireBranch(req, requireRowId(branchId));
  }
  app.post('/qrReliefCancel', async (req, res) => {
    try {
      const catalystApp = admin(req);
      const zcql = catalystApp.zcql();
      const r = (await zcql.executeZCQLQuery(`SELECT ROWID, branch_id, in_at FROM ReliefShifts WHERE ROWID = ${requireRowId(req.body.rs)}`))[0];
      if (!r) throw new Error('Not found.');
      await reliefBranchCheck(req, zcql, r.ReliefShifts.branch_id);
      if (r.ReliefShifts.in_at) throw new Error('Already IN: they must go OUT, not be cancelled.');
      await catalystApp.datastore().table('ReliefShifts').deleteRow(r.ReliefShifts.ROWID);
      ok(res, { cancelled: true });
    } catch (err) {
      fail(res, err);
    }
  });
  app.post('/qrRelieverRemove', async (req, res) => {
    try {
      const catalystApp = admin(req);
      const zcql = catalystApp.zcql();
      const p = (await zcql.executeZCQLQuery(`SELECT ROWID, branch_id, name, photo_key, guard_id FROM Relievers WHERE ROWID = ${requireRowId(req.body.id)}`))[0];
      if (!p) throw new Error('Not found.');
      const rel = p.Relievers;
      await reliefBranchCheck(req, zcql, rel.branch_id);
      const rows = (await zcql.executeZCQLQuery(`SELECT ROWID, in_selfie, out_selfie FROM ReliefShifts WHERE reliever_id = ${rel.ROWID}`)).map(r => r.ReliefShifts);
      const bucket = catalystApp.stratus().bucket(BUCKET);
      const keys = [rel.photo_key, ...rows.flatMap(r => [r.in_selfie, r.out_selfie])].filter(Boolean);
      for (const k of [...new Set(keys)]) { try { await bucket.deleteObject(k); } catch (err) { console.error('Reliever photo not removed:', err.message || err); } }
      if (rows.length) await catalystApp.datastore().table('ReliefShifts').deleteRows(rows.map(r => r.ROWID));
      // His guard profile stays for the old swipes, switched off, without photo or link.
      if (rel.guard_id) await catalystApp.datastore().table('Guards').updateRow({ ROWID: rel.guard_id, is_active: 'false', photo_key: null, guard_token: null, relieved_reason: 'Reliever removed' });
      await catalystApp.datastore().table('Relievers').deleteRow(rel.ROWID);
      ok(res, { removed: rel.name, shifts: rows.length, photos: keys.length });
    } catch (err) {
      fail(res, err);
    }
  });

  // The office lets a guard go OUT when nobody came (Prem, 29 Oct: "office Allow OUT"); recorded with who allowed.
  // 🔄 Swap ask from the gate (after the face check): the office hears it and OKs it on Schedule → Gate now.
  app.post('/qrSwapAsk', async (req, res) => {
    try {
      const catalystApp = admin(req);
      const zcql = catalystApp.zcql();
      const b = await branchByKey(zcql, req.body.k);
      const t = await readTicket(catalystApp, req.body.ticket);
      if (t.a !== 'SWAP' || t.b !== String(b.ROWID)) throw new Error('Scan again.');
      const g = (await zcql.executeZCQLQuery(`SELECT ROWID, guard_name, id_number FROM Guards WHERE ROWID = ${requireRowId(t.g)}`))[0].Guards;
      const list = await swapsOf(catalystApp, b.ROWID);
      const at = new Date(Date.now() + 330 * 60000).toISOString().slice(11, 16);
      const same = list.filter(x => x.g === t.g && x.day === t.day && x.to === t.to);
      if (same.filter(x => x.status === 'no').length >= SWAP_MAX_ASKS) throw new Error('❌ அலுவலகம் ' + SWAP_MAX_ASKS + ' முறை ஏற்கவில்லை. அலுவலகத்தை phone-ல் தொடர்பு கொள்ளுங்கள்.');
      if (!same.some(x => x.status === 'pending')) {
        list.push({ id: crypto.randomBytes(4).toString('hex'), g: t.g, name: g.guard_name, idNo: g.id_number, from: t.from, to: t.to, day: t.day, at, t: Date.now(), status: 'pending', s: t.s, la: t.la, ln: t.ln, d: t.d });
        await saveSwaps(catalystApp, b.ROWID, list);
        await tellOffice(catalystApp, b.ROWID, '🔄 Swap request: ' + g.guard_name, (t.from ? 'Roster Shift ' + t.from : 'No shift today') + ' → wants Shift ' + t.to + ' today (' + at + '). OK it on Schedule → 📍 Gate now.');
      }
      ok(res, { asked: true, to: t.to });
    } catch (err) {
      fail(res, err);
    }
  });

  // The waiting phone asks every few seconds: OK → his duty page link (Prem, 2 Nov: open it by itself).
  app.post('/qrSwapStatus', async (req, res) => {
    try {
      const catalystApp = admin(req);
      const zcql = catalystApp.zcql();
      const b = await branchByKey(zcql, req.body.k);
      const t = await readTicket(catalystApp, req.body.ticket);
      if (t.a !== 'SWAP' || t.b !== String(b.ROWID)) throw new Error('Scan again.');
      const x = (await swapsOf(catalystApp, b.ROWID)).filter(r => r.g === t.g && r.day === t.day && r.to === t.to).pop();
      if (!x || x.status === 'pending') return ok(res, { status: 'pending' });
      if (x.status === 'no') return ok(res, { status: 'no' });
      const g = (await zcql.executeZCQLQuery(`SELECT guard_token FROM Guards WHERE ROWID = ${requireRowId(t.g)}`))[0].Guards;
      ok(res, { status: 'ok', token: g.guard_token || '', at: x.inAt || x.at });
    } catch (err) {
      fail(res, err);
    }
  });

  // Office OK / no. OK: the day sheet changes — he takes the Shift <to> slot; the guard who had it gets his old
  // slot (a real swap), else just leaves that slot. Only till 15 min after the shift start.
  app.post('/qrSwapDecide', async (req, res) => {
    try {
      auth.need(req, 'supervisor');
      const catalystApp = admin(req);
      const zcql = catalystApp.zcql();
      const branch = auth.requireBranch(req, requireRowId(req.body.branch));
      const list = await swapsOf(catalystApp, branch);
      const x = list.find(r => r.id === String(req.body.id || ''));
      if (!x || x.status !== 'pending') throw new Error('This request is gone. Refresh.');
      if (req.body.ok) {
        const sh = (await getShifts(zcql, branch)).find(s => s.code === x.to);
        if (sh && minsInto(x.day) > hm(sh.start) + SWAP_LATE_MIN) throw new Error('Too late: Shift ' + x.to + ' started at ' + sh.start + ' (OK only till 15 min after).');
        const g = (await zcql.executeZCQLQuery(`SELECT ROWID, branch_id, agency_id FROM Guards WHERE ROWID = ${requireRowId(x.g)}`))[0].Guards;
        const posts = (await zcql.executeZCQLQuery(`SELECT ROWID FROM Posts WHERE branch_id = ${branch} AND agency_id = ${requireRowId(g.agency_id)} AND post_type = 'POST' AND is_active = 'true'`)).map(r => r.Posts);
        const rows = (await zcql.executeZCQLQuery(`SELECT ROWID, post_id, shift_code, guard_id FROM Schedule WHERE branch_id = ${branch} AND sched_date = '${x.day}'`)).map(r => r.Schedule);
        const mine = rows.find(r => String(r.guard_id) === x.g && r.shift_code !== x.to);
        const theirs = rows.find(r => r.shift_code === x.to && (!mine || String(r.post_id) === String(mine.post_id)));
        if (theirs && theirs.guard_id && String(theirs.guard_id) !== x.g && (await openIn(zcql, theirs.guard_id))) throw new Error('The Shift ' + x.to + ' guard is already IN.');
        const table = catalystApp.datastore().table('Schedule');
        // Kept on the day sheet for the attendance (Prem, 2 Nov): "🔄 C → G · OK <name> 15:40".
        const okBy = ' · OK ' + String(req.user.name || '').slice(0, 30) + ' ' + new Date(Date.now() + 330 * 60000).toISOString().slice(11, 16);
        const note = (from, to) => ('🔄 ' + (from || 'off') + ' → ' + to + okBy).slice(0, 100);
        if (theirs) {
          await table.updateRow({ ROWID: theirs.ROWID, guard_id: x.g, published: true, swap_note: note(x.from, x.to) });
          if (mine) await table.updateRow({ ROWID: mine.ROWID, guard_id: theirs.guard_id || null, published: true, swap_note: theirs.guard_id ? note(x.to, mine.shift_code) : null });
          if (theirs.guard_id && String(theirs.guard_id) !== x.g) req.swapped = { gid: String(theirs.guard_id), to: mine ? mine.shift_code : 'off' };
        } else if (mine) await table.updateRow({ ROWID: mine.ROWID, shift_code: x.to, published: true, swap_note: note(x.from, x.to) });
        else if (posts.length) await table.insertRow({ branch_id: branch, sched_date: x.day, post_id: posts[0].ROWID, shift_code: x.to, guard_id: x.g, published: true, swap_note: note(x.from, x.to) });
        else throw new Error('No post for this guard.');
      }
      if (req.body.ok && !(await openIn(zcql, x.g))) {
        // IN at the time he asked at the gate, with that photo (the face and GPS were checked then).
        const guard = (await zcql.executeZCQLQuery(`SELECT ROWID, guard_name, id_number, branch_id, agency_id, escort_id, guard_token, is_active FROM Guards WHERE ROWID = ${requireRowId(x.g)}`))[0].Guards;
        await catalystApp.datastore().table('AccessLog').insertRow({
          guard_id: guard.ROWID, direction: 'IN', punch_time: x.at, duty_date: x.day, source: 'QR',
          lat: x.la, lng: x.ln, distance_m: x.d, selfie_key: x.s || null, allowed_by: String(req.user.name || '').slice(0, 100)
        });
        try {
          await onCardIn(catalystApp, guard, x.at, x.day);
          if (!guard.guard_token) await catalystApp.datastore().table('Guards').updateRow({ ROWID: guard.ROWID, guard_token: crypto.randomBytes(16).toString('hex') });
        } catch (err) { console.error('Swap IN follow-up failed:', err.message || err); }
        x.inAt = x.at;
      }
      x.status = req.body.ok ? 'ok' : 'no';
      x.by = req.user.name;
      await saveSwaps(catalystApp, branch, list);
      // Both guards hear it (Prem, 2 Nov): the one who asked, and the one whose shift moved because of it.
      const tell = async (gid, title, body) => { try { await sendPushToGuard(catalystApp, gid, { title, body, url: '/' }); } catch (err) { console.error('Swap push failed:', err.message || err); } };
      const starts = await getShifts(zcql, branch);
      const at = code => { const sh = starts.find(z => z.code === code); return sh && sh.start ? taWhen(hm(sh.start)) + 'க்கு ' : ''; };
      await tell(x.g, req.body.ok ? '✅ Shift மாற்றம் OK: Shift ' + x.to : '❌ Shift மாற்றம் இல்லை',
        req.body.ok ? 'இன்று நீங்கள் ' + at(x.to) + 'Shift ' + x.to + '-ல் பணிபுரிய வேண்டும். IN ' + x.at + ' பதிவானது.'
          : 'இன்று உங்கள் shift: ' + (x.from ? 'Shift ' + x.from : 'ரோஸ்டர்படி') + ' (மாற்றம் இல்லை).');
      if (req.body.ok && req.swapped) await tell(req.swapped.gid, '🔄 இன்று உங்கள் shift: Shift ' + req.swapped.to,
        x.name + ' உங்கள் Shift ' + x.to + '-ஐ எடுத்துக்கொண்டார் (அலுவலக அனுமதி). இன்று நீங்கள் ' + at(req.swapped.to) + 'Shift ' + req.swapped.to + '-ல் பணிபுரிய வேண்டும்.');
      ok(res, { name: x.name, to: x.to, status: x.status });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post('/qrAllowOut', async (req, res) => {
    try {
      auth.need(req, 'supervisor');
      const catalystApp = admin(req);
      const zcql = catalystApp.zcql();
      // A reliever (Prem, 2 Nov): by his ReliefShifts row; his duty closes too.
      let rs = null;
      if (req.body.rs) {
        rs = ((await zcql.executeZCQLQuery(`SELECT ROWID, reliever_id, duty_date, in_at, out_at FROM ReliefShifts WHERE ROWID = ${requireRowId(req.body.rs)}`))[0] || {}).ReliefShifts;
        if (!rs || !rs.in_at || rs.out_at) throw new Error('This reliever is not IN.');
        const p = ((await zcql.executeZCQLQuery(`SELECT guard_id FROM Relievers WHERE ROWID = ${requireRowId(rs.reliever_id)}`))[0] || {}).Relievers;
        req.body.guard_id = p && p.guard_id;
      }
      const g = (await zcql.executeZCQLQuery(`SELECT ROWID, guard_name, branch_id, agency_id, escort_id, guard_token, is_active FROM Guards WHERE ROWID = ${requireRowId(req.body.guard_id)}`))[0];
      const guard = auth.requireRow(req, g && g.Guards, 'guard');
      const open = await openIn(zcql, guard.ROWID);
      if (!open) throw new Error(guard.guard_name + ' is not IN.');
      const { time } = istNow();
      if (rs) await catalystApp.datastore().table('ReliefShifts').updateRow({ ROWID: rs.ROWID, out_at: new Date(Date.now() + 330 * 60000).toISOString().slice(0, 16).replace('T', ' ') });
      await catalystApp.datastore().table('AccessLog').insertRow({ guard_id: guard.ROWID, direction: 'OUT', punch_time: time, duty_date: rs ? rs.duty_date : open.duty_date, source: 'QR', allowed_by: req.user.name });
      try { await onPostOut(catalystApp, guard); } catch (err) { console.error('Allow OUT follow-up failed:', err.message || err); }
      ok(res, { name: guard.guard_name, time });
    } catch (err) {
      fail(res, err);
    }
  });

  // A reliever works like a guard (Prem, 29 Oct: same post page, his name on the sheet): a guard profile with the
  // Reliever tag, ID R-<phone>, made the first time. The Guards page and the month roster hide these profiles.
  async function relieverGuard(catalystApp, zcql, b, rel, photoKey) {
    const cols = 'ROWID, guard_name, id_number, branch_id, agency_id, escort_id, guard_token, is_active, photo_key';
    if (rel.guard_id) {
      const g = (await zcql.executeZCQLQuery(`SELECT ${cols} FROM Guards WHERE ROWID = ${requireRowId(rel.guard_id)}`))[0];
      if (g) {
        const upd = { ROWID: g.Guards.ROWID, is_active: 'true', ...(photoKey ? { photo_key: photoKey } : {}) };
        await catalystApp.datastore().table('Guards').updateRow(upd);
        return { ...g.Guards, ...upd };
      }
    }
    const post = (await zcql.executeZCQLQuery(`SELECT agency_id FROM Posts WHERE branch_id = ${b.ROWID} AND post_type = 'POST' AND is_active = 'true' LIMIT 1`))[0];
    const agency = post ? post.Posts.agency_id : null;
    const ag = agency ? (await zcql.executeZCQLQuery(`SELECT agency_name FROM Agencies WHERE ROWID = ${agency}`))[0] : null;
    const g = await catalystApp.datastore().table('Guards').insertRow({
      guard_name: rel.name, id_number: 'R-' + rel.phone, phone: rel.phone, branch_id: b.ROWID, agency_id: agency, agency: ag ? ag.Agencies.agency_name : null,
      tags: 'Reliever', is_active: 'true', photo_key: photoKey || rel.photo_key || null, created_by: 'QR reliever'
    });
    await catalystApp.datastore().table('Relievers').updateRow({ ROWID: rel.ROWID, guard_id: g.ROWID });
    return g;
  }
  // The reliever's slot on the day sheet: the site's post, the shift he covers (published), if it is free.
  async function reliefSlot(catalystApp, zcql, guard, r) {
    const post = (await zcql.executeZCQLQuery(`SELECT ROWID FROM Posts WHERE branch_id = ${requireRowId(guard.branch_id)} AND post_type = 'POST' AND is_active = 'true'`)).map(x => x.Posts);
    if (post.length !== 1) return;
    const taken = await zcql.executeZCQLQuery(`SELECT ROWID, guard_id FROM Schedule WHERE post_id = ${post[0].ROWID} AND sched_date = '${r.duty_date}' AND shift_code = '${r.shift_code}'`);
    if (taken.length) return;
    await catalystApp.datastore().table('Schedule').insertRow({ branch_id: guard.branch_id, sched_date: r.duty_date, post_id: post[0].ROWID, shift_code: r.shift_code, guard_id: guard.ROWID, published: true });
  }

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
        const row = (await zcql.executeZCQLQuery(`SELECT ROWID, duty_date, shift_code, in_at, out_at FROM ReliefShifts WHERE ROWID = ${requireRowId(t.rs)}`))[0];
        const r = row && row.ReliefShifts;
        if (!r || r.out_at || (t.a === 'RIN') !== !r.in_at) throw new Error('Scan again.');
        const rel = (await zcql.executeZCQLQuery(`SELECT ROWID, name, phone, visits, guard_id, photo_key FROM Relievers WHERE ROWID = ${requireRowId(t.rel)}`))[0].Relievers;
        const guard = await relieverGuard(catalystApp, zcql, b, rel, t.reg ? t.s : '');
        let token = '';
        if (t.a === 'RIN') {
          await catalystApp.datastore().table('ReliefShifts').updateRow({ ROWID: r.ROWID, in_at: now, in_selfie: t.s, in_distance_m: t.d });
          await catalystApp.datastore().table('Relievers').updateRow({ ROWID: rel.ROWID, visits: (Number(rel.visits) || 0) + 1, last_seen: now, ...(t.reg ? { photo_key: t.s } : {}) });
          // Same as a guard: the IN swipe, his slot on the day sheet, the post page.
          await catalystApp.datastore().table('AccessLog').insertRow({ guard_id: guard.ROWID, direction: 'IN', punch_time: time, duty_date: r.duty_date, source: 'QR', distance_m: t.d, selfie_key: t.s });
          await reliefSlot(catalystApp, zcql, guard, r);
          try { await onCardIn(catalystApp, guard, time, r.duty_date); } catch (err) { console.error('Reliever IN follow-up failed:', err.message || err); }
          token = guard.guard_token || crypto.randomBytes(16).toString('hex');
          if (!guard.guard_token) await catalystApp.datastore().table('Guards').updateRow({ ROWID: guard.ROWID, guard_token: token });
          if (t.reg) await tellOffice(catalystApp, b.ROWID, '🆕 New reliever registered', rel.name + ' ••••' + String(rel.phone).slice(-4) + ' · Shift ' + r.shift_code + '. Check the photo in Setup → Relievers.');
        } else {
          const hand = await handover(zcql, b.ROWID, guard.ROWID, { duty_date: r.duty_date }, r.shift_code);
          if (!hand.ok) {
            await tellOffice(catalystApp, b.ROWID, '🔒 Reliever ' + rel.name + ' wants to go OUT', 'Shift ' + hand.code + (hand.reliever ? ': reliever ' + hand.reliever.name + ' not IN' : ': nobody IN, no reliever added') + '. Allow OUT on the Schedule page if needed.');
            throw new Error('🔒 OUT locked: the Shift ' + hand.code + ' guard or reliever is not IN yet. Wait, or ask the office.');
          }
          await catalystApp.datastore().table('ReliefShifts').updateRow({ ROWID: r.ROWID, out_at: now, out_selfie: t.s });
          await catalystApp.datastore().table('AccessLog').insertRow({ guard_id: guard.ROWID, direction: 'OUT', punch_time: time, duty_date: r.duty_date, source: 'QR', distance_m: t.d, selfie_key: t.s });
          try { await onPostOut(catalystApp, guard); } catch (err) { console.error('Reliever OUT follow-up failed:', err.message || err); }
        }
        return ok(res, { action: t.a.slice(1), time, name: rel.name + ' (reliever)', token });
      }
      const g = (await zcql.executeZCQLQuery(`SELECT ROWID, guard_name, id_number, branch_id, agency_id, escort_id, guard_token, is_active FROM Guards WHERE ROWID = ${requireRowId(t.g)}`))[0];
      const guard = g && g.Guards;
      if (!guard || guard.is_active !== 'true') throw new Error('Guard not found.');
      // Pressed twice, or the state changed since the check: refuse.
      const open = await openIn(zcql, guard.ROWID);
      if ((t.a === 'IN') !== !open) throw new Error('Already ' + (open ? 'IN' : 'OUT') + '. Scan again.');
      if (t.a === 'OUT') {
        const early = outCheck(await getShifts(zcql, b.ROWID), await shiftNow(zcql, b.ROWID, guard.ROWID, open), open.duty_date);
        if (early) throw new Error(early);
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
      if (t.reg) {
        // 🆕 First time: this live photo is his registered face (Guards page shows it); the office hears it.
        await catalystApp.datastore().table('Guards').updateRow({ ROWID: guard.ROWID, photo_key: t.s });
        await tellOffice(catalystApp, b.ROWID, '🆕 New face registered', guard.guard_name + ' · ID ' + guard.id_number + '. If it is not him, remove the photo in Setup → Guards.');
      }
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
