// 👤 A profile photo full screen, like WhatsApp (Prem, 2 Nov): tap the picture; ✕ or a tap closes it.
export default function PhotoView({ photo, name, onClose }) {
  if (!photo) return null;
  return (
    <div className="pd-photo-view" onClick={onClose} role="dialog" aria-label={'Photo of ' + name}>
      <div className="pd-photo-view-top"><b>{name}</b><button type="button" onClick={onClose} aria-label="Close">✕</button></div>
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
