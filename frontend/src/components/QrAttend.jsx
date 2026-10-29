import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

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

export default function QrAttend({ qrKey }) {
  const [site, setSite] = useState(null);
  const [step, setStep] = useState('start'); // start · gps · camera · checking · found · nomatch · done
  const [count, setCount] = useState(3);
  const [hint, setHint] = useState('');
  const [msg, setMsg] = useState('');
  const [check, setCheck] = useState(null);
  const [done, setDone] = useState(null);
  const [id, setId] = useState('');
  const video = useRef(null);
  const stream = useRef(null);
  const fix = useRef(null);
  const resetTimer = useRef(null);
  const last = useRef(null); // the last photos, sent again with a reliever's phone number
  const [relPhone, setRelPhone] = useState('');
  const [relForm, setRelForm] = useState(null); // { pick, name, phone } — the duty guard adds a reliever
  const [relMsg, setRelMsg] = useState('');

  useEffect(() => { api.qrSite(qrKey).then(r => setSite(r.data)).catch(err => setMsg(err.message)); }, [qrKey]);
  const stopCam = () => { if (stream.current) stream.current.getTracks().forEach(t => t.stop()); stream.current = null; };
  useEffect(() => stopCam, []);

  // Start → location → camera → 3 · 2 · 1 → photo → server face check.
  async function start(typedId) {
    setMsg(''); setCheck(null);
    try {
      setStep('gps');
      fix.current = await getFix();
      const ch = (await api.qrChallenge(qrKey)).data; // LEFT or RIGHT, picked by the server
      setStep('camera');
      setHint('Look straight at the camera · head straight');
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
      // Live check (29 Oct): now turn the head the way the server asked; a photo or a screen cannot.
      setHint(ch.dir === 'LEFT' ? 'Now turn your head ⬅ LEFT' : 'Now turn your head RIGHT ➡');
      setCount(ch.dir === 'LEFT' ? '⬅' : '➡');
      await new Promise(r => setTimeout(r, 1200));
      for (let n = 2; n > 0; n--) { setCount((ch.dir === 'LEFT' ? '⬅ ' : '') + n + (ch.dir === 'RIGHT' ? ' ➡' : '')); await new Promise(r => setTimeout(r, 800)); }
      const c2 = snap();
      stopCam();
      setStep('checking');
      last.current = { k: qrKey, lat: fix.current.coords.latitude, lng: fix.current.coords.longitude, acc: fix.current.coords.accuracy, photo: c.toDataURL('image/jpeg', 0.85), photo2: c2.toDataURL('image/jpeg', 0.8), c: ch.c, w: c.width };
      const r = (await api.qrCheck({ ...last.current, id: typedId || '' })).data;
      setCheck(r);
      setStep(r.matched ? 'found' : 'nomatch');
    } catch (err) {
      stopCam();
      setMsg(err.name === 'NotAllowedError' ? '📷 Camera is blocked. Allow the camera for this page.' : err.message);
      setStep('start');
    }
  }

  // A reliever's first time: the same photos again with his phone number (the duty guard gave it).
  async function asReliever() {
    setMsg(''); setStep('checking');
    try {
      const r = (await api.qrCheck({ ...last.current, phone: relPhone })).data;
      setCheck(r);
      setStep(r.matched ? 'found' : 'nomatch');
      if (!r.matched) setMsg('Not added as a reliever (or wrong phone). Ask the guard on duty to add you.');
    } catch (err) { setMsg(err.message); setStep('start'); }
  }
  async function addReliever() {
    setRelMsg('');
    try {
      const r = (await api.qrReliever({ k: qrKey, ticket: check.ticket, ...(relForm.pick ? { reliever_id: relForm.pick } : { name: relForm.name, phone: relForm.phone }) })).data;
      setRelMsg('✅ ' + r.name + ' added for Shift ' + r.code + '. He scans this QR when he comes.');
      setCheck(c => ({ ...c, relief: { ...c.relief, added: r.name } }));
      setRelForm(null);
    } catch (err) { setRelMsg(err.message); }
  }

  async function punch() {
    setMsg('');
    try {
      setDone((await api.qrPunch({ k: qrKey, ticket: check.ticket })).data);
      setStep('done');
      resetTimer.current = setTimeout(() => { setStep('start'); setDone(null); setCheck(null); setId(''); }, 30000);
    } catch (err) {
      setMsg(err.message);
      setStep('start');
    }
  }

  return (
    <div className="qr">
      <div className="qr-head"><b>{site ? site.branch : 'GuardDesk'}</b><span>Attendance</span></div>
      {msg && <div className="qr-msg">{msg}</div>}
      {site && !site.ready && <div className="qr-msg">The gate location is not set yet. Ask the office.</div>}

      {step === 'start' && site && site.ready && (
        <button className="qr-big" onClick={() => start('')}>🤳 Start<small>Location + face check</small></button>
      )}
      {step === 'gps' && <div className="qr-wait">📍 Finding your location…</div>}
      <div className="qr-cam" style={{ display: step === 'camera' ? 'block' : 'none' }}>
        <video ref={video} playsInline muted />
        <div className="qr-count">{count}</div>
        <div className="qr-hint">{hint}</div>
      </div>
      {step === 'checking' && <div className="qr-wait">🔎 Checking your face…</div>}

      {step === 'found' && check && (
        <div className="qr-card">
          <div className="qr-name">{check.guard.name}</div>
          <div className="qr-sub">ID {check.guard.id}{check.shift ? ' · Shift ' + check.shift.code + (check.shift.start ? ' ' + check.shift.start + '–' + check.shift.end : '') : ''}{check.since ? ' · IN since ' + check.since : ''}</div>
          <div className="qr-sub">📍 {check.distance} m from the gate</div>
          {/* Handover (step 3): who of the next shift is IN; OUT only when someone is. */}
          {check.handover && check.handover.code && (
            <div className="qr-hand">
              <div className="qr-hand-title">Next: Shift {check.handover.code}</div>
              {check.handover.regulars.map(g => <div key={g.name} className="qr-hand-row">👤 {g.name} <b>{g.in ? '✅ IN ' + g.in : '❌ not IN'}</b></div>)}
              <div className="qr-hand-row">🔁 Reliever: {check.handover.reliever ? <>{check.handover.reliever.name} {check.handover.reliever.phone} <b>{check.handover.reliever.in ? '✅ IN ' + check.handover.reliever.in : '⏳ not IN yet'}</b></> : <b>not added</b>}</div>
            </div>
          )}
          {check.handover && !check.handover.ok
            ? <div className="qr-lock">🔒 OUT locked: wait for the Shift {check.handover.code} guard{check.handover.reliever ? ' / ' + check.handover.reliever.name : ''}</div>
            : <button className={'qr-big ' + (check.action === 'IN' ? 'qr-in' : 'qr-out')} onClick={punch}>{check.action === 'IN' ? '✅ IN' : '🏁 OUT'}</button>}
          {check.addedBy && <div className="qr-sub">Added by {check.addedBy}</div>}
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
              {relMsg && <div className="qr-sub">{relMsg}</div>}
            </div>
          )}
          <button className="qr-link" onClick={() => { setStep('start'); setCheck(null); }}>Not me</button>
        </div>
      )}

      {step === 'nomatch' && (
        <div className="qr-card">
          <div className="qr-name">❌ Face not matched</div>
          <button className="qr-big" onClick={() => start('')}>🔁 Try again<small>Good light, face the camera</small></button>
          <div className="qr-sub">Reliever, first time here? Type your phone number:</div>
          <div className="qr-id"><input value={relPhone} onChange={e => setRelPhone(e.target.value)} inputMode="tel" placeholder="Your phone (10 digits)" /><button onClick={asReliever} disabled={relPhone.replace(/\D/g, '').length < 10 || !last.current}>Go</button></div>
          <div className="qr-sub">Or type your ID and try:</div>
          <div className="qr-id"><input value={id} onChange={e => setId(e.target.value)} inputMode="numeric" placeholder="Your ID (Clock No)" /><button onClick={() => start(id)} disabled={!id.trim()}>Go</button></div>
        </div>
      )}

      {step === 'done' && done && (
        <div className="qr-card qr-ok">
          <div className="qr-name">{done.action === 'IN' ? '✅ IN' : '🏁 OUT'} {done.time}</div>
          <div className="qr-sub">{done.name}</div>
          {done.token && <a className="qr-big qr-in" href={'#guard/' + done.token} onClick={() => clearTimeout(resetTimer.current)}>📋 Open my duty page<small>Post · take over · chat · break</small></a>}
        </div>
      )}
    </div>
  );
}
