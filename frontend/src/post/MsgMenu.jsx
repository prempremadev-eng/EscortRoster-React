import { Icon } from './icons.jsx';
import { shareMessage } from './share.js';

// Hold a message (or right-click): Reply · Copy · 📤 Share, for the team group and the office chat
// (Prem, 3 Nov: like the post chat, like WhatsApp).
export default function MsgMenu({ m, onReply, onClose, onInfo, extra = [] }) {
  const copy = async () => { onClose(); try { await navigator.clipboard.writeText(m.text); onInfo('Copied'); } catch { onInfo('Could not copy'); } };
  const share = () => { onClose(); shareMessage({ text: m.text, url: m.media && m.media.url, kind: m.kind, author: m.author }).catch(err => onInfo(err.message)); };
  return (
    <div className="pd-dim" onClick={onClose}>
      <div className="pd-sheet" onClick={e => e.stopPropagation()}>
        <div className="pd-grab"></div>
        <div className="pd-sheet-preview">{m.text || (m.kind === 'voice' ? 'Voice note' : m.kind === 'video' ? 'Video' : 'Photo')}</div>
        <button className="pd-option" onClick={() => { onClose(); onReply(m); }}>{Icon.reply}<span><b>Reply</b></span></button>
        {m.text && <button className="pd-option" onClick={copy}>{Icon.copy}<span><b>Copy</b></span></button>}
        {navigator.share && (m.text || m.media) && <button className="pd-option" onClick={share}>{Icon.share}<span><b>Share</b><span>WhatsApp, mail, Bluetooth …</span></span></button>}
        {/* extra: [[icon, title, help, onClick, red]] (the office's own messages: Pin for all shifts, Delete) */}
        {extra.map(([icon, title, help, fn, red]) => (
          <button key={title} className={'pd-option' + (red ? ' pd-option-red' : '')} onClick={() => { onClose(); fn(); }}>{icon}<span><b>{title}</b>{help && <span>{help}</span>}</span></button>
        ))}
        <button className="pd-link" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
