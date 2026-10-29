import SetupSteps from './SetupSteps.jsx';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { worksIn } from '../agency.js';
import { Toggle, IconBtn } from './RowControls.jsx';
import { useUser } from '../auth/user.js';

const NO_FILTERS = { state: '', city: '', branch: '', agency: '', area: '', q: '', incharge: false };
const BLANK_GUARD = { id_number: '', card_number: '', guard_name: '', agency_id: '', branch_id: '', area: '', escort_id: '', phone: '', tags: '',
  gender: '', designation: '', date_of_joining: '', date_of_birth: '', emergency_contact: '', aadhaar_no: '' };
// The agency's "All Security Details" columns (Prem, 29 Oct): the same for every branch; Export / Import use them.
const DETAIL_HEADINGS = ['Photo', 'Vendor ID', 'Name', 'Agency', 'Gender', 'Mobile NO', 'Designation', 'Clock NO', 'Date of Joining', 'Emergeny Contact', 'Status', 'Date of Birth', 'Branch', 'Aadhaar File', 'Aadhaar No', 'Relieved Date', 'Relieved Reason', 'ServiceYear'];
const day10 = v => String(v || '').slice(0, 10);
// Completed years of service (at least 1), to the relieved date or today: as in the agency's sheet.
const serviceYears = (doj, until) => { if (!doj) return ''; const y = (new Date(until || Date.now()) - new Date(doj)) / (365.25 * 86400000); return y > 0 ? Math.max(1, Math.floor(y)) : ''; };
// Excel dates: a serial number (45765) or text like 17-04-2025 / 2025-04-17 → 2025-04-17.
function excelDate(v) {
  if (v === '' || v === null || v === undefined) return '';
  if (typeof v === 'number') return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000).toISOString().slice(0, 10);
  const t = String(v).trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/); if (m) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
  return '';
}
// Ready tags in the form (Prem, 28 Oct); any other word can be added.
const TAG_PRESETS = ['Lady', 'Document', 'Driver', 'Gunman', 'Fire'];
const tagList = t => String(t || '').split(',').map(x => x.trim()).filter(Boolean);
const when = t => String(t || '').slice(0, 16);

const uniq = list => [...new Set(list)];

// "📍 Gate 3 · A", "🚐 Escort · C" or "⏳ Not assigned" (this week's Duty Chart).
export const dutyLabel = d => (d ? (d.post_type === 'ESCORT' ? '🚐 ' : '📍 ') + d.post_name + ' · ' + d.shift_code : '⏳ Not assigned');

// Guard details register: every guard of my area, filters, add / edit a guard, and switch off a
// guard who left (never deleted). Card IN / OUT lives in the supervisor screens, not here.
export default function GuardMaster() {
  const me = useUser();
  // A shift incharge's own agency: the form and the list do not offer other agencies (the server forces it too).
  const ownAgency = me && me.role === 'supervisor' && me.agency_id ? String(me.agency_id) : '';
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading');
  const [filters, setFilters] = useState(NO_FILTERS);
  const [showLeft, setShowLeft] = useState(false);
  const [form, setForm] = useState(null);
  const [confirmLeft, setConfirmLeft] = useState(false);
  const [showRel, setShowRel] = useState(false);
  const [freeEscorts, setFreeEscorts] = useState(null);
  // Photo picked in the form (sent after the guard is saved) and the saved photo's link.
  const [photoFile, setPhotoFile] = useState(null);
  const [aadhaarFile, setAadhaarFile] = useState(null);
  const [left, setLeft] = useState({ date: new Date().toISOString().slice(0, 10), reason: '' }); // relieved date + reason
  const [photoUrl, setPhotoUrl] = useState(null);
  const [thumbs, setThumbs] = useState({}); // guard ROWID → photo link for the Photo column
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  // No auto-refresh: every load costs Data Store reads. Use 🔄 instead.
  const load = useCallback(async () => {
    setStatus('loading');
    try {
      setData((await api.getMaster()).data);
      setStatus('ok');
    } catch (err) {
      console.error('Guard master load failed:', err);
      setStatus('error');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const branches = data ? data.branches : [];
  const branchById = useMemo(() => {
    const map = {};
    branches.forEach(b => { map[String(b.ROWID)] = b; });
    return map;
  }, [branches]);

  // Cascading: picking a state narrows the city list, picking a city narrows the branch list.
  const inState = branches.filter(b => !filters.state || b.state === filters.state);
  const inCity = inState.filter(b => !filters.city || b.city === filters.city);
  const allGuards = data ? data.guards : [];
  const leftCount = allGuards.filter(g => g.is_active !== 'true').length;
  // Reliever profiles (QR gate, tag Reliever) stay out of the list unless asked (Prem, 29 Oct: they come and go).
  const isRel = g => String(g.tags || '').split(',').includes('Reliever');
  const relCount = allGuards.filter(g => isRel(g) && g.is_active === 'true').length;
  const guards = (showLeft ? allGuards : allGuards.filter(g => g.is_active === 'true')).filter(g => showRel || !isRel(g));

  const q = filters.q.trim().toLowerCase();
  // Everything except the status filter, so the summary boxes count the same group.
  // ⭐ Shift incharges: the guards ticked in Admin → Agencies (they stand at Shift Incharge posts).
  const incharges = new Set((data ? data.agencies : []).flatMap(a => String(a.incharge_ids || '').split(',').map(x => x.trim()).filter(Boolean)));
  const base = guards.filter(g => {
    if (filters.incharge && !incharges.has(String(g.ROWID))) return false;
    const b = branchById[String(g.branch_id)];
    if (!b) return !filters.state && !filters.city && !filters.branch;
    return (!filters.state || b.state === filters.state)
      && (!filters.city || b.city === filters.city)
      && (!filters.branch || String(b.ROWID) === filters.branch)
      && (!filters.agency || g.agency === filters.agency)
      && (!filters.area || (g.area || '') === filters.area)
      && (!q || g.guard_name.toLowerCase().includes(q) || g.id_number.toLowerCase().includes(q) || String(g.card_number || '').toLowerCase().includes(q));
  });
  const shown = base;

  // Photo column (Prem, 29 Oct): links only for the guards on the page that have a photo and no link yet, 50 per call.
  useEffect(() => {
    const need = shown.filter(g => g.photo_key && thumbs[g.ROWID + ':' + g.photo_key] === undefined);
    if (!need.length) return;
    const keyOf = g => g.ROWID + ':' + g.photo_key;
    setThumbs(t => { const n = { ...t }; for (const g of need) n[keyOf(g)] = null; return n; }); // null = asked, waiting
    (async () => {
      for (let k = 0; k < need.length; k += 50) {
        const part = need.slice(k, k + 50);
        const got = await api.guardPhotoUrls(part.map(g => g.ROWID)).then(r => r.data).catch(() => ({}));
        setThumbs(t => { const n = { ...t }; for (const g of part) n[keyOf(g)] = got[g.ROWID] || ''; return n; });
      }
    })();
  }, [shown, thumbs]);

  function setFilter(key, value) {
    setFilters(prev => {
      const next = { ...prev, [key]: value };
      if (key === 'state') { next.city = ''; next.branch = ''; }
      if (key === 'city') next.branch = '';
      return next;
    });
  }

  const trail = ['All companies'];
  if (filters.state) trail.push(filters.state);
  if (filters.city) trail.push(filters.city);
  if (filters.branch && branchById[filters.branch]) trail.push(branchById[filters.branch].branch_name);

  // The escort list costs reads, so fetch it only when the escort box is opened.
  // `keep` = the escort of the guard being edited, so it stays in the list.
  async function loadFreeEscorts(keep) {
    if (freeEscorts) return;
    try {
      setFreeEscorts((await api.getFreeEscorts(keep)).data);
    } catch (err) {
      setError(err.message);
    }
  }

  function openForm(g) {
    setError('');
    setNote('');
    setConfirmLeft(false);
    const next = g
      ? { ...BLANK_GUARD, ...g, card_number: g.card_number || '', area: g.area || '', agency_id: g.agency_id || '', escort_id: g.escort_id || '', phone: g.phone || '', tags: g.tags || '', gender: g.gender || '', designation: g.designation || '', date_of_joining: day10(g.date_of_joining), date_of_birth: day10(g.date_of_birth), emergency_contact: g.emergency_contact || '', aadhaar_no: '', incharge: incharges.has(String(g.ROWID)) }
      : { ...BLANK_GUARD, branch_id: filters.branch || (branches.length === 1 ? String(branches[0].ROWID) : ''), agency_id: ownAgency };
    setForm(next);
    setFreeEscorts(null);
    setPhotoFile(null);
    setAadhaarFile(null);
    setPhotoUrl(null);
    // The saved photo is fetched only when a guard with a photo is opened (one read).
    if (g && g.photo_key) api.guardPhotoUrl(g.ROWID).then(r => setPhotoUrl(r.data.url)).catch(() => {});
    window.scrollTo({ top: 0 });
  }

  function setFormField(key, value) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  // Put a saved row into the list ourselves instead of reloading everything (saves reads).
  function putRow(saved) {
    setData(prev => {
      const old = prev.guards.find(x => String(x.ROWID) === String(saved.ROWID));
      return {
        ...prev,
        guards: [...prev.guards.filter(x => x !== old), { ...old, ...saved }]
          .sort((a, b) => a.id_number.localeCompare(b.id_number))
      };
    });
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const fields = ['id_number', 'card_number', 'guard_name', 'agency_id', 'branch_id', 'area', 'phone', 'escort_id', 'tags', 'gender', 'designation', 'date_of_joining', 'date_of_birth', 'emergency_contact'];
      const payload = {};
      fields.forEach(k => { payload[k] = form[k]; });
      payload.incharge = !!form.incharge;
      if (String(form.aadhaar_no || '').trim()) payload.aadhaar_no = form.aadhaar_no; // only when typed: kept encrypted
      let saved = form.ROWID
        ? (await api.updateGuard({ ROWID: form.ROWID, ...payload })).data
        : (await api.addGuard(payload)).data;
      if (photoFile) saved = { ...saved, photo_key: (await api.guardPhoto(saved.ROWID, photoFile)).data.photo_key };
      if (aadhaarFile) saved = { ...saved, aadhaar_file_key: (await api.guardAadhaarFile(saved.ROWID, aadhaarFile)).data.aadhaar_file_key };
      putRow(saved);
      // The ⭐ tick lives in the agency's incharge list; keep the copy on screen in step (no reload).
      setData(d => ({ ...d, agencies: d.agencies.map(a => {
        const ids = String(a.incharge_ids || '').split(',').map(x => x.trim()).filter(x => x && x !== String(saved.ROWID));
        if (form.incharge && String(a.ROWID) === String(saved.agency_id)) ids.push(String(saved.ROWID));
        return { ...a, incharge_ids: ids.join(',') };
      }) }));
      setPhotoFile(null);
      setNote('✅ ' + saved.guard_name + ' (' + saved.id_number + ') ' + (form.ROWID ? 'saved.' : 'added.'));
      setForm(null);
      setFreeEscorts(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // 📤 Export: the guards on the page in the agency's heading order, the real photo in the Photo column (29 Oct),
  // Aadhaar only as ••••last 4. exceljs (not xlsx) because it can put pictures in cells.
  async function exportDetails() {
    setError(''); setSaving(true);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('All_Security_Details');
      ws.addRow(DETAIL_HEADINGS).font = { bold: true };
      ws.columns = DETAIL_HEADINGS.map((h, i) => ({ width: i === 0 ? 11 : Math.max(12, h.length + 2) }));
      shown.forEach(g => {
        const b = branchById[String(g.branch_id)];
        const off = g.is_active !== 'true';
        const row = ws.addRow(['', g.card_number || '', g.guard_name, g.agency || '', g.gender || '', g.phone || '', g.designation || '', g.id_number, day10(g.date_of_joining),
          g.emergency_contact || '', off ? 'Relieved' : 'Active', day10(g.date_of_birth), b ? b.branch_name : '', g.aadhaar_file_key ? 'Yes' : '', g.aadhaar_last4 ? '••••' + g.aadhaar_last4 : '',
          day10(g.relieved_date), g.relieved_reason || '', serviceYears(g.date_of_joining, off ? g.relieved_date : '')]);
        row.alignment = { vertical: 'middle' };
        if (g.photo_key) row.height = 60;
      });
      // Photos, 5 per call, made small (80 px) so the file stays light.
      const withPhoto = shown.map((g, i) => [g, i]).filter(([g]) => g.photo_key);
      const shrink = (mime, b64) => new Promise(res => { const im = new Image(); im.onload = () => { const k = 80 / Math.max(im.width, im.height); const c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); res({ data: c.toDataURL('image/jpeg', 0.8), w: c.width, h: c.height }); }; im.onerror = () => res(null); im.src = 'data:' + mime + ';base64,' + b64; });
      for (let k = 0; k < withPhoto.length; k += 5) {
        setNote('📤 Photos ' + Math.min(k + 5, withPhoto.length) + ' / ' + withPhoto.length + '…');
        const part = withPhoto.slice(k, k + 5);
        const got = (await api.guardPhotosData(part.map(([g]) => g.ROWID))).data;
        for (const p of got) {
          const at = part.find(([g]) => String(g.ROWID) === p.id);
          const small = at && await shrink(p.mime, p.b64);
          if (!small) continue;
          const img = wb.addImage({ base64: small.data, extension: 'jpeg' });
          ws.addImage(img, { tl: { col: 0.1, row: at[1] + 1.05 }, ext: { width: small.w * 0.9, height: small.h * 0.9 } });
        }
      }
      const blob = new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'All Security Details ' + new Date().toISOString().slice(0, 10) + '.xlsx';
      a.click();
      setNote('📤 Exported ' + shown.length + ' guard(s), ' + withPhoto.length + ' with photo.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }
  // 📥 Import: an "All Security Details" Excel → guards added (new Clock NO) or updated (Clock NO already here).
  async function importDetails(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setError(''); setNote(''); setSaving(true);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer());
      const all = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
      const key = h => String(h).toLowerCase().replace(/[^a-z]/g, '');
      const hi = all.findIndex(r => r.some(c => key(c) === 'clockno'));
      if (hi < 0) throw new Error('"' + file.name + '" has no "Clock NO" heading. Use the All Security Details format.');
      const head = all[hi].map(key);
      const col = (r, ...names) => { const i = head.findIndex(h => names.includes(h)); return i < 0 ? '' : r[i]; };
      const rows = all.slice(hi + 1).filter(r => String(col(r, 'clockno')).trim()).map(r => ({
        clock: String(col(r, 'clockno')).trim(), vendor: String(col(r, 'vendorid')).trim(), name: String(col(r, 'name')).trim(), agency: col(r, 'agency'), branch: col(r, 'branch'),
        gender: String(col(r, 'gender')).trim(), mobile: String(col(r, 'mobileno', 'mobile')), designation: String(col(r, 'designation')).trim(),
        doj: excelDate(col(r, 'dateofjoining')), dob: excelDate(col(r, 'dateofbirth')), emergency: String(col(r, 'emergenycontact', 'emergencycontact')),
        status: col(r, 'status'), aadhaar: String(col(r, 'aadhaarno')).replace(/\D/g, ''), relievedDate: excelDate(col(r, 'relieveddate')), relievedReason: col(r, 'relievedreason')
      }));
      const r = (await api.guardImport(rows)).data;
      // Pictures in the Photo column become the guards' photos (29 Oct): read with exceljs, matched by the row's Clock NO.
      let photos = 0;
      try {
        const ExcelJS = (await import('exceljs')).default;
        const xb = new ExcelJS.Workbook();
        await xb.xlsx.load(await file.arrayBuffer());
        const sheet = xb.worksheets[0];
        let headRow = 0, clockCol = 0;
        sheet.eachRow((row, n) => { if (headRow) return; row.eachCell((c, ci) => { if (key(c.text) === 'clockno') { headRow = n; clockCol = ci; } }); });
        for (const im of sheet.getImages()) {
          const rowNo = Math.floor(im.range.tl.nativeRow ?? im.range.tl.row) + 1;
          if (rowNo <= headRow) continue;
          const clock = String(sheet.getRow(rowNo).getCell(clockCol).text || '').trim();
          const id = r.ids && r.ids[clock];
          const media = xb.getImage(im.imageId);
          if (!id || !media || !media.buffer) continue;
          const ext = String(media.extension || 'jpeg').replace('jpg', 'jpeg');
          await api.guardPhoto(id, new File([media.buffer], clock + '.' + ext, { type: 'image/' + ext }));
          photos++;
        }
      } catch (err) { console.error('Photos from the Excel not read:', err); }
      setNote('📥 ' + file.name + ': ' + r.added + ' added, ' + r.updated + ' updated' + (photos ? ', ' + photos + ' photo(s)' : '') + (r.skipped.length ? ' · skipped ' + r.skipped.length + ': ' + r.skipped.join(' · ') : '') + '.');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function setActive(g, active, more) {
    setSaving(true);
    setError('');
    setNote('');
    try {
      putRow((await api.setGuardActive(g.ROWID, active, more)).data);
      setNote(active ? '↩️ ' + g.guard_name + ' is active again.' : '🚫 ' + g.guard_name + ' is switched off (left). Their link and phone stop working.');
      setForm(null);
      setFreeEscorts(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
      setConfirmLeft(false);
    }
  }

  const branchLabel = b => b.branch_name + (b.area ? ' (' + b.area + ')' : '');

  return (
    <>
      <div className="titlebar">
        <h1>🛡️ Guard Master</h1>
      </div>
      <SetupSteps active="guards" />

      <div className="toolbar no-print">
        <div className="spacer"></div>
        <button className="btn secondary" onClick={() => openForm()}>➕ Add guard</button>
        <label className="btn secondary" title="All Security Details Excel: Clock NO, Name, Agency, Branch, Gender …">📥 Import Excel<input type="file" accept=".xlsx,.xls,.csv" hidden onChange={importDetails} /></label>
        <button className="btn secondary" onClick={exportDetails} disabled={!data} title="The guards shown, in the All Security Details headings">📤 Export Excel</button>
        <button className="btn" onClick={load}>🔄 Refresh</button>
      </div>

      <div className="dash">
        {error && <div className="trip-error">{error}</div>}
        {note && <div className="sim-push">{note}</div>}

        {form && (
          <form className="master-form" onSubmit={save}>
            <div className="master-form-title">{form.ROWID ? '✏️ Edit ' + form.guard_name : '➕ New guard'}</div>
            <div className="master-grid">
              <label>ID number<input id="g-id" value={form.id_number} onChange={e => setFormField('id_number', e.target.value)} placeholder="SG-1009" required /></label>
              <label>Card number<input id="g-card" value={form.card_number} onChange={e => setFormField('card_number', e.target.value)} placeholder="Access card no." /></label>
              <label>Name<input id="g-name" value={form.guard_name} onChange={e => setFormField('guard_name', e.target.value)} required /></label>
              {/* A shift incharge works for one agency (and usually one branch): no picking (Prem, 26 Oct). */}
              {ownAgency && branches.length === 1 && <label>Branch · agency<span className="gm-fixed">{branchLabel(branches[0])} · {me.agencyName || 'your agency'}</span></label>}
              {!(ownAgency && branches.length === 1) && <label>Branch
                <select id="g-branch" value={form.branch_id} onChange={e => setForm(f => ({ ...f, branch_id: e.target.value, agency_id: ownAgency }))} required>
                  <option value="">Pick a branch</option>
                  {branches.map(b => <option key={b.ROWID} value={b.ROWID}>{branchLabel(b)} · {b.city}</option>)}
                </select>
              </label>}
              {!ownAgency && <label>Agency
                <select id="g-agency" value={form.agency_id} onChange={e => setFormField('agency_id', e.target.value)} disabled={!form.branch_id} required>
                  <option value="">{form.branch_id ? 'Pick the agency' : 'Pick the branch first'}</option>
                  {data.agencies.filter(a => ((a.is_active === true || a.is_active === 'true') && worksIn(a, form.branch_id)) || String(a.ROWID) === String(form.agency_id)).map(a => <option key={a.ROWID} value={a.ROWID}>{a.agency_name}</option>)}
                </select>
              </label>}
              <label className="gm-incharge-filter">
                <span>Shift incharge (supervisor)</span>
                <span><input type="checkbox" checked={!!form.incharge} onChange={e => setFormField('incharge', e.target.checked)} /> ⭐ This guard is a shift incharge</span>
              </label>
              {/* Area = the guard's team inside the agency (IPF: PKL, MLCP, Escort, Lady Guards…). Auto fill and
                  the escort sheet use it; "Escort" puts the guard on the escort sheet. Optional for other agencies. */}
              <label>Team / area (optional: PKL, MLCP, Escort…)<input id="g-area" value={form.area} onChange={e => setFormField('area', e.target.value)} list="g-areas" maxLength={30} /></label>
              <datalist id="g-areas">{uniq(allGuards.map(g => g.area).filter(Boolean)).sort().map(a => <option key={a} value={a} />)}</datalist>
              {/* Tags (Prem, 28 Oct): lists by kind of guard in the roster and the schedule (Lady, Document …). */}
              <div className="gm-tags">
                <span>Tags (optional: lists in the roster and schedule)</span>
                <div>
                  {[...new Set([...TAG_PRESETS, ...tagList(form.tags), ...uniq(allGuards.flatMap(g => tagList(g.tags)))])].map(t => {
                    const on = tagList(form.tags).includes(t);
                    return <button type="button" key={t} className={'gm-tag' + (on ? ' on' : '')} onClick={() => setFormField('tags', (on ? tagList(form.tags).filter(x => x !== t) : [...tagList(form.tags), t]).join(','))}>{on ? '✓ ' : '+ '}{t}</button>;
                  })}
                  <input className="gm-tag-new" placeholder="New tag + Enter" maxLength={20}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const v = e.target.value.trim(); if (v) setFormField('tags', [...tagList(form.tags), v.charAt(0).toUpperCase() + v.slice(1)].join(',')); e.target.value = ''; } }} />
                </div>
              </div>
              <label>Phone (optional)<input id="g-phone" value={form.phone} onChange={e => setFormField('phone', e.target.value)} inputMode="tel" /></label>
              {/* All Security Details (29 Oct): same fields for every branch. */}
              <label>Gender
                <select value={form.gender} onChange={e => setFormField('gender', e.target.value)}>
                  <option value="">—</option><option>Male</option><option>Female</option><option>Other</option>
                </select>
              </label>
              <label>Designation<input value={form.designation} onChange={e => setFormField('designation', e.target.value)} placeholder="Security Guard" maxLength={40} list="g-desig" /></label>
              <datalist id="g-desig"><option value="Security Guard" /><option value="Lady Guard" /><option value="Shift Incharge" /><option value="Supervisor" /><option value="Gunman" /></datalist>
              <label>Date of Joining<input type="date" value={form.date_of_joining} onChange={e => setFormField('date_of_joining', e.target.value)} /></label>
              <label>Date of Birth<input type="date" value={form.date_of_birth} onChange={e => setFormField('date_of_birth', e.target.value)} /></label>
              <label>Emergency Contact<input value={form.emergency_contact} onChange={e => setFormField('emergency_contact', e.target.value)} inputMode="tel" /></label>
              <label>Aadhaar No<input value={form.aadhaar_no} onChange={e => setFormField('aadhaar_no', e.target.value.replace(/[^0-9 ]/g, ''))} inputMode="numeric" placeholder={form.aadhaar_last4 ? 'Saved: ••••' + form.aadhaar_last4 + ' (type to change)' : '12 digits'} maxLength={14} /></label>
              <label>Aadhaar File (photo / PDF)
                <input type="file" accept="image/jpeg,image/png,application/pdf" onChange={e => setAadhaarFile(e.target.files[0] || null)} />
                {form.aadhaar_file_key && <button type="button" className="btn secondary" onClick={async () => { const u = (await api.guardAadhaarUrl(form.ROWID)).data.url; if (u) window.open(u, '_blank', 'noopener'); }}>👁 View saved file</button>}
              </label>
              <label>Photo (optional)
                <input id="g-photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setPhotoFile(e.target.files[0] || null)} />
              </label>
              {(photoFile || photoUrl) && <img className="guard-photo" src={photoFile ? URL.createObjectURL(photoFile) : photoUrl} alt={form.guard_name} />}
              {(String(form.escort_id || '') || (data.escortBranches || []).includes(String(form.branch_id))) && <label>Escort duty sheet name (only for escort duty)
                <select id="g-escort" value={form.escort_id} onFocus={() => loadFreeEscorts(form.escort_id)} onChange={e => setFormField('escort_id', e.target.value)}>
                  <option value="">— Not on the escort sheet —</option>
                  {form.escort_id && !freeEscorts && <option value={form.escort_id}>Linked (tap to change)</option>}
                  {(freeEscorts || []).map(x => <option key={x.ROWID} value={x.ROWID}>{x.escort_name}</option>)}
                </select>
              </label>}
            </div>
            <div className="sim-note">Only the guard's own details here. Post and shift are set in 📅 Schedule.</div>
            {form.ROWID && <div className="master-sub">Added by {form.created_by || '—'} · {when(form.CREATEDTIME)} &nbsp;|&nbsp; Last change by {form.modified_by || '—'} · {when(form.MODIFIEDTIME)}</div>}
            <div className="link-actions">
              <button className="btn" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save guard'}</button>
              <button className="btn secondary" type="button" onClick={() => setForm(null)}>Cancel</button>
              {form.ROWID && form.is_active === 'true' && !confirmLeft && (
                <button className="btn secondary master-danger" type="button" onClick={() => setConfirmLeft(true)}>🚫 Guard left</button>
              )}
            </div>
            {confirmLeft && (
              <div className="master-confirm">
                Switch off <b>{form.guard_name}</b>? Their link and phone stop working. Old swipes stay.
                <div className="master-grid">
                  <label>Relieved Date<input type="date" value={left.date} onChange={e => setLeft({ ...left, date: e.target.value })} /></label>
                  <label>Relieved Reason<input value={left.reason} onChange={e => setLeft({ ...left, reason: e.target.value })} placeholder="Resigned / transferred / …" maxLength={255} /></label>
                </div>
                <div className="link-actions">
                  <button className="btn master-danger-solid" type="button" disabled={saving} onClick={() => setActive(form, false, { relieved_date: left.date, relieved_reason: left.reason })}>Yes, switch off</button>
                  <button className="btn secondary" type="button" onClick={() => setConfirmLeft(false)}>No</button>
                </div>
              </div>
            )}
          </form>
        )}

        {status === 'loading' && <div className="loading-message">Loading...</div>}
        {status === 'error' && <div className="loading-message">Could not load. Check your connection and press Refresh.</div>}

        {status === 'ok' && (
          <>
            <div className="master-filters">
              <label>State
                <select id="f-state" value={filters.state} onChange={e => setFilter('state', e.target.value)}>
                  <option value="">All states</option>
                  {uniq(branches.map(b => b.state)).map(s => <option key={s}>{s}</option>)}
                </select>
              </label>
              <label>City
                <select id="f-city" value={filters.city} onChange={e => setFilter('city', e.target.value)}>
                  <option value="">All cities</option>
                  {uniq(inState.map(b => b.city)).map(c => <option key={c}>{c}</option>)}
                </select>
              </label>
              <label>Branch
                <select id="f-branch" value={filters.branch} onChange={e => setFilter('branch', e.target.value)}>
                  <option value="">All branches</option>
                  {inCity.map(b => <option key={b.ROWID} value={b.ROWID}>{branchLabel(b)}</option>)}
                </select>
              </label>
              {!ownAgency && <label>Agency
                <select id="f-agency" value={filters.agency} onChange={e => setFilter('agency', e.target.value)}>
                  <option value="">All agencies</option>
                  {uniq(guards.map(g => g.agency)).sort().map(a => <option key={a}>{a}</option>)}
                </select>
              </label>}
              <label>Area
                <select id="f-area" value={filters.area} onChange={e => setFilter('area', e.target.value)}>
                  <option value="">All areas</option>
                  {uniq(guards.map(g => g.area).filter(Boolean)).sort().map(a => <option key={a}>{a}</option>)}
                </select>
              </label>
              <label className="gm-incharge-filter">
                <span>Shift incharges</span>
                <span><input type="checkbox" checked={filters.incharge} onChange={e => setFilter('incharge', e.target.checked)} /> ⭐ only ({guards.filter(g => incharges.has(String(g.ROWID))).length})</span>
              </label>
              <label className="master-search">Search name / ID / card
                <input id="f-q" type="search" value={filters.q} onChange={e => setFilter('q', e.target.value)} placeholder="Name, ID or card no." />
              </label>
            </div>

            <div className="master-bar">
              <div className="master-trail">Showing: <b>{trail.join(' › ')}</b></div>
              <button className="btn secondary" onClick={() => setFilters(NO_FILTERS)}>Clear filters</button>
              {relCount > 0 && <label className="master-left-toggle"><input type="checkbox" checked={showRel} onChange={e => setShowRel(e.target.checked)} /> Show relievers ({relCount})</label>}
              {leftCount > 0 && (
                <label className="master-left-toggle">
                  <input id="f-left" type="checkbox" checked={showLeft} onChange={e => setShowLeft(e.target.checked)} /> Show guards who left ({leftCount})
                </label>
              )}
            </div>

            <div className="dash-scroll">
              <table className="dash-table adm-table">
                <thead>
                  <tr><th>S.No</th><th>Photo</th><th>ID</th><th>Card</th><th>Guard name</th><th>Designation</th><th>Agency</th><th>Branch</th><th>Phone</th><th>Created by</th><th>Modified by</th><th>Status</th><th></th></tr>
                </thead>
                <tbody>
                  {shown.map((g, i) => {
                    const b = branchById[String(g.branch_id)];
                    const left = g.is_active !== 'true';
                    return (
                      <tr key={g.ROWID} className={left ? 'master-left' : ''}>
                        <td className="master-sub">{i + 1}</td>
                        <td>{g.photo_key && thumbs[g.ROWID + ':' + g.photo_key]
                          ? <a href={thumbs[g.ROWID + ':' + g.photo_key]} target="_blank" rel="noreferrer"><img className="gm-thumb" src={thumbs[g.ROWID + ':' + g.photo_key]} alt={g.guard_name} loading="lazy" /></a>
                          : <span className="gm-thumb gm-thumb-none">{g.photo_key ? '…' : '👤'}</span>}</td>
                        <td>{g.id_number}</td>
                        <td>{g.card_number || '—'}</td>
                        <td className="left">{g.guard_name}{incharges.has(String(g.ROWID)) && <span className="gm-incharge" title="Shift incharge (Admin → Agencies)">⭐ Shift Incharge</span>}{tagList(g.tags).map(t => <span key={t} className="gm-tag-badge">{t}</span>)}</td>
                        <td>{g.designation || '—'}{g.date_of_joining ? <div className="master-sub">Since {day10(g.date_of_joining)}</div> : null}</td>
                        <td>{g.agency}</td>
                        <td className="left">{b ? branchLabel(b) : '—'}<div className="master-sub">{b ? b.city + ', ' + b.state : ''}</div></td>
                        <td>{g.phone || '—'}</td>
                        <td className="left">{g.created_by || '—'}<div className="master-sub">{when(g.CREATEDTIME)}</div></td>
                        <td className="left">{g.MODIFIEDTIME && g.MODIFIEDTIME !== g.CREATEDTIME ? <>{g.modified_by || '—'}<div className="master-sub">{when(g.MODIFIEDTIME)}</div></> : '—'}</td>
                        <td>
                          {/* Off = the guard left: their link and phone stop working (asked first). */}
                          <Toggle on={!left} label={g.guard_name} disabled={saving}
                            onChange={() => (left || window.confirm(g.guard_name + ' left? Their link and phone stop working.')) && setActive(g, left)} />
                        </td>
                        <td className="adm-actions">{!left && <IconBtn icon="✏️" label={'Edit ' + g.guard_name} onClick={() => openForm(g)} />}</td>
                      </tr>
                    );
                  })}
                  {shown.length === 0 && <tr><td colSpan="13">No guards match these filters.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="dash-legend">{shown.length} of {guards.length} guards</div>
          </>
        )}
      </div>
    </>
  );
}
