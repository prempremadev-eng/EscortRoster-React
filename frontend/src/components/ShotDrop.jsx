import { useEffect, useState } from 'react';
import { api } from '../api.js';

// 📤 Screenshot drop (Prem, 9 Nov): #shots/<key>, no login. Prem picks a screenshot, gives it a title
// ("1. Gate page"), uploads; Claude collects them for the manager presentation.
function toJpeg(file) {
  return new Promise((ok, bad) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1080 / img.width);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      ok(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => bad(new Error('This file is not a picture.'));
    img.src = URL.createObjectURL(file);
  });
}

export default function ShotDrop({ k }) {
  const [list, setList] = useState(null);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');

  const load = () => api.shotList(k).then(r => setList(r.data)).catch(err => { setMsg('❌ ' + err.message); setList([]); });
  useEffect(() => { load(); }, [k]); // eslint-disable-line react-hooks/exhaustive-deps

  async function pick(e) {
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length) return;
    setMsg('');
    let n = (list || []).length;
    for (let i = 0; i < files.length; i++) {
      n++;
      const t = (title.trim() || 'Step ' + n) + (files.length > 1 && title.trim() ? ' (' + (i + 1) + ')' : '');
      setBusy('Uploading ' + (i + 1) + ' of ' + files.length + '…');
      try {
        await api.shotUpload({ k, title: t, photo: await toJpeg(files[i]) });
      } catch (err) {
        setMsg('❌ ' + err.message);
        break;
      }
    }
    setBusy('');
    setTitle('');
    await load();
    setMsg(m => m || '✅ Uploaded. Add the next one, or tell Claude you are done.');
  }

  async function remove(s) {
    try { await api.shotRemove({ k, key: s.key }); await load(); } catch (err) { setMsg('❌ ' + err.message); }
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '20px 16px 48px', display: 'grid', gap: 14, fontSize: 16 }}>
      <h1 style={{ margin: 0, fontSize: 22 }}>📤 Screenshots for the manager deck</h1>
      <div style={{ color: '#5B6584' }}>Type a title, then choose the screenshot. One at a time keeps the order right.</div>
      <label style={{ display: 'grid', gap: 6, fontWeight: 600 }}>Title
        <input id="shot-title" value={title} onChange={e => setTitle(e.target.value)} placeholder={'Step ' + (((list || []).length) + 1) + ' · e.g. Gate page'}
          style={{ fontSize: 17, padding: 12, borderRadius: 10, border: '1px solid #D5DBEA' }} />
      </label>
      <label style={{ display: 'block', textAlign: 'center', background: '#1E3A8A', color: '#fff', padding: 16, borderRadius: 12, fontWeight: 700, fontSize: 18, opacity: busy ? 0.6 : 1 }}>
        {busy || '📷 Choose screenshot'}
        <input type="file" accept="image/*" multiple onChange={pick} disabled={!!busy} style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} />
      </label>
      {msg && <div style={{ fontWeight: 600, color: msg.startsWith('❌') ? '#B4381A' : '#1F7A45' }}>{msg}</div>}
      {!list && <div>Loading…</div>}
      {list && list.length > 0 && <div style={{ fontWeight: 700 }}>{list.length} uploaded</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
        {(list || []).map((s, i) => (
          <figure key={s.key} style={{ margin: 0, border: '1px solid #D9DEEB', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
            {s.url ? <img src={s.url} alt={s.title} style={{ display: 'block', width: '100%', aspectRatio: '9 / 18', objectFit: 'cover' }} /> : <div style={{ aspectRatio: '9 / 18', background: '#EEF1F8' }} />}
            <figcaption style={{ padding: '6px 8px', fontSize: 13, display: 'grid', gap: 4 }}>
              <b>#{i + 1} {s.title}</b>
              <button type="button" onClick={() => remove(s)} style={{ fontSize: 12, padding: 4, border: '1px solid #E4C2B6', background: 'transparent', color: '#B4381A', borderRadius: 6 }}>Remove</button>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
