import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { Icon } from './icons.jsx';
import { compressImage } from './media.js';
import PlateScanner from './PlateScanner.jsx';
import { useVoiceInput, VOICE_LANGS, savedVoiceLang, saveVoiceLang } from './voice.js';

// Vehicle entry at a post (Posts.vehicle_entry on), brought in from the separate vehicle app.
// Same three types and the same must-fill fields as that app; time and name are saved by the server.
// The photo (optional) is sent after the IN is saved. "Scan" opens the camera inside the app and
// reads the number plate (that picture also becomes the vehicle photo when none yet). 🎤 next to a
// field: speak, and the text is filled in (Sarvam, see voice.js).
export const TYPES = [
  { key: 'employee', label: 'Employee' },
  { key: 'visitor', label: 'Visitor' },
  { key: 'vendor', label: 'Vendor' }
];
export const BLANK = { entry_type: 'employee', vehicle_no: '', emp_no: '', name: '', phone: '', from: '', meet: '' };

// The IN form, used by the guard page and by the supervisor's "+ New entry".
// `inside` = vehicles inside at this post; when the number on screen is one of them the form offers
// "Mark OUT" (`onOut`) instead of a second IN (Prem, 23 Oct: scan at the gate does the OUT too).
const plateKey = v => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
// `known` = vehicles seen before at this branch: typing 3+ letters / digits of the number (the last 4
// digits usually) lists them; a tap fills the number, type and details; changing the number again
// clears what the tap filled (Prem, 23 Oct).
const SUGGEST_FROM = 3;
const DETAIL_KEYS = ['emp_no', 'name', 'phone', 'from', 'meet'];
export function VehicleForm({ form, setForm, photo, setPhoto, scan, voice, known, inside, onOut, busy, onSubmit, submitLabel, children }) {
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const [filledFrom, setFilledFrom] = useState(null); // number of the vehicle picked from the list
  const typed = plateKey(form.vehicle_no);
  const suggestions = !filledFrom && typed.length >= SUGGEST_FROM
    ? (known || []).filter(k => plateKey(k.vehicleNo).includes(typed)).slice(0, 6)
    : [];
  // (Not named `pick`: the photo picker below has that name and silently replaced this one, 23 Oct.)
  function pickKnown(k) {
    setFilledFrom(k.vehicleNo);
    setForm(f => ({ ...f, entry_type: k.type, vehicle_no: k.vehicleNo, emp_no: k.empNo, name: k.name, phone: k.phone, from: k.from, meet: k.meet }));
  }
  // The number changed after a pick: the picked vehicle's details go (they belong to that vehicle).
  useEffect(() => {
    if (filledFrom && plateKey(form.vehicle_no) !== plateKey(filledFrom)) {
      setFilledFrom(null);
      setForm(f => { const c = { ...f }; DETAIL_KEYS.forEach(k => { c[k] = ''; }); return c; });
    }
  }, [form.vehicle_no, filledFrom, setForm]);
  // The language the guard speaks in (this phone remembers it).
  const [lang, setLang] = useState(savedVoiceLang);
  const mic = useVoiceInput(voice ? blob => voice(blob, lang) : () => Promise.reject(new Error('No voice here.')), (k, v) => set(k, v), ['emp_no', 'phone']);
  // An input with a 🎤 button on its right (only when this phone can record); what the mic is doing
  // shows right under that input (listening / writing / error / time).
  const micLine = k => (mic.activeField === k ? <div className="pd-small ve-listen">🎤 Listening… speak now (it stops after a pause)</div>
    : mic.busyField === k ? <div className="pd-muted pd-small">Writing what you said…</div>
    : mic.lastField === k && mic.error ? <div className="pd-small ve-mic-err">{mic.error}</div>
    : mic.lastField === k && mic.took ? <div className="pd-muted pd-small">🎤 Done · {mic.took}</div> : null);
  const field = (k, input) => (!voice || !mic.isSupported ? input : <>
    <div className="ve-no-row">
      {input}
      <button type="button" className={'pd-btn pd-btn-outline ve-mic' + (mic.activeField === k ? ' on' : '')}
        onClick={() => (mic.activeField === k ? mic.stop() : mic.start(k))} disabled={!!mic.busyField || (!!mic.activeField && mic.activeField !== k)}
        aria-label={mic.activeField === k ? 'Stop' : 'Speak'}>
        {mic.busyField === k ? '…' : mic.activeField === k ? '■' : Icon.mic}
      </button>
    </div>
    {micLine(k)}
  </>);
  const already = form.vehicle_no && (inside || []).find(x => plateKey(x.vehicleNo) === plateKey(form.vehicle_no));
  const emp = form.entry_type === 'employee';
  const camera = useRef(null);
  const [scanning, setScanning] = useState(false); // the in-app camera is open
  const [scanMsg, setScanMsg] = useState('');
  // The "Read: …" line belongs to the number on screen; it goes when the form is cleared after Save.
  useEffect(() => { if (!form.vehicle_no) setScanMsg(''); }, [form.vehicle_no]);
  const [preview, setPreview] = useState('');
  const [photoError, setPhotoError] = useState('');
  // Making the photo small takes a second or two; Save waits for it (a Save before it saved the IN without the photo).
  const [preparing, setPreparing] = useState(false);
  useEffect(() => {
    if (!photo) { setPreview(''); return undefined; }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  function scanned({ plate, blob, took, server }) {
    setScanning(false);
    if (!photo) setPhoto(blob);
    set('vehicle_no', formatPlate(plate, true));
    // Seconds shown for now, to see the time (all / at the server).
    const sec = ms => (ms / 1000).toFixed(1) + ' s';
    setScanMsg('Read: ' + plate + ' · check it with the vehicle · ' + sec(took) + (server ? ' (server ' + sec(server) + ')' : ''));
  }

  // Phone photos are 3–8 MB; a 1280 px JPEG (~200 KB) is enough to read the plate.
  async function pick(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setPhotoError('');
    setPreparing(true);
    try {
      setPhoto(await compressImage(file));
    } catch (err) {
      setPhotoError(err.message);
    } finally {
      setPreparing(false);
    }
  }
  return (
    <form className="pd-form ve-form" onSubmit={onSubmit}>
      <div className="ve-types" role="tablist">
        {TYPES.map(t => (
          <button key={t.key} type="button" role="tab" aria-selected={form.entry_type === t.key}
            className={'ve-type' + (form.entry_type === t.key ? ' on' : '')} onClick={() => set('entry_type', t.key)}>{t.label}</button>
        ))}
      </div>
      {children}
      {voice && mic.isSupported && (
        <label className="ve-lang">🎤 I speak
          <select value={lang} onChange={e => { setLang(e.target.value); saveVoiceLang(e.target.value); }} aria-label="Language I speak">
            {VOICE_LANGS.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          </select>
        </label>
      )}
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={pick} />
      {preparing ? (
        <div className="ve-photo-pick pd-muted pd-small">Preparing photo...</div>
      ) : preview ? (
        <div className="ve-photo-pick">
          <img src={preview} alt="Vehicle" />
          <div className="pd-grow pd-small pd-muted">Photo ready (saved with the IN)</div>
          <button type="button" className="pd-chip" onClick={() => camera.current.click()}>Retake</button>
          <button type="button" className="pd-link" onClick={() => setPhoto(null)} aria-label="Remove photo">✕</button>
        </div>
      ) : (
        <button type="button" className="pd-btn pd-btn-outline ve-photo-btn" onClick={() => camera.current.click()}>{Icon.camera} Vehicle photo (optional)</button>
      )}
      {photoError && <div className="pd-card pd-bad">{photoError}</div>}
      <label htmlFor="ve-no">Vehicle number</label>
      <div className="ve-no-row">
        <input id="ve-no" className="ve-plate" value={form.vehicle_no} onChange={e => set('vehicle_no', formatPlate(e.target.value))} onBlur={() => setForm(f => ({ ...f, vehicle_no: formatPlate(f.vehicle_no, true) }))} autoCapitalize="characters" placeholder="TN 09 AB 1234" maxLength={20} required autoComplete="off" />
        {scan && <>
          <button type="button" className="pd-btn pd-btn-outline ve-scan" onClick={() => { setScanMsg(''); setScanning(true); }}>{Icon.camera}Scan</button>
          {scanning && <PlateScanner scan={scan} onDone={scanned} onClose={() => setScanning(false)} />}
        </>}
      </div>
      {scanMsg && <div className="pd-muted pd-small">{scanMsg}</div>}
      {suggestions.length > 0 && (
        <div className="ve-suggest" role="listbox" aria-label="Vehicles seen before">
          <div className="pd-muted pd-small">Seen before · tap to fill</div>
          {suggestions.map(k => (
            // mousedown default off: the number box keeps the focus, so its blur cannot rewrite the number.
            <button type="button" key={k.vehicleNo} className="ve-suggest-row" onMouseDown={e => e.preventDefault()} onClick={() => pickKnown(k)}>
              <span className="ve-plate-text">{k.vehicleNo}</span>
              <span className={'ve-tag ve-' + k.type}>{k.type}</span>
              <span className="pd-grow pd-muted pd-small ve-suggest-who">{k.type === 'employee' ? 'Emp ' + k.empNo : [k.name, k.from].filter(Boolean).join(' · ')}</span>
            </button>
          ))}
        </div>
      )}
      {filledFrom && <div className="pd-muted pd-small">Filled from the last visit of {filledFrom} · check the details</div>}
      {already && onOut && (
        <div className="pd-card ve-inside">
          <div><b>{already.vehicleNo}</b> is inside since {already.in} · {whoOf(already)}</div>
          <button type="button" className="pd-btn pd-btn-primary" onClick={() => onOut(already)} disabled={busy}>Mark OUT now</button>
        </div>
      )}
      {/* Inside already: only OUT makes sense, so the IN fields and Save IN are hidden. */}
      {already && onOut ? null : <>
      {emp ? <>
        <label htmlFor="ve-emp">Employee number</label>
        {field('emp_no', <input id="ve-emp" value={form.emp_no} onChange={e => set('emp_no', e.target.value)} placeholder="Employee ID" maxLength={30} required autoComplete="off" />)}
      </> : <>
        <label htmlFor="ve-name">Name</label>
        {field('name', <input id="ve-name" value={form.name} onChange={e => set('name', e.target.value)} maxLength={100} required />)}
        <label htmlFor="ve-phone">Phone</label>
        {field('phone', <input id="ve-phone" value={form.phone} onChange={e => set('phone', e.target.value)} inputMode="tel" maxLength={20} required />)}
        <label htmlFor="ve-from">Coming from</label>
        {field('from', <input id="ve-from" value={form.from} onChange={e => set('from', e.target.value)} placeholder="Company / place" maxLength={100} required />)}
        <label htmlFor="ve-meet">Whom to meet{form.entry_type === 'vendor' ? ' (optional)' : ''}</label>
        {field('meet', <input id="ve-meet" value={form.meet} onChange={e => set('meet', e.target.value)} maxLength={100} required={form.entry_type === 'visitor'} />)}
      </>}

      <button className="pd-btn pd-btn-primary" type="submit" disabled={busy || preparing || scanning}>{busy ? 'Saving...' : preparing ? 'Preparing photo...' : submitLabel}</button>
      </>}
    </form>
  );
}

// Full-screen photo; `getUrl` asks the server for a one-hour link.
export function PhotoView({ getUrl, onClose }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    getUrl().then(r => setUrl(r.data.url)).catch(err => setError(err.message));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once per opened photo
  return (
    <div className="ve-photo-dim" onClick={onClose}>
      {url ? <img src={url} alt="Vehicle" /> : <div className="ve-photo-msg">{error || 'Loading photo...'}</div>}
      <button className="ve-photo-close" onClick={onClose} aria-label="Close">✕</button>
    </div>
  );
}

// Day of an IN, in words (no number dates for the guard, Prem 23 Oct): '' today, "Yesterday",
// else "Wed 21 Oct".
export function dayWord(date, today) {
  if (!date || date === today) return '';
  const d = new Date(today + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  if (d.toISOString().slice(0, 10) === date) return 'Yesterday';
  return new Date(date + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

// Number plate in the Indian layout "TN 12 AB 0987" (Prem, 23 Oct): capitals, a space wherever letters
// and digits meet; `full` also pads the RTO number to 2 and the last number to 4 digits.
// Bharat series ("22 BH 1234 AA") keeps its own order. Same rule on the phone and the server.
export function formatPlate(value, full) {
  const raw = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  let out = raw.replace(/([A-Z])(?=[0-9])|([0-9])(?=[A-Z])/g, '$1$2 ');
  const m = full && out.match(/^([A-Z]{2}) ([0-9]{1,2})(?: ([A-Z]{1,3}))? ([0-9]{1,4})$/);
  if (m) out = [m[1], m[2].padStart(2, '0'), m[3], m[4].padStart(4, '0')].filter(Boolean).join(' ');
  // The last number has at most 4 digits ("TN 12 AB 09875" → "TN 12 AB 0987").
  return out.replace(/([0-9]{4})[0-9]+$/, '$1');
}

// One line of the list: plate, type, who, IN / OUT time.
export function whoOf(e) {
  return e.type === 'employee' ? 'Emp ' + e.empNo : [e.name, e.from].filter(Boolean).join(' · ');
}

export default function VehicleEntry({ token, post, postName, onClose }) {
  const [data, setData] = useState(null);
  // The type tab (Employee / Visitor / Vendor) stays after a refresh: this phone remembers the last one
  // used at this post (a vendor gate mostly gets vendors, Prem 23 Oct).
  const typeKey = 've_type_' + (post || postName || '');
  const [form, setForm] = useState(() => {
    try { const t = localStorage.getItem(typeKey); return TYPES.some(x => x.key === t) ? { ...BLANK, entry_type: t } : BLANK; } catch { return BLANK; }
  });
  useEffect(() => {
    try { localStorage.setItem(typeKey, form.entry_type); } catch { /* private mode */ }
  }, [typeKey, form.entry_type]);
  const [photo, setPhoto] = useState(null);
  const [showPhoto, setShowPhoto] = useState(null);
  const [find, setFind] = useState('');
  const laterInput = useRef(null);
  const laterFor = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    try {
      setData((await api.vehicles(token, post)).data);
    } catch (err) {
      setError(err.message);
    }
  }, [token, post]);
  useEffect(() => { load(); }, [load]);
  // Vehicles seen before at this branch, for the number suggestions (one read per page open).
  const [known, setKnown] = useState([]);
  useEffect(() => { api.vehicleKnown(token, post).then(r => setKnown(r.data)).catch(() => setKnown([])); }, [token, post]);
  const remember = (f, saved) => setKnown(list => [
    { vehicleNo: saved.vehicleNo, type: f.entry_type, empNo: f.emp_no || '', name: f.name || '', phone: f.phone || '', from: f.from || '', meet: f.meet || '' },
    ...list.filter(k => plateKey(k.vehicleNo) !== plateKey(saved.vehicleNo))
  ]);
  // An old error ("already IN …") goes away once the guard changes the form.
  useEffect(() => { setError(''); }, [form]);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const saved = (await api.vehicleIn(token, form, post)).data;
      remember(form, saved);
      setForm(f => ({ ...BLANK, entry_type: f.entry_type }));
      setToast(saved.vehicleNo + ' IN at ' + saved.in);
      if (photo) {
        try {
          await api.vehiclePhoto(token, saved.id, photo, post);
        } catch (err) {
          setError('IN is saved, but the photo was not: ' + err.message);
        }
        setPhoto(null);
      }
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // From the list, or from the form when the scanned / typed number is inside (the form is cleared then).
  async function out(x, fromForm) {
    setBusy(true);
    setError('');
    try {
      const done = (await api.vehicleOut(token, x.id, post)).data;
      setToast(done.vehicleNo + ' OUT at ' + done.out);
      if (fromForm) {
        setForm(f => ({ ...BLANK, entry_type: f.entry_type }));
        setPhoto(null);
      }
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // 📷 on an entry without a photo: take it now (the IN was saved without one).
  async function addLater(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    const x = laterFor.current;
    if (!file || !x) return;
    setBusy(true);
    setError('');
    try {
      await api.vehiclePhoto(token, x.id, await compressImage(file), post);
      setToast('Photo added to ' + x.vehicleNo);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const entries = data ? data.entries : [];
  const inside = entries.filter(x => x.status === 'IN');
  const gone = entries.filter(x => x.status !== 'IN');
  // 🔍 over the lists, only on this phone (no Data Store read): number (spaces ignored), name, emp no, place.
  // Shown when the lists get long (Prem, 23 Oct); history by date stays on the supervisor's Vehicles page.
  const SEARCH_FROM = 5;
  const needle = find.trim().toUpperCase().replace(/\s+/g, '');
  const hit = x => !needle || [x.vehicleNo, x.name, x.empNo, x.from, x.meet, x.phone].some(v => String(v || '').toUpperCase().replace(/\s+/g, '').includes(needle));
  const insideShown = inside.filter(hit);
  const goneShown = gone.filter(hit);

  return (
    <div className="pd pd-page ve-page">
      <div className="pd-form-head">
        <button type="button" className="pd-icon-btn" onClick={onClose} aria-label="Back">{Icon.back}</button>
        <div>
          <div className="pd-title pd-title-sm">{(data && data.post) || postName}</div>
          <div className="pd-muted pd-small">Vehicle entry</div>
        </div>
      </div>

      {toast && <div className="pd-card ve-toast" onClick={() => setToast('')}>{Icon.check} {toast}</div>}
      {error && <div className="pd-card pd-bad">{error}</div>}

      <VehicleForm form={form} setForm={setForm} photo={photo} setPhoto={setPhoto} scan={blob => api.vehiclePlate(token, blob, post)} voice={(blob, lang) => api.vehicleVoice(token, blob, post, lang)} known={known} inside={inside} onOut={x => out(x, true)} busy={busy} onSubmit={save} submitLabel="Save IN" />

      <input ref={laterInput} type="file" accept="image/*" capture="environment" hidden onChange={addLater} />
      {entries.length > SEARCH_FROM && (
        <input type="search" className="ve-find" value={find} onChange={e => setFind(e.target.value)} placeholder="🔍 Find: number, name, emp ID" aria-label="Find a vehicle" />
      )}
      <div className="pd-field-title">Inside now · {needle ? insideShown.length + ' of ' + inside.length : inside.length}</div>
      {!data && !error && <div className="pd-muted">Loading...</div>}
      {data && inside.length === 0 && <div className="pd-muted pd-small">No vehicle inside.</div>}
      {needle && insideShown.length === 0 && inside.length > 0 && <div className="pd-muted pd-small">No vehicle inside matches "{find.trim()}".</div>}
      {insideShown.map(x => (
        <div key={x.id} className="ve-row">
          <div className="pd-grow">
            <div className="ve-plate-text">{x.vehicleNo} <span className={'ve-tag ve-' + x.type}>{x.type}</span></div>
            <div className="pd-muted pd-small">{whoOf(x)} · IN {[dayWord(x.date, data.date), x.in].filter(Boolean).join(' ')}</div>
          </div>
          {x.hasPhoto
            ? <button className="pd-icon-btn" onClick={() => setShowPhoto(x)} aria-label="Show photo">{Icon.camera}</button>
            : <button className="pd-chip ve-add-photo" onClick={() => { laterFor.current = x; laterInput.current.click(); }} disabled={busy} aria-label="Add photo">+ {Icon.camera}</button>}
          <button className="pd-chip" onClick={() => out(x)} disabled={busy}>OUT</button>
        </div>
      ))}

      {gone.length > 0 && <>
        <div className="pd-field-title">Out today · {needle ? goneShown.length + ' of ' + gone.length : gone.length}</div>
        {goneShown.map(x => (
          <div key={x.id} className="ve-row ve-row-out">
            <div className="pd-grow">
              <div className="ve-plate-text">{x.vehicleNo} <span className={'ve-tag ve-' + x.type}>{x.type}</span></div>
              <div className="pd-muted pd-small">{whoOf(x)} · IN {x.in} · OUT {x.out}</div>
            </div>
            {x.hasPhoto && <button className="pd-icon-btn" onClick={() => setShowPhoto(x)} aria-label="Show photo">{Icon.camera}</button>}
          </div>
        ))}
      </>}
      {showPhoto && <PhotoView getUrl={() => api.vehiclePhotoLink(token, showPhoto.id, post)} onClose={() => setShowPhoto(null)} />}
    </div>
  );
}
