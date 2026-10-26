import { showSplash } from './Splash.jsx';
import DesktopViewToggle from './DesktopView.jsx';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { shortDate } from '../utils.js';
import GuardSheet from './GuardSheet.jsx';
import PostDuty from '../post/PostDuty.jsx';
import EscortIntro, { escortStarted } from './EscortIntro.jsx';

// Guard's phone, opened from the IN notification.
// ESCORT guard: the whole duty sheet of the day; only their own row (⭐) can be filled in.
// POST guard: take over the post and write on its timeline (src/post).
// The server decides locked / open, so a wrong phone clock can't open it.
// `testDate` only works on `catalyst serve` (#guard/<token>?date=YYYY-MM-DD).
export default function GuardPage({ token, testDate }) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  // Bumped on every load, so the sheet starts again from the fresh data.
  const [version, setVersion] = useState(0);
  // Escort: the seat and rules screens come first, until Start duty on this phone today.
  const [started, setStarted] = useState(false);

  // No auto-refresh: every load costs Data Store reads. Use 🔄 instead.
  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const d = (await api.guardDay(token, testDate)).data;
      setData(d);
      // Welcome splash once per app open (Prem, 26 Oct): the guard's own name.
      showSplash({ icon: '👋', kicker: 'Welcome', title: d.name, sub: d.postName ? '📍 ' + d.postName : '' });
      setVersion(v => v + 1);
      setStarted(false);
      setStatus('ok');
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }, [token, testDate]);

  useEffect(() => { load(); }, [load]);
  // A notification came in (e.g. card OUT): reload, so a left guard's page locks at once.
  useEffect(() => {
    const onPush = () => load();
    window.addEventListener('guard-push', onPush);
    return () => window.removeEventListener('guard-push', onPush);
  }, [load]);

  const sheet = (data && data.sheet) || [];
  const mine = sheet.find(s => s.me);
  const inCount = sheet.filter(s => s.inTime).length;
  const isPost = data && data.dutyType === 'POST';
  const hasSheet = !isPost && !!mine;

  const open = status === 'ok' && !data.locked;
  const notAssigned = data && !data.dutyType;
  const headline = isPost
    ? '📍 ' + data.postName
    : notAssigned ? '⏳ Not assigned' : (mine ? '⭐ Seat ' + mine.seat : '✅ You are IN');
  // "Shift A · 06:00–15:00" from this week's Duty Chart.
  const shiftLine = data && data.shift ? 'Shift ' + data.shift.code + ' · ' + data.shift.start + '–' + data.shift.end : '';

  // POST guard: the post handover screens (take over, post timeline).
  if (isPost) return <PostDuty token={token} />;
  // ESCORT guard: "Your seat" → 5 rules → Start duty → the sheet (like the post screens).
  if (open && hasSheet && !started && !escortStarted(token, data.dutyDate, data.lastIn || data.inTime)) {
    return <EscortIntro token={token} data={data} seat={mine.seat} onStart={() => setStarted(true)} />;
  }

  return (
    <>
      <div className="titlebar">
        <h1>{isPost ? '📍 My Post' : hasSheet ? 'Escort Duty Sheet' : '🪑 My Seat'}</h1>
      </div>

      {open && hasSheet && (
        <>
          <div className="toolbar no-print gsheet-bar">
            <div className="gsheet-me">{headline}</div>
            <div><span className="guard-name">{data.name}</span> · IN {data.inTime}{shiftLine ? ' · ' + shiftLine : ''}</div>
            <div>{shortDate(data.dutyDate)}</div>
            <div className="spacer"></div>
            <div>{inCount} of {sheet.length} IN</div>
            <button className="btn" onClick={load}>🔄 Refresh</button>
            <DesktopViewToggle />
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
              <div className="setup-hello">Hi <b className="guard-name">{data.name}</b> 👋</div>
              <div className="guard-lock">🔒</div>
              {data.outTime
                ? <p>Your card is <b>OUT</b> since {data.outTime}. Your page opens again after you swipe <b>IN</b>.</p>
                : <p>Your duty page opens after your access card shows <b>IN</b> for today's duty.</p>}
              <button className="btn secondary setup-btn" onClick={load}>🔄 Check again</button>
            </div>
          )}

          {open && (
            <>
              <div className="setup-card guard-head">
                <div className="guard-date">{shortDate(data.dutyDate)}</div>
                <div className="guard-me">{headline}</div>
                <div className="guard-sub"><span className="guard-name">{data.name}</span> · IN {data.inTime}</div>
                {shiftLine && <div className="guard-shift">{shiftLine}</div>}
              </div>
              <div className="setup-card">
                {isPost
                  ? <>Today your post is <b>{data.postName}</b>, {shiftLine}.</>
                  : notAssigned
                    ? (data.waitPublish
                      ? "Today's schedule is not published yet. Your post shows here when your supervisor publishes it (no need to swipe again)."
                      : 'No post for you in today\'s schedule. Ask your supervisor.')
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
