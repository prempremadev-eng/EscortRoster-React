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
  const [msg, setMsg] = useState('');
  const [check, setCheck] = useState(null);
  const [done, setDone] = useState(null);
  const [id, setId] = useState('');
  const video = useRef(null);
  const stream = useRef(null);
  const fix = useRef(null);

  useEffect(() => { api.qrSite(qrKey).then(r => setSite(r.data)).catch(err => setMsg(err.message)); }, [qrKey]);
  const stopCam = () => { if (stream.current) stream.current.getTracks().forEach(t => t.stop()); stream.current = null; };
  useEffect(() => stopCam, []);

  // Start → location → camera → 3 · 2 · 1 → photo → server face check.
  async function start(typedId) {
    setMsg(''); setCheck(null);
    try {
      setStep('gps');
      fix.current = await getFix();
      setStep('camera');
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 } }, audio: false });
      video.current.srcObject = stream.current;
      await video.current.play();
      for (let n = 3; n > 0; n--) { setCount(n); await new Promise(r => setTimeout(r, 1000)); }
      const v = video.current, k = Math.min(1, 600 / Math.max(v.videoWidth, v.videoHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k);
      c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
      stopCam();
      setStep('checking');
      const r = (await api.qrCheck({ k: qrKey, lat: fix.current.coords.latitude, lng: fix.current.coords.longitude, acc: fix.current.coords.accuracy, photo: c.toDataURL('image/jpeg', 0.85), id: typedId || '' })).data;
      setCheck(r);
      setStep(r.matched ? 'found' : 'nomatch');
    } catch (err) {
      stopCam();
      setMsg(err.name === 'NotAllowedError' ? '📷 Camera is blocked. Allow the camera for this page.' : err.message);
      setStep('start');
    }
  }

  async function punch() {
    setMsg('');
    try {
      setDone((await api.qrPunch({ k: qrKey, ticket: check.ticket })).data);
      setStep('done');
      setTimeout(() => { setStep('start'); setDone(null); setCheck(null); setId(''); }, 15000);
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
        <div className="qr-hint">Look at the camera</div>
      </div>
      {step === 'checking' && <div className="qr-wait">🔎 Checking your face…</div>}

      {step === 'found' && check && (
        <div className="qr-card">
          <div className="qr-name">{check.guard.name}</div>
          <div className="qr-sub">ID {check.guard.id}{check.shift ? ' · Shift ' + check.shift.code + (check.shift.start ? ' ' + check.shift.start + '–' + check.shift.end : '') : ''}{check.since ? ' · IN since ' + check.since : ''}</div>
          <div className="qr-sub">📍 {check.distance} m from the gate</div>
          <button className={'qr-big ' + (check.action === 'IN' ? 'qr-in' : 'qr-out')} onClick={punch}>{check.action === 'IN' ? '✅ IN' : '🏁 OUT'}</button>
          <button className="qr-link" onClick={() => { setStep('start'); setCheck(null); }}>Not me</button>
        </div>
      )}

      {step === 'nomatch' && (
        <div className="qr-card">
          <div className="qr-name">❌ Face not matched</div>
          <button className="qr-big" onClick={() => start('')}>🔁 Try again<small>Good light, face the camera</small></button>
          <div className="qr-sub">Or type your ID and try:</div>
          <div className="qr-id"><input value={id} onChange={e => setId(e.target.value)} inputMode="numeric" placeholder="Your ID (Clock No)" /><button onClick={() => start(id)} disabled={!id.trim()}>Go</button></div>
        </div>
      )}

      {step === 'done' && done && (
        <div className="qr-card qr-ok">
          <div className="qr-name">{done.action === 'IN' ? '✅ IN' : '🏁 OUT'} {done.time}</div>
          <div className="qr-sub">{done.name}</div>
        </div>
      )}
    </div>
  );
}
