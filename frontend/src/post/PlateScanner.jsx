import { useEffect, useRef, useState } from 'react';

// Number plate scan with the camera inside the app (like the old vehicle app): live picture → one tap
// "Capture" → the frame is sent at once. No camera app, no "OK" step and no 12 MP photo to make small
// (that took ~15 s on a phone, 23 Oct). The frame is ~1280 px already.
// `scan(blob)` reads the plate; `onDone({ plate, blob, took })` gets the number and the frame
// (kept as the vehicle photo when none was taken yet).
const MAX_SIDE = 1280;

export default function PlateScanner({ scan, onDone, onClose }) {
  const video = useRef(null);
  const stream = useRef(null);
  const [status, setStatus] = useState('starting'); // starting | ready | reading | error
  const [msg, setMsg] = useState('');

  useEffect(() => {
    let stopped = false;
    async function start() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setStatus('error');
        setMsg('This phone browser has no camera access. Type the number.');
        return;
      }
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false
        });
        if (stopped) { s.getTracks().forEach(t => t.stop()); return; }
        stream.current = s;
        video.current.srcObject = s;
        setStatus('ready');
      } catch {
        if (!stopped) {
          setStatus('error');
          setMsg('Camera is blocked. Allow the camera for this site, or type the number.');
        }
      }
    }
    start();
    return () => {
      stopped = true;
      if (stream.current) stream.current.getTracks().forEach(t => t.stop());
    };
  }, []);

  function frame() {
    const v = video.current;
    const scale = Math.min(1, MAX_SIDE / Math.max(v.videoWidth, v.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(v.videoWidth * scale);
    canvas.height = Math.round(v.videoHeight * scale);
    canvas.getContext('2d').drawImage(v, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not take the picture.'))), 'image/jpeg', 0.8));
  }

  async function capture() {
    setStatus('reading');
    setMsg('');
    const started = Date.now();
    try {
      const blob = await frame();
      const r = (await scan(blob)).data;
      if (!r.plate) {
        setStatus('ready');
        setMsg('No number plate found. Move closer and try again, or type it.');
        return;
      }
      onDone({ plate: r.plate, blob, took: Date.now() - started, server: r.ms || 0 });
    } catch (err) {
      setStatus('ready');
      setMsg(err.message);
    }
  }

  return (
    <div className="ve-scan-dim" role="dialog" aria-modal="true">
      <div className="ve-scan-view">
        <video ref={video} autoPlay playsInline muted />
        <div className="ve-scan-frame" aria-hidden="true"></div>
      </div>
      <div className="ve-scan-bar">
        <div className="ve-scan-msg">
          {status === 'starting' ? 'Starting camera...' : status === 'reading' ? 'Reading the number...' : msg || 'Keep the number plate inside the box'}
        </div>
        <div className="ve-scan-btns">
          <button type="button" className="pd-btn pd-btn-outline ve-scan-cancel" onClick={onClose}>Cancel</button>
          <button type="button" className="pd-btn pd-btn-primary" onClick={capture} disabled={status !== 'ready'}>
            {status === 'reading' ? 'Reading...' : 'Capture'}
          </button>
        </div>
      </div>
    </div>
  );
}
