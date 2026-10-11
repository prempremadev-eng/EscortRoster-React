import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { formatLongDate } from '../utils.js';

// Guard's phone, opened from the IN notification: today's seats, own row starred.
// The server decides locked / open, so a wrong phone clock can't open it.
// `testDate` only works on `catalyst serve` (#guard/<token>?date=YYYY-MM-DD).
export default function GuardPage({ token, testDate }) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');

  // No auto-refresh: every load costs Data Store reads. Use 🔄 instead.
  const load = useCallback(async () => {
    setStatus('loading');
    try {
      setData((await api.guardDay(token, testDate)).data);
      setStatus('ok');
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }, [token, testDate]);

  useEffect(() => { load(); }, [load]);

  const mine = data && data.seats && data.seats.find(s => s.me);
  const inCount = data && data.seats ? data.seats.filter(s => s.name).length : 0;

  return (
    <>
      <div className="titlebar">
        <h1>🪑 My Seat</h1>
      </div>

      <div className="setup">
        {status === 'loading' && <div className="loading-message">Loading...</div>}
        {status === 'error' && <div className="setup-card bad">❌ {error}</div>}

        {status === 'ok' && data.locked && (
          <div className="setup-card">
            <div className="setup-hello">Hi <b>{data.name}</b> 👋</div>
            <div className="guard-lock">🔒</div>
            <p>Your seat page opens after your access card shows <b>IN</b> for today's duty.</p>
            <button className="btn secondary setup-btn" onClick={load}>🔄 Check again</button>
          </div>
        )}

        {status === 'ok' && !data.locked && (
          <>
            <div className="setup-card guard-head">
              <div className="guard-date">{formatLongDate(data.dutyDate)}</div>
              <div className="guard-me">{mine ? '⭐ Seat ' + mine.seat : '✅ You are IN'}</div>
              <div className="guard-sub">{data.name} · IN {data.inTime}</div>
            </div>

            {data.seats.length === 0 ? (
              <div className="setup-card">No rotation seats today (Saturday / Sunday).</div>
            ) : (
              <>
                <div className="guard-count">
                  <span>{inCount} of {data.seats.length} IN</span>
                  <button className="btn secondary" onClick={load}>🔄 Refresh</button>
                </div>
                <table className="guard-seats">
                  <tbody>
                    {data.seats.map(s => (
                      <tr key={s.seat} className={s.me ? 'me' : s.name ? '' : 'empty'}>
                        <td className="guard-seat-no">{s.seat}</td>
                        <td>{s.me ? '⭐ ' + s.name : s.name || 'EMPTY'}</td>
                        <td className="guard-seat-time">{s.inTime || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            <p className="sim-note guard-foot">This page closes at 08:00. Tomorrow it opens again after your card IN.</p>
          </>
        )}
      </div>
    </>
  );
}
