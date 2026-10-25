import { useState } from 'react';
import QRCode from 'qrcode';

// App QR (Prem, 25–26 Oct): the sign-in page of the app as a QR, to open it on a phone. Only the app's
// address, no secret: each person still signs in with their own email. On the Admin page and on Guard
// links (shift incharges have no Admin page).
export function useAppQr() {
  const link = window.location.origin + '/app/index.html';
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const toggle = async () => setQr(qr ? '' : await QRCode.toDataURL(link, { width: 240, margin: 1 }));
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* no clipboard */ }
  };
  const button = <button className="btn secondary" onClick={toggle}>📱 App QR</button>;
  const box = qr && (
    <div className="dash no-print">
      <div className="link-box">
        <img src={qr} alt="QR code of the app sign-in page" width="240" height="240" />
        <div className="link-info">
          <div className="link-name">Open the app on a phone</div>
          <div className="link-url">{link}</div>
          <div className="link-actions">
            <button className="btn" onClick={copy}>{copied ? '✅ Copied' : '📋 Copy link'}</button>
            <button className="btn secondary" onClick={() => setQr('')}>Close</button>
          </div>
          <div className="sim-note">Scan → sign in with your own email → browser menu → Add to Home screen. No secret in it: safe to share.</div>
        </div>
      </div>
    </div>
  );
  return { button, box };
}
