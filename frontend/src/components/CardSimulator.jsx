import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { dutyDayStr } from '../utils.js';

// What happened to the IN notification, in one line for the tester.
function pushNote(name, push) {
  if (!push) return '';
  if (push.error) return '❌ ' + name + ': push failed (' + push.error + ')';
  if (push.skipped) return 'ℹ️ ' + name + ': ' + push.skipped + ', no new notification.';
  if (!push.phones) return '📵 ' + name + ': no phone set up (Guard Links).';
  return '📨 ' + name + ': sent to ' + push.sent + ' of ' + push.phones + ' phone(s)' + (push.seat ? ', Seat ' + push.seat : '') + '.';
}

// Pretends to be the access-card machine at the gate: each button press writes one AccessLog row.
// Later the real card system writes the same table, and nothing else in the app has to change.
export default function CardSimulator() {
  const dutyDate = dutyDayStr();
  const [escorts, setEscorts] = useState([]);
  const [logs, setLogs] = useState([]);
  const [status, setStatus] = useState('loading');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  // No auto-refresh: every load costs Data Store reads. Use 🔄 instead.
  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const [e, l] = await Promise.all([api.getEscorts(), api.getAccessLog(dutyDate)]);
      setEscorts(e.data);
      setLogs(l.data);
      setStatus('ok');
    } catch (err) {
      console.error('Card simulator load failed:', err);
      setStatus('error');
    }
  }, [dutyDate]);

  useEffect(() => { load(); }, [load]);

  async function punch(escortId, direction) {
    setBusy(escortId);
    setError('');
    setNote('');
    try {
      const result = await api.addAccessLog(escortId, direction);
      // Add the new row ourselves instead of reloading the whole list (saves a read).
      setLogs(prev => [...prev, result.data]);
      setNote(pushNote(names[escortId], result.push));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  // Latest swipe of each guard decides their status.
  const last = {};
  logs.forEach(l => { last[String(l.escort_id)] = l; });
  const names = {};
  escorts.forEach(e => { names[String(e.ROWID)] = e.escort_name; });

  return (
    <>
      <div className="titlebar">
        <h1>🪪 Card Simulator</h1>
      </div>

      <div className="toolbar no-print">
        <a className="btn secondary" href="#">← Duty Sheet</a>
        <div><label>Duty day:</label> {dutyDate}</div>
        <div className="spacer"></div>
        <button className="btn" onClick={load}>🔄 Refresh</button>
      </div>

      <div className="dash">
        <div className="sim-note">Test only: these buttons act like the guard's access card at the gate.</div>
        {error && <div className="trip-error">{error}</div>}
        {note && <div className="sim-push">{note}</div>}
        {status === 'loading' && <div className="loading-message">Loading...</div>}
        {status === 'error' && <div className="loading-message">Could not load. Check your connection and press Refresh.</div>}

        {status === 'ok' && (
          <>
            <div className="dash-scroll">
              <table className="dash-table">
                <thead>
                  <tr><th>Guard</th><th>Agency</th><th>Status</th><th>Card</th></tr>
                </thead>
                <tbody>
                  {escorts.map(e => {
                    const id = String(e.ROWID);
                    const l = last[id];
                    const isIn = l && l.direction === 'IN';
                    return (
                      <tr key={id}>
                        <td className="left">{e.escort_name}</td>
                        <td>{e.agency}</td>
                        <td className={isIn ? 'sim-in' : ''}>{l ? (isIn ? '✅ IN ' : '🚪 OUT ') + l.punch_time : '⏳'}</td>
                        <td className="sim-buttons">
                          <button className="btn" disabled={busy === id} onClick={() => punch(id, 'IN')}>IN</button>
                          <button className="btn secondary" disabled={busy === id} onClick={() => punch(id, 'OUT')}>OUT</button>
                        </td>
                      </tr>
                    );
                  })}
                  {escorts.length === 0 && <tr><td colSpan="4">No escorts yet. Upload the Excel first.</td></tr>}
                </tbody>
              </table>
            </div>

            <h2 className="dash-h2">Swipe log ({logs.length})</h2>
            <div className="dash-scroll">
              <table className="dash-table">
                <thead>
                  <tr><th>Time</th><th>Guard</th><th>Direction</th><th>Source</th></tr>
                </thead>
                <tbody>
                  {[...logs].reverse().map(l => (
                    <tr key={l.ROWID}>
                      <td>{l.punch_time}</td>
                      <td className="left">{names[String(l.escort_id)] || '(removed escort)'}</td>
                      <td>{l.direction}</td>
                      <td>{l.source}</td>
                    </tr>
                  ))}
                  {logs.length === 0 && <tr><td colSpan="4">No swipes yet for this duty day.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </>
  );
}
