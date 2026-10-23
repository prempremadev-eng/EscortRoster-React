import { useRef, useState } from 'react';

// Voice to text for the vehicle form, brought over from the old vehicle app (it tested well there,
// iPhone too): the phone records a short clip (MediaRecorder), our server sends it to Sarvam
// (Tamil + English mixed speech) and the text comes back. The browser's own speech recognition is
// not used: in the old app it hung on iPhone Safari and double-fired on an Android browser.
// Tap 🎤 → beep → speak → it stops by itself after a short pause (or tap again).

const MIN_RECORDING_MS = 1000; // a quicker tap is not worth sending
const AUTO_STOP_MS = 20 * 1000; // safety cap if nobody stops it
const SOUND_RMS_THRESHOLD = 0.02; // mic level that counts as speech, not background noise
const SOUND_CHECK_INTERVAL_MS = 150;
const TRAILING_SILENCE_MS = 500; // pause after speech = done

function playTone(frequency) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.frequency.value = frequency;
    gain.gain.value = 0.15;
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.12);
    oscillator.onended = () => ctx.close();
  } catch {
    // The beep is only a help; never stop the recording over it.
  }
}

// `transcribe(blob)` → the server's answer { data: { text } }; `onResult(field, text)` fills the field.
// Number fields (employee no, phone) turn spoken words into digits ("double two five" → "225").
export function useVoiceInput(transcribe, onResult, digitFields) {
  const [isSupported] = useState(() => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && typeof window.MediaRecorder !== 'undefined');
  const [activeField, setActiveField] = useState(null);
  const [busyField, setBusyField] = useState(null); // text on its way back
  const [error, setError] = useState('');
  const [lastField, setLastField] = useState(null); // the field the message / time below belongs to
  const [took, setTook] = useState(''); // "1.8 s (server 1.2 s)": shown for now, for the manager to see
  const recorderRef = useRef(null);
  const chunks = useRef([]);
  const streamRef = useRef(null);
  const startedAt = useRef(0);
  // getUserMedia is slow to answer: a very quick second tap must still stop the recording.
  const pendingStop = useRef(false);
  const autoStop = useRef(null);
  const heardSound = useRef(false);
  const analysis = useRef(null);

  const releaseStream = () => {
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  };

  function startSoundDetection(stream, recorder) {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      audioCtx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      let lastSoundAt = 0;
      const timer = setInterval(() => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v; }
        if (Math.sqrt(sum / data.length) > SOUND_RMS_THRESHOLD) {
          heardSound.current = true;
          lastSoundAt = Date.now();
          return;
        }
        if (heardSound.current && Date.now() - lastSoundAt >= TRAILING_SILENCE_MS && recorder.state !== 'inactive') recorder.stop();
      }, SOUND_CHECK_INTERVAL_MS);
      analysis.current = { audioCtx, timer };
    } catch {
      heardSound.current = true; // no level check on this phone: trust the recording
    }
  }

  function stopSoundDetection() {
    if (!analysis.current) return;
    clearInterval(analysis.current.timer);
    analysis.current.audioCtx.close().catch(() => {});
    analysis.current = null;
  }

  async function start(field) {
    if (!isSupported || activeField || busyField) return;
    setError('');
    setTook('');
    setLastField(field);
    chunks.current = [];
    pendingStop.current = false;
    heardSound.current = false;
    recorderRef.current = null;
    setActiveField(field);
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setActiveField(null);
      setError('Microphone is blocked. Allow the microphone for this site in the phone settings.');
      return;
    }
    streamRef.current = stream;
    const recorder = new MediaRecorder(stream);
    recorderRef.current = recorder;
    startSoundDetection(stream, recorder);
    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.current.push(e.data); };
    recorder.onstop = async () => {
      clearTimeout(autoStop.current);
      stopSoundDetection();
      releaseStream();
      setActiveField(null);
      playTone(440);
      if (Date.now() - startedAt.current < MIN_RECORDING_MS || !heardSound.current) {
        setError("Didn't catch that. Tap 🎤 and speak again.");
        return;
      }
      // iPhone records mp4 (m4a), Android webm: the type goes along so the server can tell.
      const blob = new Blob(chunks.current, { type: recorder.mimeType || 'audio/webm' });
      if (!blob.size) { setError("Didn't catch that. Tap 🎤 and speak again."); return; }
      setBusyField(field);
      const sent = Date.now();
      try {
        const answer = (await transcribe(blob)).data;
        const text = String(answer.text || '').trim();
        const sec = ms => (ms / 1000).toFixed(1) + ' s';
        setTook(sec(Date.now() - sent) + (answer.ms ? ' (server ' + sec(answer.ms) + ')' : ''));
        const value = digitFields && digitFields.includes(field) ? wordsToDigits(text) : text;
        if (!value) setError("Didn't catch that. Tap 🎤 and speak again.");
        else onResult(field, value);
      } catch (err) {
        setError(err.message || 'Voice did not work. Type it.');
      } finally {
        setBusyField(null);
      }
    };
    startedAt.current = Date.now();
    recorder.start();
    playTone(880);
    if (pendingStop.current) recorder.stop();
    else autoStop.current = setTimeout(() => { if (recorder.state !== 'inactive') recorder.stop(); }, AUTO_STOP_MS);
  }

  function stop() {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
    else pendingStop.current = true;
  }

  return { isSupported, activeField, busyField, lastField, error, took, start, stop };
}

const DIGIT_WORDS = { zero: '0', oh: '0', o: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9' };
const TEEN_WORDS = { ten: '10', eleven: '11', twelve: '12', thirteen: '13', fourteen: '14', fifteen: '15', sixteen: '16', seventeen: '17', eighteen: '18', nineteen: '19' };
const TENS_WORDS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

// Numbers are read out digit by digit ("double 2 5 1", "triple 9"), so the words are joined, not added.
export function wordsToDigits(transcript) {
  const tokens = transcript.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  let out = '';
  let pendingTens = null;
  const flush = () => { if (pendingTens !== null) { out += String(pendingTens); pendingTens = null; } };
  for (let i = 0; i < tokens.length; i++) {
    const word = tokens[i];
    if (/^\d+$/.test(word)) { flush(); out += word; continue; }
    if (word === 'double' || word === 'triple') {
      const next = tokens[i + 1];
      if (next && next in DIGIT_WORDS) { flush(); out += DIGIT_WORDS[next].repeat(word === 'double' ? 2 : 3); i++; }
      continue;
    }
    if (word in TENS_WORDS) { flush(); pendingTens = TENS_WORDS[word]; continue; }
    if (word in DIGIT_WORDS) {
      if (pendingTens !== null) { out += String(pendingTens + Number(DIGIT_WORDS[word])); pendingTens = null; } else out += DIGIT_WORDS[word];
      continue;
    }
    if (word in TEEN_WORDS) { flush(); out += TEEN_WORDS[word]; continue; }
    flush();
  }
  flush();
  return out;
}
