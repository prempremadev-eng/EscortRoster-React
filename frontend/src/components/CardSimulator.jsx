import SetupSteps from './SetupSteps.jsx';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { dutyDayStr } from '../utils.js';
import { dutyLabel } from './GuardMaster.jsx';

// What happened to the IN notification, in one line for the tester.
function pushNote(name, push) {
  if (!push) return '';
  if (push.error) return '❌ ' + name + ': push failed (' + push.error + ')';
  if (push.skipped) return 'ℹ️ ' + name + ': ' + push.skipped + ', no new notification.';
  if (!push.phones) return '📵 ' + name + ': no phone set up (Guard Links).';
  const failed = (push.devices || []).filter(d => d.result !== 'sent').map(d => d.device + ' ' + d.result).join(', ');
  return '📨 ' + name + ': sent to ' + push.sent + ' of ' + push.phones + ' phone(s)' + (push.seat ? ', Seat ' + push.seat : '') + (push.post ? ', ' + push.post + ' · Shift ' + push.shift : ', duty not assigned') + (failed ? ' (' + failed + ')' : '') + '.';
}

// Pretends to be the access-card machine at the gate: each button press writes one AccessLog row.
// Every guard in the Guards master can swipe (POST and ESCORT).
// Later the real card system writes the same table, and nothing else in the app has to change.
export default function CardSimulator() {
  const dutyDate = dutyDayStr();
  const [guards, setGuards] = useState([]);
  const [logs, setLogs] = useState([]);
  const [status, setStatus] = useState('loading');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  // Filters like Guard Links (Prem, 25 Oct): one agency at a time, branch, name / ID, and IN or not.
  const [agency, setAgency] = useState(() => { try { return localStorage.getItem('sim-agency') || ''; } catch { return ''; } });
  const [branches, setBranches] = useState([]);
  const [branch, setBranch] = useState('');
  const [find, setFind] = useState('');
  const [state, setState] = useState('');
  useEffect(() => { api.getPosts().then(r => setBranches(r.data.branches || [])).catch(() => {}); }, []);

  // No auto-refresh: every load costs Data Store reads. Use 🔄 instead.
  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const [g, l] = await Promise.all([api.getGuards(), api.getAccessLog(dutyDate)]);
      setGuards(g.data);
      setLogs(l.data);
      setStatus('ok');
    } catch (err) {
      console.error('Card simulator load failed:', err);
      setStatus('error');
    }
  }, [dutyDate]);

  useEffect(() => { load(); }, [load]);

  async function punch(guardId, direction) {
    setBusy(guardId);
    setError('');
    setNote('');
    try {
      const result = await api.addAccessLog(guardId, direction);
      // Add the new row ourselves instead of reloading the whole list (saves a read).
      setLogs(prev => [...prev, result.data]);
      setNote(pushNote(names[guardId], result.push));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  // Latest swipe of each guard decides their status. Old rows from before the Guards master
  // have no guard_id and are left out.
  const myLogs = logs.filter(l => l.guard_id);
  const last = {};
  myLogs.forEach(l => { last[String(l.guard_id)] = l; });
  const names = {};
  guards.forEach(g => { names[String(g.ROWID)] = g.guard_name; });
  const agencyNames = [...new Set(guards.map(g => g.agency).filter(Boolean))].sort();
  const pick = agencyNames.includes(agency) ? agency : (agencyNames[0] || '');
  const needle = find.trim().toLowerCase();
  const isInNow = g => (last[String(g.ROWID)] || {}).direction === 'IN';
  const list = guards.filter(g => (agencyNames.length < 2 || g.agency === pick) && (!branch || String(g.branch_id) === branch)
    && (!needle || (g.guard_name + ' ' + g.id_number).toLowerCase().includes(needle))
    && (!state || (state === 'IN') === isInNow(g)));
  // The swipe log follows the same filters.
  const shown = new Set(list.map(g => String(g.ROWID)));
  const listLogs = myLogs.filter(l => shown.has(String(l.guard_id)));

  return (
    <>
      <div className="titlebar">
        <h1>🪪 Card Simulator</h1>
      </div>
      <SetupSteps active="simulator" />

      <div className="toolbar no-print">
        <div><label>Duty day:</label> {dutyDate}</div>
        {branches.length > 1 && (
          <select value={branch} onChange={e => setBranch(e.target.value)} aria-label="Branch">
            <option value="">All my branches ({branches.length})</option>
            {branches.map(b => <option key={b.ROWID} value={b.ROWID}>{b.branch_name} · {b.city}</option>)}
          </select>
        )}
        {agencyNames.length > 1 && (
          <select value={pick} onChange={e => { setAgency(e.target.value); try { localStorage.setItem('sim-agency', e.target.value); } catch { /* private window */ } }} aria-label="Agency">
            {agencyNames.map(a => <option key={a}>{a}</option>)}
          </select>
        )}
        <select value={state} onChange={e => setState(e.target.value)} aria-label="Status">
          <option value="">IN and not IN</option>
          <option value="IN">✅ IN now</option>
          <option value="OUT">⏳ Not IN</option>
        </select>
        <input type="search" value={find} onChange={e => setFind(e.target.value)} placeholder="🔍 Name or ID" aria-label="Find a guard" />
        <div className="spacer"></div>
        <span className="pd-muted">{list.length} guards</span>
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
                  <tr><th>ID</th><th>Guard</th><th>Agency</th><th>This week</th><th>Status</th><th>Card</th></tr>
                </thead>
                <tbody>
                  {list.map(g => {
                    const id = String(g.ROWID);
                    const l = last[id];
                    const isIn = l && l.direction === 'IN';
                    return (
                      <tr key={id}>
                        <td>{g.id_number}</td>
                        <td className="left">{g.guard_name}</td>
                        <td>{g.agency}</td>
                        <td>{dutyLabel(g.duty)}</td>
                        <td className={isIn ? 'sim-in' : ''}>{l ? (isIn ? '✅ IN ' : '🚪 OUT ') + l.punch_time : '⏳'}</td>
                        <td className="sim-buttons">
                          <button className="btn" disabled={busy === id} onClick={() => punch(id, 'IN')}>IN</button>
                          <button className="btn secondary" disabled={busy === id} onClick={() => punch(id, 'OUT')}>OUT</button>
                        </td>
                      </tr>
                    );
                  })}
                  {list.length === 0 && <tr><td colSpan="6">{guards.length ? 'No guard matches the filter.' : 'No guards in the master yet.'}</td></tr>}
                </tbody>
              </table>
            </div>

            <h2 className="dash-h2">Swipe log ({listLogs.length})</h2>
            <div className="dash-scroll">
              <table className="dash-table">
                <thead>
                  <tr><th>Time</th><th>Guard</th><th>Direction</th><th>Source</th></tr>
                </thead>
                <tbody>
                  {[...listLogs].reverse().map(l => (
                    <tr key={l.ROWID}>
                      <td>{l.punch_time}</td>
                      <td className="left">{names[String(l.guard_id)] || '(inactive guard)'}</td>
                      <td>{l.direction}</td>
                      <td>{l.source}</td>
                    </tr>
                  ))}
                  {listLogs.length === 0 && <tr><td colSpan="4">No swipes yet for this duty day.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </>
  );
}
