import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { formatLongDate } from '../utils.js';
import GuardSheet from './GuardSheet.jsx';

// Guard's phone, opened from the IN notification.
// ESCORT guard: the whole duty sheet of the day; only their own row (⭐) can be filled in.
// POST guard: their post.
// The server decides locked / open, so a wrong phone clock can't open it.
// `testDate` only works on `catalyst serve` (#guard/<token>?date=YYYY-MM-DD).
export default function GuardPage({ token, testDate }) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  // Bumped on every load, so the sheet starts again from the fresh data.
  const [version, setVersion] = useState(0);

  // No auto-refresh: every load costs Data Store reads. Use 🔄 instead.
  const load = useCallback(async () => {
    setStatus('loading');
    try {
      setData((await api.guardDay(token, testDate)).data);
      setVersion(v => v + 1);
      setStatus('ok');
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }, [token, testDate]);

  useEffect(() => { load(); }, [load]);

  const sheet = (data && data.sheet) || [];
  const mine = sheet.find(s => s.me);
  const inCount = sheet.filter(s => s.inTime).length;
  const isPost = data && data.dutyType === 'POST';
  const hasSheet = !isPost && !!mine;

  const open = status === 'ok' && !data.locked;
  const headline = isPost
    ? (data && data.postName ? '📍 ' + data.postName : '✅ You are IN')
    : (mine ? '⭐ Seat ' + mine.seat : '✅ You are IN');

  return (
    <>
      <div className="titlebar">
        <h1>{isPost ? '📍 My Post' : hasSheet ? 'Escort Duty Sheet' : '🪑 My Seat'}</h1>
      </div>

      {open && hasSheet && (
        <>
          <div className="toolbar no-print gsheet-bar">
            <div className="gsheet-me">{headline}</div>
            <div>{data.name} · IN {data.inTime}</div>
            <div>{formatLongDate(data.dutyDate)}</div>
            <div className="spacer"></div>
            <div>{inCount} of {sheet.length} IN</div>
            <button className="btn" onClick={load}>🔄 Refresh</button>
          </div>
          <div className="sim-note gsheet-note">Fill your ⭐ row like the duty sheet. Other rows are view only. This page closes at 08:00.</div>
          <GuardSheet
            key={version}
            token={token}
            testDate={testDate}
            dutyDate={data.dutyDate}
            sheet={sheet}
            myStops={data.stops || []}
          />
        </>
      )}

      {!(open && hasSheet) && (
        <div className="setup">
          {status === 'loading' && <div className="loading-message">Loading...</div>}
          {status === 'error' && <div className="setup-card bad">❌ {error}</div>}

          {status === 'ok' && data.locked && (
            <div className="setup-card">
              <div className="setup-hello">Hi <b>{data.name}</b> 👋</div>
              <div className="guard-lock">🔒</div>
              <p>Your duty page opens after your access card shows <b>IN</b> for today's duty.</p>
              <button className="btn secondary setup-btn" onClick={load}>🔄 Check again</button>
            </div>
          )}

          {open && (
            <>
              <div className="setup-card guard-head">
                <div className="guard-date">{formatLongDate(data.dutyDate)}</div>
                <div className="guard-me">{headline}</div>
                <div className="guard-sub">{data.name} · IN {data.inTime}</div>
              </div>
              <div className="setup-card">
                {isPost
                  ? <>Today your post is <b>{data.postName || 'not set yet'}</b>. The full post page comes later.</>
                  : 'No escort duty sheet today (Saturday / Sunday).'}
              </div>
              <p className="sim-note guard-foot">This page closes at 08:00. Tomorrow it opens again after your card IN.</p>
            </>
          )}
        </div>
      )}
    </>
  );
}
