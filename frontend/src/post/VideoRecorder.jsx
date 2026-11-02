import { useEffect, useRef, useState } from 'react';
import { MAX_VIDEO_SECONDS, clock, recorderType } from './media.js';

// Full-screen camera at the post: 📷 Photo / 🎥 Video, like WhatsApp (Prem, 2 Nov: one camera button, both inside).
// Video small on purpose (~1 Mbit/s): 30 s is about 4 MB.
export default function VideoRecorder({ onSend, onPhoto, onClose }) {
  const [mode, setMode] = useState('photo'); // photo | video
  const [shot, setShot] = useState(null); // { blob, url } of a taken photo
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recRef = useRef(null);
  const timerRef = useRef(null);
  const [state, setState] = useState('starting'); // starting | ready | recording | done | error
  const [seconds, setSeconds] = useState(0);
  const [clip, setClip] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: true })
      .then(stream => {
        if (!alive) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        setState('ready');
      })
      .catch(() => { setError('Camera is blocked. Allow camera and microphone for this site.'); setState('error'); });
    return () => {
      alive = false;
      clearInterval(timerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []);

  function start() {
    const type = recorderType('video');
    if (type === null) { setError('This phone cannot record video here.'); setState('error'); return; }
    const chunks = [];
    const rec = new MediaRecorder(streamRef.current, { ...(type ? { mimeType: type } : {}), videoBitsPerSecond: 1000000 });
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      clearInterval(timerRef.current);
      const blob = new Blob(chunks, { type: (rec.mimeType || type || 'video/webm').split(';')[0] });
      setClip({ blob, url: URL.createObjectURL(blob) });
      setState('done');
    };
    recRef.current = rec;
    rec.start(1000);
    const began = Date.now();
    setSeconds(0);
    setState('recording');
    timerRef.current = setInterval(() => {
      const s = (Date.now() - began) / 1000;
      setSeconds(s);
      if (s >= MAX_VIDEO_SECONDS) stop();
    }, 250);
  }

  function stop() {
    if (recRef.current && recRef.current.state === 'recording') recRef.current.stop();
  }

  // 📷 One frame of the live view.
  function snap() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    c.toBlob(blob => { if (blob) { setShot({ blob, url: URL.createObjectURL(blob) }); setState('done'); } }, 'image/jpeg', 0.85);
  }

  function retake() {
    if (clip) URL.revokeObjectURL(clip.url);
    if (shot) URL.revokeObjectURL(shot.url);
    setShot(null);
    setClip(null);
    setSeconds(0);
    setState('ready');
  }

  return (
    <div className="pd-cam">
      <video ref={videoRef} className="pd-cam-view" autoPlay muted playsInline hidden={state === 'done'} />
      {state === 'done' && clip && <video src={clip.url} className="pd-cam-view" controls playsInline />}
      {state === 'done' && shot && <img src={shot.url} className="pd-cam-view" alt="Photo to send" />}

      <div className="pd-cam-bar">
        {state === 'error' && <div className="pd-cam-msg">{error}</div>}
        {state === 'starting' && <div className="pd-cam-msg">Starting camera...</div>}
        {state === 'recording' && <div className="pd-cam-msg">{'● ' + clock(seconds) + ' / ' + clock(MAX_VIDEO_SECONDS)}</div>}
        {state === 'ready' && (
          <div className="pd-cam-modes">
            <button className={mode === 'photo' ? 'on' : ''} onClick={() => setMode('photo')}>Photo</button>
            <button className={mode === 'video' ? 'on' : ''} onClick={() => setMode('video')}>Video</button>
          </div>
        )}
        <div className="pd-cam-buttons">
          <button className="pd-cam-small" onClick={onClose}>Cancel</button>
          {state === 'ready' && mode === 'photo' && <button className="pd-cam-rec pd-cam-shutter" onClick={snap} aria-label="Take photo"></button>}
          {state === 'ready' && mode === 'video' && <button className="pd-cam-rec" onClick={start} aria-label="Start recording"></button>}
          {state === 'recording' && <button className="pd-cam-rec pd-cam-rec-on" onClick={stop} aria-label="Stop recording"></button>}
          {state === 'done' && (
            <>
              <button className="pd-cam-small" onClick={retake}>Retake</button>
              <button className="pd-cam-send" onClick={() => (shot ? onPhoto(shot.blob) : onSend(clip.blob, Math.round(seconds)))}>Send</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
