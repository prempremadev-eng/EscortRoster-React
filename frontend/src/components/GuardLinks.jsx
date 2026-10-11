import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '../api.js';

// The link the guard opens once on their phone to switch on notifications.
export const setupLink = token => new URL('index.html#setup/' + token, window.location.href).href;

// Supervisor page: make a secret link / QR per guard and see whose phone is set up.
export default function GuardLinks() {
  const [guards, setGuards] = useState([]);
  const [status, setStatus] = useState('loading');
  const [shown, setShown] = useState(null);
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  // No auto-refresh: every load costs Data Store reads. Use 🔄 instead.
  const load = useCallback(async () => {
    setStatus('loading');
    try {
      setGuards((await api.getGuardLinks()).data);
      setStatus('ok');
    } catch (err) {
      console.error('Guard links load failed:', err);
      setStatus('error');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function show(g) {
    setError('');
    setCopied(false);
    try {
      let token = g.guard_token;
      if (!token) {
        token = (await api.createGuardLink(g.ROWID)).data.token;
        setGuards(prev => prev.map(x => (x.ROWID === g.ROWID ? { ...x, guard_token: token } : x)));
      }
      const link = setupLink(token);
      setQr(await QRCode.toDataURL(link, { width: 240, margin: 1 }));
      setShown({ name: g.escort_name, link });
    } catch (err) {
      setError(err.message);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(shown.link);
      setCopied(true);
    } catch {
      setError('Copy failed. Select the link and copy it by hand.');
    }
  }

  return (
    <>
      <div className="titlebar">
        <h1>🔗 Guard Links</h1>
      </div>

      <div className="toolbar no-print">
        <a className="btn secondary" href="#">← Duty Sheet</a>
        <div className="spacer"></div>
        <button className="btn" onClick={load}>🔄 Refresh</button>
      </div>

      <div className="dash">
        <div className="sim-note">One-time setup: the guard scans the QR (or opens the link) on their phone and taps Allow.</div>
        {error && <div className="trip-error">{error}</div>}

        {shown && (
          <div className="link-box">
            <img src={qr} alt={'QR code for ' + shown.name} width="240" height="240" />
            <div className="link-info">
              <div className="link-name">{shown.name}</div>
              <div className="link-url">{shown.link}</div>
              <div className="link-actions">
                <button className="btn" onClick={copy}>{copied ? '✅ Copied' : '📋 Copy link'}</button>
                <button className="btn secondary" onClick={() => setShown(null)}>Close</button>
              </div>
              <div className="sim-note">Keep this link secret: anyone with it can see this guard's page.</div>
            </div>
          </div>
        )}

        {status === 'loading' && <div className="loading-message">Loading...</div>}
        {status === 'error' && <div className="loading-message">Could not load. Check your connection and press Refresh.</div>}

        {status === 'ok' && (
          <div className="dash-scroll">
            <table className="dash-table">
              <thead>
                <tr><th>Guard</th><th>Agency</th><th>Phone set up</th><th>Link</th></tr>
              </thead>
              <tbody>
                {guards.map(g => (
                  <tr key={g.ROWID}>
                    <td className="left">{g.escort_name}</td>
                    <td>{g.agency}</td>
                    <td className={g.phones ? 'sim-in' : ''}>{g.phones ? '📱 ' + g.phones : '—'}</td>
                    <td>
                      <button className="btn secondary" onClick={() => show(g)}>{g.guard_token ? 'Show QR' : 'Create link'}</button>
                    </td>
                  </tr>
                ))}
                {guards.length === 0 && <tr><td colSpan="4">No escorts yet. Upload the Excel first.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
