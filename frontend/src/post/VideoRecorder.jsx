import { useEffect, useRef, useState } from 'react';
import { MAX_VIDEO_SECONDS, clock, recorderType } from './media.js';

// Full-screen camera for a short video taken at the post (hold the camera button to open it).
// Small size on purpose (640 px, ~1 Mbit/s): 30 s is about 4 MB.
export default function VideoRecorder({ onSend, onClose }) {
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
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 640 } }, audio: true })
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

  function retake() {
    if (clip) URL.revokeObjectURL(clip.url);
    setClip(null);
    setSeconds(0);
    setState('ready');
  }

  return (
    <div className="pd-cam">
      {state !== 'done' && <video ref={videoRef} className="pd-cam-view" autoPlay muted playsInline />}
      {state === 'done' && clip && <video src={clip.url} className="pd-cam-view" controls playsInline />}

      <div className="pd-cam-bar">
        {state === 'error' && <div className="pd-cam-msg">{error}</div>}
        {state === 'starting' && <div className="pd-cam-msg">Starting camera...</div>}
        {(state === 'ready' || state === 'recording') && (
          <div className="pd-cam-msg">{state === 'recording' ? '● ' + clock(seconds) + ' / ' + clock(MAX_VIDEO_SECONDS) : 'Max ' + MAX_VIDEO_SECONDS + ' seconds'}</div>
        )}
        <div className="pd-cam-buttons">
          <button className="pd-cam-small" onClick={onClose}>Cancel</button>
          {state === 'ready' && <button className="pd-cam-rec" onClick={start} aria-label="Start recording"></button>}
          {state === 'recording' && <button className="pd-cam-rec pd-cam-rec-on" onClick={stop} aria-label="Stop recording"></button>}
          {state === 'done' && (
            <>
              <button className="pd-cam-small" onClick={retake}>Retake</button>
              <button className="pd-cam-send" onClick={() => onSend(clip.blob, Math.round(seconds))}>Send</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
