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
