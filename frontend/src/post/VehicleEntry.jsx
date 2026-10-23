import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { Icon } from './icons.jsx';
import { compressImage } from './media.js';
import PlateScanner from './PlateScanner.jsx';

// Vehicle entry at a post (Posts.vehicle_entry on), brought in from the separate vehicle app.
// Same three types and the same must-fill fields as that app; time and name are saved by the server.
// The photo (optional) is sent after the IN is saved. "Scan" opens the camera inside the app and
// reads the number plate (that picture also becomes the vehicle photo when none yet). Voice comes later.
export const TYPES = [
  { key: 'employee', label: 'Employee' },
  { key: 'visitor', label: 'Visitor' },
  { key: 'vendor', label: 'Vendor' }
];
export const BLANK = { entry_type: 'employee', vehicle_no: '', emp_no: '', name: '', phone: '', from: '', meet: '' };

// The IN form, used by the guard page and by the supervisor's "+ New entry".
export function VehicleForm({ form, setForm, photo, setPhoto, scan, busy, onSubmit, submitLabel, children }) {
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
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
    set('vehicle_no', plate);
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
        <input id="ve-no" className="ve-plate" value={form.vehicle_no} onChange={e => set('vehicle_no', e.target.value.toUpperCase())} placeholder="TN 09 AB 1234" maxLength={20} required autoComplete="off" />
        {scan && <>
          <button type="button" className="pd-btn pd-btn-outline ve-scan" onClick={() => { setScanMsg(''); setScanning(true); }}>{Icon.camera}Scan</button>
          {scanning && <PlateScanner scan={scan} onDone={scanned} onClose={() => setScanning(false)} />}
        </>}
      </div>
      {scanMsg && <div className="pd-muted pd-small">{scanMsg}</div>}
      {emp ? <>
        <label htmlFor="ve-emp">Employee number</label>
        <input id="ve-emp" value={form.emp_no} onChange={e => set('emp_no', e.target.value)} placeholder="Employee ID" maxLength={30} required autoComplete="off" />
      </> : <>
        <label htmlFor="ve-name">Name</label>
        <input id="ve-name" value={form.name} onChange={e => set('name', e.target.value)} maxLength={100} required />
        <label htmlFor="ve-phone">Phone</label>
        <input id="ve-phone" value={form.phone} onChange={e => set('phone', e.target.value)} inputMode="tel" maxLength={20} required />
        <label htmlFor="ve-from">Coming from</label>
        <input id="ve-from" value={form.from} onChange={e => set('from', e.target.value)} placeholder="Company / place" maxLength={100} required />
        <label htmlFor="ve-meet">Whom to meet{form.entry_type === 'vendor' ? ' (optional)' : ''}</label>
        <input id="ve-meet" value={form.meet} onChange={e => set('meet', e.target.value)} maxLength={100} required={form.entry_type === 'visitor'} />
      </>}
      <button className="pd-btn pd-btn-primary" type="submit" disabled={busy || preparing || scanning}>{busy ? 'Saving...' : preparing ? 'Preparing photo...' : submitLabel}</button>
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

// One line of the list: plate, type, who, IN / OUT time.
export function whoOf(e) {
  return e.type === 'employee' ? 'Emp ' + e.empNo : [e.name, e.from].filter(Boolean).join(' · ');
}

export default function VehicleEntry({ token, post, postName, onClose }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [photo, setPhoto] = useState(null);
  const [showPhoto, setShowPhoto] = useState(null);
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
  // An old error ("already IN …") goes away once the guard changes the form.
  useEffect(() => { setError(''); }, [form]);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const saved = (await api.vehicleIn(token, form, post)).data;
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

  async function out(x) {
    setBusy(true);
    setError('');
    try {
      const done = (await api.vehicleOut(token, x.id, post)).data;
      setToast(done.vehicleNo + ' OUT at ' + done.out);
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

  return (
    <div className="pd pd-page">
      <div className="pd-form-head">
        <button type="button" className="pd-icon-btn" onClick={onClose} aria-label="Back">{Icon.back}</button>
        <div>
          <div className="pd-title pd-title-sm">{(data && data.post) || postName}</div>
          <div className="pd-muted pd-small">Vehicle entry</div>
        </div>
      </div>

      {toast && <div className="pd-card ve-toast" onClick={() => setToast('')}>{Icon.check} {toast}</div>}
      {error && <div className="pd-card pd-bad">{error}</div>}

      <VehicleForm form={form} setForm={setForm} photo={photo} setPhoto={setPhoto} scan={blob => api.vehiclePlate(token, blob, post)} busy={busy} onSubmit={save} submitLabel="Save IN" />

      <input ref={laterInput} type="file" accept="image/*" capture="environment" hidden onChange={addLater} />
      <div className="pd-field-title">Inside now · {inside.length}</div>
      {!data && !error && <div className="pd-muted">Loading...</div>}
      {data && inside.length === 0 && <div className="pd-muted pd-small">No vehicle inside.</div>}
      {inside.map(x => (
        <div key={x.id} className="ve-row">
          <div className="pd-grow">
            <div className="ve-plate-text">{x.vehicleNo} <span className={'ve-tag ve-' + x.type}>{x.type}</span></div>
            <div className="pd-muted pd-small">{whoOf(x)} · IN {x.in}{x.date !== data.date ? ' (' + x.date.slice(8) + '/' + x.date.slice(5, 7) + ')' : ''}</div>
          </div>
          {x.hasPhoto
            ? <button className="pd-icon-btn" onClick={() => setShowPhoto(x)} aria-label="Show photo">{Icon.camera}</button>
            : <button className="pd-chip ve-add-photo" onClick={() => { laterFor.current = x; laterInput.current.click(); }} disabled={busy} aria-label="Add photo">+ {Icon.camera}</button>}
          <button className="pd-chip" onClick={() => out(x)} disabled={busy}>OUT</button>
        </div>
      ))}

      {gone.length > 0 && <>
        <div className="pd-field-title">Out today · {gone.length}</div>
        {gone.map(x => (
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
