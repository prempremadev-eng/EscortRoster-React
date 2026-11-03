// 📤 Share a chat message out of the app, like WhatsApp (Prem, 3 Nov): the phone's own share sheet (WhatsApp, mail,
// Bluetooth …). A photo or video goes as the file itself; if the phone or the link does not allow that, as text.
export async function shareMessage({ text, url, kind, author }) {
  if (!navigator.share) throw new Error('This phone cannot share from here. Use Copy.');
  const words = [author ? author + ':' : '', text || ''].filter(Boolean).join(' ').trim();
  if (url && (kind === 'photo' || kind === 'video')) {
    try {
      const blob = await (await fetch(url)).blob();
      const type = blob.type || (kind === 'photo' ? 'image/jpeg' : 'video/mp4');
      const file = new File([blob], (kind === 'photo' ? 'photo' : 'video') + '.' + (type.split('/')[1] || 'jpg').split(';')[0], { type });
      if (!navigator.canShare || navigator.canShare({ files: [file] })) return await navigator.share({ files: [file], ...(words ? { text: words } : {}) });
    } catch (err) {
      if (err && err.name === 'AbortError') return; // closed the share sheet
    }
  }
  try { await navigator.share({ text: words || (kind === 'voice' ? 'Voice note' : 'Message') }); } catch (err) { if (!err || err.name !== 'AbortError') throw err; }
}
