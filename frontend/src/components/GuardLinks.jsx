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
  const [note, setNote] = useState('');
  // ROWID of the guard whose "New link" was tapped once; the second tap makes the new link.
  const [confirmReset, setConfirmReset] = useState(null);

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

  async function showLink(name, token) {
    const link = setupLink(token);
    setQr(await QRCode.toDataURL(link, { width: 240, margin: 1 }));
    setShown({ name, link });
  }

  async function show(g) {
    setError('');
    setNote('');
    setCopied(false);
    try {
      let token = g.guard_token;
      if (!token) {
        token = (await api.createGuardLink(g.ROWID)).data.token;
        setGuards(prev => prev.map(x => (x.ROWID === g.ROWID ? { ...x, guard_token: token } : x)));
      }
      await showLink(g.guard_name, token);
    } catch (err) {
      setError(err.message);
    }
  }

  // Old link stops working and the guard's phones are removed; they set up again with the new QR.
  async function resetLink(g) {
    if (confirmReset !== g.ROWID) {
      setConfirmReset(g.ROWID);
      return;
    }
    setConfirmReset(null);
    setError('');
    setCopied(false);
    try {
      const { token, phonesRemoved } = (await api.resetGuardLink(g.ROWID)).data;
      setGuards(prev => prev.map(x => (x.ROWID === g.ROWID ? { ...x, guard_token: token, phones: 0 } : x)));
      setNote('🔄 ' + g.guard_name + ': old link is dead now' + (phonesRemoved ? ', ' + phonesRemoved + ' phone(s) removed' : '') + '. Set up the phone again with this new QR.');
      await showLink(g.guard_name, token);
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
        <a className="btn secondary" href="#master">🛡️ Guard Master</a>
        <a className="btn secondary" href="#simulator">🪪 Card Simulator</a>
        <div className="spacer"></div>
        <button className="btn" onClick={load}>🔄 Refresh</button>
      </div>

      <div className="dash">
        <div className="sim-note">One-time setup: the guard scans the QR (or opens the link) on their phone and taps Allow.</div>
        {error && <div className="trip-error">{error}</div>}
        {note && <div className="sim-push">{note}</div>}

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
                <tr><th>ID</th><th>Guard</th><th>Agency</th><th>Phone set up</th><th>Link</th></tr>
              </thead>
              <tbody>
                {guards.map(g => (
                  <tr key={g.ROWID}>
                    <td>{g.id_number}</td>
                    <td className="left">{g.guard_name}</td>
                    <td>{g.agency}</td>
                    <td className={g.phones ? 'sim-in' : ''}>{g.phones ? '📱 ' + g.phones : '—'}</td>
                    <td>
                      <button className="btn secondary" onClick={() => show(g)}>{g.guard_token ? 'Show QR' : 'Create link'}</button>
                      {g.guard_token && (
                        <button className={'btn secondary link-reset' + (confirmReset === g.ROWID ? ' confirm' : '')} onClick={() => resetLink(g)}>
                          {confirmReset === g.ROWID ? 'Sure? Old link stops' : '🔄 New link'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {guards.length === 0 && <tr><td colSpan="5">No guards in the master yet.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
