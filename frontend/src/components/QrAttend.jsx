import { useEffect, useRef, useState } from 'react';
import { api, apiUrl } from '../api.js';

// #qr/<key>: the gate QR (Prem, 29 Oct, Cumbum). Any phone, no login: GPS near the gate → front camera
// 3 · 2 · 1 → Zia finds the registered guard → one big IN / OUT button. Server: functions/escortAPI/qr.js.

// Best GPS fix within 10 s (stops early once it is good enough).
function getFix() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('This phone has no location.'));
    let best = null;
    const done = () => { navigator.geolocation.clearWatch(id); clearTimeout(timer); best ? resolve(best) : reject(new Error('📍 No location. Turn on Location and allow it for this page.')); };
    const id = navigator.geolocation.watchPosition(p => {
      if (!best || p.coords.accuracy < best.coords.accuracy) best = p;
      if (p.coords.accuracy <= 30) done();
    }, err => { if (!best) { navigator.geolocation.clearWatch(id); clearTimeout(timer); reject(new Error(err.code === 1 ? '📍 Location is blocked. Allow location for this page.' : '📍 No location. Try again.')); } },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 });
    const timer = setTimeout(done, 10000);
  });
}

// From the gate to the duty page: it opens on the Card IN screen first, not straight in the chat (Prem, 9 Nov).
function goDuty(t) {
  try { sessionStorage.setItem('from-gate', '1'); sessionStorage.setItem('no-splash', '1'); } catch { /* private mode */ }
  window.location.replace('#guard/' + t);
}

// 🔊 Spoken steps (Prem, 6 Nov): a recorded Tamil voice (same on every phone, from the server) says
// "look straight / close / open your eyes", so the guard keeps looking at the camera.
// If the clip cannot play: the phone's own voice. No beep (Prem, 6 Nov: the voice is enough).
// Played through one AudioContext started on the IN / OUT tap (the old beep worked this way on every phone;
// a plain <audio> was blocked on some). Clips are fetched once and decoded.
let ctx = null;
const VOICE_KEYS = ['look', 'close', 'open', 'in_ok', 'out_ok', 'reg_ok', 'nomatch', 'already', 'notin', 'blink', 'notsame', 'far', 'gps', 'dark', 'front', 'locked', 'noduty', 'time', 'swap', 'regdetails', 'registered', 'dupface', 'retry'];
// Which spoken sentence fits a message on the screen (Prem, 6 Nov: everything by voice too).
function voiceOf(msg) {
  const m = String(msg || '');
  if (/already IN since|Opening your duty/i.test(m)) return 'already';
  if (/already registered as/i.test(m)) return 'dupface';
  if (/Already registered/i.test(m)) return 'registered';
  if (/not IN/i.test(m)) return 'notin';
  if (/not the same person/i.test(m)) return 'notsame';
  if (/Too dark|இருட்டா/i.test(m)) return 'dark';
  if (/close your eyes/i.test(m)) return 'blink';
  if (/from the gate/i.test(m)) return 'far';
  if (/GPS|Location/i.test(m)) return 'gps';
  if (/OUT locked/i.test(m)) return 'locked';
  if (/no duty|பணி இல்லை|not added today/i.test(m)) return 'noduty';
  if (/அனுமதி|Shift .* -க்கு/i.test(m)) return 'swap';
  if (/⏰|மணி/.test(m)) return 'time';
  if (/does not match|not a guard of this site|10 digits/i.test(m)) return 'regdetails';
  if (/face|camera|one person/i.test(m)) return 'front';
  return 'retry';
}

// Clips (mp3, small) are fetched when the page opens: the 3 camera steps first, the rest after. Each is decoded
// as soon as it arrives, so it plays at once later. Not ready yet → the phone's own voice says it (6 Nov:
// a guard on slow site data heard nothing and did not close his eyes).
const ready = {};
let loading = false;
function audioCtx() {
  try { const A = window.AudioContext || window.webkitAudioContext; if (A && !ctx) ctx = new A(); } catch { ctx = null; }
  return ctx;
}
function loadOne(qrKey, n) {
  return fetch(apiUrl('/qrVoice?k=' + encodeURIComponent(qrKey) + '&n=' + n + '&v=4'))
    .then(r => (r.ok ? r.arrayBuffer() : null))
    .then(buf => (buf && audioCtx() ? new Promise(ok => ctx.decodeAudioData(buf, ok, () => ok(null))) : null))
    .then(audio => { if (audio) ready[n] = audio; })
    .catch(() => {});
}
function loadVoice(qrKey) {
  if (loading) return;
  loading = true;
  Promise.all(VOICE_KEYS.slice(0, 3).map(n => loadOne(qrKey, n)))
    .then(() => VOICE_KEYS.slice(3).reduce((p, n) => p.then(() => loadOne(qrKey, n)), Promise.resolve()));
}
// On the IN / OUT tap: wake the sound (phones play only after a tap).
function unlockVoice() {
  try {
    if (!audioCtx()) return;
    if (ctx.state !== 'running') ctx.resume();
    const b = ctx.createBuffer(1, 1, 22050), src = ctx.createBufferSource(); src.buffer = b; src.connect(ctx.destination); src.start(0);
  } catch { /* no sound */ }
}
const SPOKEN = {
  look: 'கேமராவை நேராகப் பாருங்கள்', close: 'கண்ணை மூடுங்கள்', open: 'கண்ணைத் திறங்கள்',
  in_ok: 'வருகை பதிவு செய்யப்பட்டது', out_ok: 'வெளியேற்றம் பதிவு செய்யப்பட்டது', reg_ok: 'பதிவு முடிந்தது',
  nomatch: 'முகம் பொருந்தவில்லை', already: 'ஏற்கனவே வருகை பதிவு செய்துள்ளீர்கள்', retry: 'மீண்டும் முயற்சிக்கவும்'
};
function say(n, ta, en) {
  const audio = ready[n];
  if (audio && ctx) {
    try { if (ctx.state !== 'running') ctx.resume(); const src = ctx.createBufferSource(); src.buffer = audio; src.connect(ctx.destination); src.start(0); return; }
    catch { /* phone voice below */ }
  }
  const t = ta || SPOKEN[n];
  if (t) speak(t, en || '');
}
function speak(ta, en) {
  try {
    const s = window.speechSynthesis;
    if (!s) return;
    s.cancel();
    const voices = s.getVoices();
    const tamil = voices.find(v => /^ta/i.test(v.lang));
    const u = new SpeechSynthesisUtterance(tamil ? ta : en);
    if (tamil) u.voice = tamil;
    u.lang = tamil ? tamil.lang : 'en-IN';
    u.rate = 0.95;
    s.speak(u);
  } catch { /* no voice */ }
}

// Average brightness of the middle of a photo, 0 (black) – 255 (white). Too dark → Zia cannot see the eyes (29 Oct).
function lightOf(c) {
  const w = c.width, h = c.height, d = c.getContext('2d').getImageData(Math.round(w * 0.25), Math.round(h * 0.2), Math.round(w * 0.5), Math.round(h * 0.6)).data;
  let sum = 0, n = 0;
  for (let i = 0; i < d.length; i += 16) { sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; n++; }
  return n ? Math.round(sum / n) : 0;
}
const TOO_DARK = 60; // first guess; the server log shows "light" to tune it

export default function QrAttend({ qrKey }) {
  const [site, setSite] = useState(null);
  const [step, setStep] = useState('start'); // start · gps · camera · checking · found · nomatch · done
  const [count, setCount] = useState(3);
  const [hint, setHint] = useState('');
  const [msg, setMsg] = useState('');
  const [check, setCheck] = useState(null);
  const [done, setDone] = useState(null);
  const video = useRef(null);
  const stream = useRef(null);
  const fix = useRef(null);
  const resetTimer = useRef(null);
  // The steps show the first time on this phone, later behind ❓ Help.
  const [firstTime, setFirstTime] = useState(() => { try { return !localStorage.getItem('qr-help-seen'); } catch { return true; } });
  const [help, setHelp] = useState(false);
  const seenHelp = () => { try { localStorage.setItem('qr-help-seen', '1'); } catch { /* private mode */ } setFirstTime(false); setHelp(false); };
  const last = useRef(null); // the last photos, sent again with a reliever's phone number
  const [purpose, setPurpose] = useState(''); // IN · OUT · REG (Prem, 29 Oct: say why you scan)
  const [reg, setReg] = useState({ type: 'regular', id: '', name: '', phone4: '', phone: '' });
  const [relForm, setRelForm] = useState(null); // { pick, name, phone } — the duty guard adds a reliever
  const [relMsg, setRelMsg] = useState('');
  const [relOnly, setRelOnly] = useState(false); // 🔁 Add reliever from the front page: face check, then only the reliever form
  // Wait pass (29 Oct): reliever added but not IN → 🏁 OUT shows the lock with no photo. Kept on this phone.
  const passKey = 'qr-wait-' + qrKey;
  const savePass = p => { try { p ? localStorage.setItem(passKey, p) : localStorage.removeItem(passKey); } catch { /* private mode */ } };
  // 📋 My duty page (Prem, 6 Nov): after an IN this phone keeps the duty link for 18 h, so a guard who comes
  // back to this page (pressed IN again) opens the chat from here; OUT forgets it.
  useEffect(() => { loadVoice(qrKey); }, [qrKey]);
  // 🔊 Results by voice too: the message, no face match, IN / OUT done, OUT locked.
  useEffect(() => { if (msg && /^🚫 இந்த முகம்/.test(msg)) return; if (msg && !/Opening your duty page/.test(msg)) say(voiceOf(msg)); else if (msg) say('already'); }, [msg]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (step === 'nomatch') say('nomatch');
    if (step === 'done' && done) say(check && check.action === 'OUT' ? 'out_ok' : check && check.registering ? 'reg_ok' : 'in_ok');
    if (step === 'found' && check && check.swap) say('swap');
    if (step === 'found' && check && !check.swap && !relOnly && check.handover && !check.handover.ok) say('locked');
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps
  const saveDuty = t => { try { t ? localStorage.setItem('qr-duty', JSON.stringify({ t, until: Date.now() + 18 * 3600000 })) : localStorage.removeItem('qr-duty'); } catch { /* private mode */ } };
  // Also the guard link this phone opened before (main.jsx keeps it), e.g. an IN made before this button came (Prem, 6 Nov).
  const dutyLink = (() => { try { const v = JSON.parse(localStorage.getItem('qr-duty') || 'null'); return v && v.until > Date.now() ? v.t : (localStorage.getItem('guard_token') || ''); } catch { return ''; } })();
  const readPass = () => { try { return localStorage.getItem(passKey) || ''; } catch { return ''; } };

  useEffect(() => { api.qrSite(qrKey).then(r => setSite(r.data)).catch(err => setMsg(err.message)); }, [qrKey]);
  const stopCam = () => { if (stream.current) stream.current.getTracks().forEach(t => t.stop()); stream.current = null; };
  useEffect(() => stopCam, []);

  // Start → location → camera → 3 · 2 · 1 → photo → server face check.
  async function start(p, reg) {
    setMsg(''); setCheck(null); setPurpose(p);
    try { window.speechSynthesis && window.speechSynthesis.getVoices(); } catch { /* no voice */ }
    loadVoice(qrKey); unlockVoice();
    try {
      setStep('gps');
      fix.current = await getFix();
      const ch = (await api.qrChallenge(qrKey)).data; // a fresh signed start for this check
      setCount(3);
      setHint('Look straight · நேராகப் பாருங்கள்');
      say('look', 'கேமராவை நேராகப் பாருங்கள்', 'Look straight at the camera');
      setStep('camera');
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 } }, audio: false });
      video.current.srcObject = stream.current;
      await video.current.play();
      const snap = () => {
        const v = video.current, k = Math.min(1, 600 / Math.max(v.videoWidth, v.videoHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k);
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
        return c;
      };
      for (let n = 3; n > 0; n--) { setCount(n); await new Promise(r => setTimeout(r, 1000)); }
      const c = snap();
      const light = lightOf(c);
      if (light < TOO_DARK) { stopCam(); setMsg('💡 இருட்டாக உள்ளது. வெளிச்சத்தில் நின்று மீண்டும் முயற்சிக்கவும்.\n(Too dark. Stand under a light and try again.)'); setStep(p === 'REG' ? 'reg' : 'start'); return; }
      // Live check (29 Oct): close the eyes for the second photo; a photo or a screen cannot.
      setHint('😌 Close your eyes · கண்ணை மூடுங்கள்');
      setCount('😌');
      try { navigator.vibrate && navigator.vibrate(200); } catch { /* no buzz */ } // voice only, no beep (Prem, 6 Nov)
      say('close', 'கண்ணை மூடுங்கள்', 'Close your eyes');
      const shut = [];
      for (const ms of [1400, 600, 600]) { await new Promise(r => setTimeout(r, ms)); shut.push(snap()); }
      try { navigator.vibrate && navigator.vibrate(200); } catch { /* no buzz */ }
      setHint('✅ Open your eyes · கண்ணைத் திறங்கள்');
      say('open', 'கண்ணைத் திறங்கள்', 'Open your eyes');
      setCount('👀');
      await new Promise(r => setTimeout(r, 500));
      stopCam();
      setStep('checking');
      last.current = { k: qrKey, lat: fix.current.coords.latitude, lng: fix.current.coords.longitude, acc: fix.current.coords.accuracy, photo: c.toDataURL('image/jpeg', 0.85), photo2: shut[0].toDataURL('image/jpeg', 0.75), photo3: shut[1].toDataURL('image/jpeg', 0.75), photo4: shut[2].toDataURL('image/jpeg', 0.75), c: ch.c, w: c.width, light };
      const r = (await api.qrCheck({ ...last.current, purpose: p, ...(reg || {}) })).data;
      // Same face already registered for someone (Prem, 9 Nov): say who, in Tamil first, and speak it with the name.
      if (r.dup) {
        stopCam();
        setMsg('🚫 இந்த முகம் ஏற்கனவே ' + r.name + ' பெயரில் பதிவு செய்யப்பட்டுள்ளது. ஒருவருக்கு ஒரு பதிவு மட்டுமே. அலுவலகத்தைக் கேளுங்கள்.\n(This face is already registered as ' + r.name + '. One person, one registration. Ask the office.)');
        setStep('start');
        loadOne(qrKey, 'dup-' + r.gid).then(() => say('dup-' + r.gid, '', '')).then(() => { if (!ready['dup-' + r.gid]) say('dupface'); });
        return;
      }
      // Already IN (Prem, 6 Nov): the face is enough, his duty page opens (no link to send).
      if (r.already) {
        if (r.token) { saveDuty(r.token); setMsg('✅ ' + r.name + ': ' + r.since + ' முதல் ஏற்கனவே IN. உங்கள் பணி பக்கம் திறக்கிறது…\n(Already IN since ' + r.since + '. Opening your duty page…)'); setStep('start'); setTimeout(() => goDuty(r.token), 1200); return; }
        throw new Error('✅ ' + r.name + ': ' + r.since + ' முதல் ஏற்கனவே IN. செல்ல 🏁 OUT அழுத்தவும்.\n(Already IN since ' + r.since + '. Press 🏁 OUT to go.)');
      }
      setCheck(r);
      if (r.pass) savePass(r.pass);
      // 🆕 Registration (Prem, 6 Nov): the face is OK → register + IN at once (no second "Register & IN" tap,
      // guards missed it and then got "Face not matched").
      if (r.matched && r.registering && !r.swap && !r.early) { setStep('checking'); await punch(r); return; }
      setStep(r.matched ? 'found' : 'nomatch');
    } catch (err) {
      stopCam();
      setMsg(err.name === 'NotAllowedError' ? '📷 கேமரா அனுமதி இல்லை. இந்த பக்கத்துக்கு கேமராவை அனுமதிக்கவும்.\n(Camera is blocked. Allow the camera for this page.)' : err.message);
      setStep('start');
    }
  }

  // 🏁 OUT: with a wait pass, ask first; still locked → the lock page without the camera.
  async function pressOut() {
    unlockVoice();
    const pass = readPass();
    if (pass) {
      setMsg(''); setStep('checking');
      try {
        const r = (await api.qrWait(qrKey, pass)).data;
        if (r.locked) { setPurpose('OUT'); setCheck({ ...r, waitOnly: true }); setStep('found'); return; }
        savePass('');
        if (r.out) { setMsg('🏁 ' + r.name + ': ஏற்கனவே OUT செய்துவிட்டீர்கள்.\n(Already OUT.)'); setStep('start'); return; }
      } catch { savePass(''); }
    }
    start('OUT');
  }

  // 🆕 Details first (Prem, 29 Oct): wrong ID / name / phone → say so here, no camera.
  const [regBusy, setRegBusy] = useState(false);
  async function regContinue() {
    if (regBusy) return;
    loadVoice(qrKey); unlockVoice();
    const body = reg.type === 'regular' ? { reg: 'regular', id: reg.id, name: reg.name, phone4: reg.phone4 } : { reg: 'reliever', name: reg.name, phone: reg.phone };
    setMsg(''); setRegBusy(true);
    try { await api.qrRegCheck({ k: qrKey, ...body }); } catch (err) { setMsg('❌ ' + err.message); setRegBusy(false); return; }
    setRegBusy(false);
    start('REG', body);
  }

  async function addReliever() {
    setRelMsg('');
    try {
      const r = (await api.qrReliever({ k: qrKey, ticket: check.ticket, ...(relForm.pick ? { reliever_id: relForm.pick } : { name: relForm.name, phone: relForm.phone }) })).data;
      setRelMsg('✅ ' + r.name + ' Shift ' + r.code + '-க்கு சேர்க்கப்பட்டார். வரும்போது இந்த QR-ஐ ஸ்கேன் செய்வார்.\n(Added for Shift ' + r.code + '. They scan this QR when they come.)');
      setCheck(c => ({ ...c, relief: { ...c.relief, added: r.name } }));
      if (r.pass) savePass(r.pass);
      setRelForm(null);
    } catch (err) { setRelMsg(err.message); }
  }

  // 🔄 Waiting for the office (Prem, 2 Nov): every 8 s; OK → he is IN already and his duty page opens.
  const swapWait = check && check.swap && check.swap.asked && !check.swap.status ? check.swap.ticket : '';
  useEffect(() => {
    if (!swapWait) return undefined;
    let stop = false;
    const id = setInterval(async () => {
      try {
        const r = (await api.qrSwapStatus({ k: qrKey, ticket: swapWait })).data;
        if (stop || r.status === 'pending') return;
        clearInterval(id);
        if (r.status === 'ok' && r.token) { saveDuty(r.token); goDuty(r.token); }
        else setCheck(c => (c && c.swap ? { ...c, swap: { ...c.swap, status: r.status } } : c));
      } catch (err) { clearInterval(id); setMsg(err.message); }
    }, 8000);
    return () => { stop = true; clearInterval(id); };
  }, [swapWait, qrKey]);

  async function punch(c = check) {
    setMsg('');
    try {
      const d = (await api.qrPunch({ k: qrKey, ticket: c.ticket })).data;
      if (c.action === 'OUT') { savePass(''); saveDuty(''); }
      else if (d.token) saveDuty(d.token);
      setDone(d);
      setStep('done');
      // After an IN the duty page opens by itself, in place of this page (Prem, 2 Nov: a reliever must not get
      // back to IN / OUT; only a new scan opens it).
      resetTimer.current = d.token
        ? setTimeout(() => goDuty(d.token), 1500)
        : setTimeout(() => { setStep('start'); setDone(null); setCheck(null); }, 30000);
    } catch (err) {
      setMsg(err.message);
      setStep('start');
    }
  }

  return (
    <div className="qr">
      <div className="qr-head"><b>{site ? site.branch : 'NightOwl'}</b><span>Attendance</span></div>
      {msg && <div className="qr-msg" style={{ whiteSpace: 'pre-line' }}>{msg}</div>}
      {site && !site.ready && <div className="qr-msg">The gate location is not set yet. Ask the office.</div>}

      {step === 'start' && site && site.ready && (help || firstTime) && (
        <div className="qr-help">
          <b>How to mark attendance · வருகை பதிவு</b>
          <ol>
            <li>Stand at the gate, Location ON · கேட்டில் நில்லுங்கள், Location ON</li>
            <li>Look straight at the camera: 3 · 2 · 1 · கேமராவை நேராகப் பாருங்கள்</li>
            <li>🔊 Listen: close your eyes when the voice says so, open when it says open · குரல் சொல்லும்போது கண்ணை மூடுங்கள், திறக்கச் சொன்னதும் திறங்கள்</li>
            <li>✅ IN / 🏁 OUT</li>
          </ol>
        </div>
      )}
      {step === 'start' && site && site.ready && (
        <div className="qr-three">
          {dutyLink && <a className="qr-big qr-reg" href={'#guard/' + dutyLink} onClick={e => { e.preventDefault(); goDuty(dutyLink); }}>📋 My duty page<small>Chat · break · பணி பக்கம்</small></a>}
          <button className="qr-big qr-in" onClick={() => { seenHelp(); setRelOnly(false); start('IN'); }}>✅ IN<small>Duty start · பணி தொடக்கம்</small></button>
          <button className="qr-big qr-out" onClick={() => { seenHelp(); setRelOnly(false); setRelForm(null); pressOut(); }}>🏁 OUT<small>Duty end · பணி முடிவு</small></button>
          <button className="qr-big qr-reg" onClick={() => { seenHelp(); setStep('reg'); }}>🆕 New Registration<small>First time here · முதல் முறை</small></button>
          <button className="qr-big qr-reg" onClick={() => { seenHelp(); unlockVoice(); setRelOnly(true); setRelMsg(''); setRelForm({ pick: '', name: '', phone: '' }); start('OUT'); }}>🔁 Add reliever<small>For the next shift · அடுத்த ஷிஃப்ட் மாற்று ஆள்</small></button>
        </div>
      )}
      {/* 🆕 First time: regular guard (ID + name + last 4 of phone) or reliever (name + phone the guard on duty added). */}
      {step === 'reg' && (
        <div className="qr-card">
          <div className="qr-name">🆕 New Registration</div>
          <div className="qr-tabs">
            <button className={reg.type === 'regular' ? 'on' : ''} onClick={() => setReg({ ...reg, type: 'regular' })}>👤 Guard of this site</button>
            <button className={reg.type === 'reliever' ? 'on' : ''} onClick={() => setReg({ ...reg, type: 'reliever' })}>🔁 Reliever</button>
          </div>
          <div className="qr-relform">
            {reg.type === 'regular' && <input value={reg.id} onChange={e => setReg({ ...reg, id: e.target.value })} inputMode="numeric" placeholder="Your ID (Clock No)" />}
            <input value={reg.name} onChange={e => setReg({ ...reg, name: e.target.value })} placeholder="Your name" />
            {reg.type === 'regular'
              ? <input value={reg.phone4} onChange={e => setReg({ ...reg, phone4: e.target.value.replace(/\D/g, '').slice(0, 4) })} inputMode="numeric" placeholder="Last 4 digits of your phone" />
              : <input value={reg.phone} onChange={e => setReg({ ...reg, phone: e.target.value })} inputMode="tel" placeholder="Your phone (10 digits)" />}
            <button disabled={reg.type === 'regular' ? !(reg.id.trim() && reg.name.trim() && reg.phone4.length === 4) : !(reg.name.trim() && reg.phone.replace(/\D/g, '').length >= 10)}
              onClick={regContinue}>{regBusy ? '🔎 Checking…' : '📷 Continue: take my photo'}</button>
          </div>
          <button className="qr-link" onClick={() => setStep('start')}>Back</button>
        </div>
      )}
      {step === 'start' && site && site.ready && !firstTime && <button className="qr-link" onClick={() => setHelp(h => !h)}>❓ Help</button>}
      {step === 'gps' && <div className="qr-wait">📍 Finding your location…</div>}
      <div className="qr-cam" style={{ display: step === 'camera' ? 'block' : 'none' }}>
        {/* White glow round the picture: the screen lights the face like a selfie flash. */}
        <video ref={video} playsInline muted />
        <div className="qr-count">{count}</div>
        <div className="qr-hint">{hint}</div>
      </div>
      {step === 'checking' && <div className="qr-wait">🔎 Checking your face…</div>}

      {/* 🔄 Another shift now (Prem, 2 Nov): ask the office; after its OK he scans again and the IN goes through. */}
      {step === 'found' && check && check.swap && (
        <div className="qr-card">
          <div className="qr-name">{check.guard.name}</div>
          <div className="qr-sub">{check.swap.why}</div>
          {check.swap.refused && !check.swap.asked && <div className="qr-sub">❌ முன்பு கேட்டதை அலுவலகம் ஏற்கவில்லை. இன்னும் ஒரு முறை மட்டும் கேட்கலாம்.</div>}
          {check.swap.asked
            ? <div className="qr-lock">{check.swap.status === 'no' ? '❌ அலுவலகம் ஏற்கவில்லை. மீண்டும் கேட்க QR-ஐ ஸ்கேன் செய்யவும் (மொத்தம் 2 முறை).' : '⏳ Shift ' + check.swap.to + '-க்கு அலுவலகத்திடம் கேட்கப்பட்டது. அனுமதி வந்ததும் உங்கள் duty page தானாக திறக்கும். இந்த page-ஐ மூட வேண்டாம்.'}</div>
            : <button className="qr-big qr-in" onClick={async () => {
                setMsg('');
                try { await api.qrSwapAsk({ k: qrKey, ticket: check.swap.ticket }); setCheck({ ...check, swap: { ...check.swap, asked: true } }); } catch (err) { setMsg(err.message); }
              }}>🔄 அலுவலகத்திடம் கேளுங்கள்: இன்று Shift {check.swap.to}<small>{check.swap.from ? 'Shift ' + check.swap.from + '-க்கு பதிலாக' : 'கூடுதல் பணி'}</small></button>}
          <button className="qr-link" onClick={() => { setStep('start'); setCheck(null); }}>Back</button>
        </div>
      )}

      {step === 'found' && check && !check.swap && (
        <div className="qr-card">
          {check.registering && <div className="qr-sub">🆕 Registering your face (first time)</div>}
          {check.waitOnly && <div className="qr-sub">⏳ Waiting for your reliever (no photo needed to check)</div>}
          <div className="qr-name">{check.guard.name}</div>
          <div className="qr-sub">ID {check.guard.id}{check.shift ? ' · Shift ' + check.shift.code + (check.shift.start ? ' ' + check.shift.start + '–' + check.shift.end : '') : ''}{check.since ? ' · IN since ' + check.since : ''}</div>
          {!check.waitOnly && <div className="qr-sub">📍 {check.distance} m from the gate</div>}
          {/* Handover (step 3): who of the next shift is IN; OUT only when someone is. */}
          {relOnly && <div className="qr-sub">🔁 Add the reliever for the next shift · அடுத்த ஷிஃப்ட் மாற்று ஆள்</div>}
          {!relOnly && check.handover && check.handover.code && (
            <div className="qr-hand">
              <div className="qr-hand-title">Next: Shift {check.handover.code}</div>
              {check.handover.regulars.map(g => <div key={g.name} className="qr-hand-row">👤 {g.name} <b>{g.in ? '✅ IN ' + g.in : '❌ not IN'}</b></div>)}
              <div className="qr-hand-row">🔁 Reliever: {check.handover.reliever ? <>{check.handover.reliever.name} {check.handover.reliever.phone} <b>{check.handover.reliever.in ? '✅ IN ' + check.handover.reliever.in : '⏳ not IN yet'}</b></> : <b>not added</b>}</div>
            </div>
          )}
          {relOnly ? null : check.early ? <div className="qr-lock">{check.early}</div>
            : check.handover && !check.handover.ok
            ? <div className="qr-lock">🔒 OUT locked: wait for the Shift {check.handover.code} guard{check.handover.reliever ? ' / ' + check.handover.reliever.name : ''}</div>
            : <button className={'qr-big ' + (check.action === 'IN' ? 'qr-in' : 'qr-out')} onClick={() => punch()}>{check.action === 'IN' ? (check.registering ? '✅ Register & IN' : '✅ IN') : '🏁 OUT'}</button>}
          {check.addedBy && <div className="qr-sub">Added by {check.addedBy}</div>}
          {relOnly && !check.relief && <div className="qr-lock" style={{ whiteSpace: 'pre-line' }}>உங்களுக்கு அடுத்த ஷிஃப்ட் இல்லை.{'\n'}(No next shift to add a reliever for.)</div>}
          {check.relief && (
            <div className="qr-rel">
              <div className="qr-sub">Shift {check.relief.code} reliever: <b>{check.relief.added || 'not added'}</b></div>
              {!relForm && <button className="qr-link" onClick={() => { setRelMsg(''); setRelForm({ pick: '', name: '', phone: '' }); }}>➕ Add reliever for Shift {check.relief.code}</button>}
              {relForm && (
                <div className="qr-relform">
                  {check.relief.list.length > 0 && (
                    <select value={relForm.pick} onChange={e => setRelForm({ ...relForm, pick: e.target.value })}>
                      <option value="">New reliever…</option>
                      {check.relief.list.map(p => <option key={p.id} value={p.id}>{p.name} {p.phone}{p.visits ? ' · came ' + p.visits + '×' : ''}</option>)}
                    </select>
                  )}
                  {!relForm.pick && <input value={relForm.name} onChange={e => setRelForm({ ...relForm, name: e.target.value })} placeholder="Reliever name" />}
                  {!relForm.pick && <input value={relForm.phone} onChange={e => setRelForm({ ...relForm, phone: e.target.value })} inputMode="tel" placeholder="Reliever phone (10 digits)" />}
                  <button onClick={addReliever} disabled={!relForm.pick && (!relForm.name.trim() || relForm.phone.replace(/\D/g, '').length < 10)}>Add</button>
                </div>
              )}
              {relMsg && <div className="qr-sub" style={{ whiteSpace: 'pre-line' }}>{relMsg}</div>}
            </div>
          )}
          {check.waitOnly && <button className="qr-link" onClick={() => start('OUT')}>📷 Check again with photo</button>}
          <button className="qr-link" onClick={() => { if (check.waitOnly) savePass(''); setRelOnly(false); setRelForm(null); setStep('start'); setCheck(null); }}>{relOnly ? 'Back' : 'Not me'}</button>
        </div>
      )}

      {step === 'nomatch' && (
        <div className="qr-card">
          <div className="qr-name">❌ Face not matched</div>
          <button className="qr-big" onClick={() => start(purpose)}>🔁 Try again<small>Good light, face the camera</small></button>
          <div className="qr-sub">First time here? Register your face once:</div>
          <button className="qr-big qr-reg" onClick={() => setStep('reg')}>🆕 New Registration</button>
          <button className="qr-link" onClick={() => setStep('start')}>Back</button>
        </div>
      )}

      {step === 'done' && done && (
        <div className="qr-card qr-ok">
          <div className="qr-name">{done.action === 'IN' ? '✅ IN' : '🏁 OUT'} {done.time}</div>
          <div className="qr-sub">{done.name}</div>
          {/* replace, not a new page (Prem, 29 Oct): ← back from the duty page must not land on IN / OUT again; only a new scan opens it. */}
          {done.token && <a className="qr-big qr-in" href={'#guard/' + done.token}
            onClick={e => { e.preventDefault(); clearTimeout(resetTimer.current); goDuty(done.token); }}>📋 Open my duty page<small>Post · take over · chat · break</small></a>}
        </div>
      )}
    </div>
  );
}
