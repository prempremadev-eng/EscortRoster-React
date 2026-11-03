import { useState } from 'react';
import { shareMessage } from './share.js';

// 👤 A profile photo full screen, like WhatsApp (Prem, 2 Nov): tap the picture; ✕ or a tap closes it.
export default function PhotoView({ photo, name, onClose }) {
  if (!photo) return null;
  return (
    <div className="pd-photo-view" onClick={onClose} role="dialog" aria-label={'Photo of ' + name}>
      <div className="pd-photo-view-top"><b>{name}</b>
        <span>
          {navigator.share && <button type="button" onClick={e => { e.stopPropagation(); shareMessage({ url: photo, kind: 'photo' }).catch(() => {}); }} aria-label="Share">📤</button>}
          <button type="button" onClick={onClose} aria-label="Close">✕</button>
        </span>
      </div>
      <img src={photo} alt={name} onClick={e => e.stopPropagation()} />
    </div>
  );
}

// 📷 Camera or 🖼 Gallery for a new profile photo, like WhatsApp (Prem, 2 Nov). The camera opens the front one.
export function PhotoPick({ onFile, onClose }) {
  const pick = e => { const f = e.target.files[0]; e.target.value = ''; onClose(); if (f) onFile(f); };
  return (
    <div className="pd-dim" onClick={onClose}>
      <div className="pd-sheet" onClick={e => e.stopPropagation()}>
        <div className="pd-grab"></div>
        <div className="pd-sheet-title">Profile photo</div>
        <div className="pd-pick-row">
          <label className="pd-pick">📷<span>Camera</span><input type="file" accept="image/*" capture="user" hidden onChange={pick} /></label>
          <label className="pd-pick">🖼️<span>Gallery</span><input type="file" accept="image/*" hidden onChange={pick} /></label>
        </div>
      </div>
    </div>
  );
}

// 🖼 A photo inside a chat bubble, WhatsApp size; a tap shows it full screen (Prem, 3 Nov: photos were too small).
export function ChatPhoto({ url, alt, name }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <img src={url} alt={alt} className="pd-media-img" onClick={e => { e.stopPropagation(); setOpen(true); }} />
      {open && <PhotoView photo={url} name={name || alt} onClose={() => setOpen(false)} />}
    </>
  );
}
