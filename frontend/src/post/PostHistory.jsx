import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { Icon, initials } from './icons.jsx';
import PastShift from './PastShift.jsx';

const SHIFT_ORDER = ['A', 'G', 'B', 'C'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Dates as YYYY-MM-DD in the phone's own day (guards' phones are in India).
const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return ymd(d);
}
function monday() {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return ymd(d);
}
function monthStart() {
  const d = new Date();
  return ymd(new Date(d.getFullYear(), d.getMonth(), 1));
}
const nice = date => {
  const d = new Date(date + 'T00:00:00');
  return DOW[d.getDay()] + ' ' + d.getDate() + ' ' + d.toLocaleString('en-GB', { month: 'short' });
};
function datesBetween(from, to) {
  const out = [];
  for (let d = new Date(from + 'T00:00:00'); ymd(d) <= to; d.setDate(d.getDate() + 1)) out.push(ymd(d));
  return out.reverse();
}

const RANGES = {
  last2: { label: 'Last 2 days', from: () => daysAgo(1) },
  week: { label: 'This week', from: monday },
  month: { label: 'This month', from: monthStart }
};

// Screens 6 / 7 / 8: the post's history (List, Table, Works). A row opens that shift (screen 9).
// Leaving Duty history (any way, also phone Back): forget where it was, so it opens fresh next time.
export function forgetHistory() {
  try { Object.keys(sessionStorage).filter(k => k.startsWith('pd_hist_')).forEach(k => sessionStorage.removeItem(k)); } catch { /* private mode */ }
}

export default function PostHistory({ token, post, postName, onClose }) {
  // A reload stays where it was (Prem, 26 Oct): tab, dates, shift filter and the open past shift,
  // kept for this tab only.
  const memKey = 'pd_hist_' + (post || 'own');
  const mem = (() => { try { return JSON.parse(sessionStorage.getItem(memKey)) || {}; } catch { return {}; } })();
  const [tab, setTab] = useState(mem.tab || 'list');
  const [rangeKey, setRangeKey] = useState(mem.rangeKey && (mem.rangeKey === 'pick' || RANGES[mem.rangeKey]) ? mem.rangeKey : 'last2');
  const [picked, setPicked] = useState(mem.picked || '');
  const [shift, setShift] = useState(mem.shift || 'all');
  const [data, setData] = useState(null);
  const [works, setWorks] = useState(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [open, setOpen] = useState(mem.open || null);
  useEffect(() => {
    try { sessionStorage.setItem(memKey, JSON.stringify({ tab, rangeKey, picked, shift, open })); } catch { /* private mode */ }
  }, [memKey, tab, rangeKey, picked, shift, open]);
  const close = () => { try { sessionStorage.removeItem(memKey); } catch { /* private mode */ } onClose(); };

  const today = daysAgo(0);
  const from = rangeKey === 'pick' ? picked || today : RANGES[rangeKey].from();
  const to = rangeKey === 'pick' ? picked || today : today;

  const load = useCallback(async () => {
    setError('');
    try {
      if (tab === 'works') {
        setWorks(null);
        setWorks((await api.postWorks(token, from, to, post)).data);
      } else {
        setData(null);
        setData((await api.postHistory(token, from, to, post)).data);
      }
    } catch (err) {
      setError(err.message);
    }
  }, [token, post, tab, from, to]);

  useEffect(() => { load(); }, [load]);

  // A list / table tab never asks for "last 2 days" in Table (too few rows): keep what was picked.
  function pickTab(t) {
    setTab(t);
    if (t !== 'list' && rangeKey === 'last2') setRangeKey('week');
  }

  if (open) return <PastShift token={token} post={post} logId={open} onClose={() => setOpen(null)} />;

  const rows = data ? data.rows.filter(r => shift === 'all' || r.shift === shift) : [];
  const shifts = data ? data.shifts.slice().sort((a, b) => SHIFT_ORDER.indexOf(a.code) - SHIFT_ORDER.indexOf(b.code)) : [];
  const counts = c => [c.notes && c.notes + ' notes', c.photos && c.photos + ' photos', c.works && c.works + ' works', c.alerts && c.alerts + ' alerts'].filter(Boolean).join(' · ') || 'No notes';
  const times = r => (r.took ? r.took : 'IN ' + r.in) + ' – ' + (r.handed || (r.status === 'waiting' ? 'not taken over' : 'now'));
  // Any shift opens, the one going on now too (to see breaks and covers so far).
  const openRow = r => setOpen(r.ROWID);

  const rangeButtons = (keys) => (
    <div className="pd-quick pd-wrap">
      {keys.map(k => <button key={k} className={'pd-chip' + (rangeKey === k ? ' pd-chip-primary' : '')} onClick={() => setRangeKey(k)}>{RANGES[k].label}</button>)}
      <label className={'pd-chip pd-chip-date' + (rangeKey === 'pick' ? ' pd-chip-primary' : '')}>
        {rangeKey === 'pick' && picked ? nice(picked) : 'Pick date'}
        <input type="date" value={picked} max={today} onChange={e => { setPicked(e.target.value); setRangeKey('pick'); }} />
      </label>
    </div>
  );

  const shownWorks = (works || []).filter(w => w.contractor.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div className="pd pd-page pd-history">
      <div className="pd-form-head">
        <button className="pd-icon-btn" onClick={close} aria-label="Back">{Icon.back}</button>
        <div>
          <div className="pd-title pd-title-sm">Duty history</div>
          <div className="pd-muted pd-small">{postName}</div>
        </div>
      </div>

      <div className="pd-tabs">
        {[['list', 'List'], ['table', 'Table'], ['works', 'Works']].map(([k, name]) => (
          <button key={k} className={'pd-tab' + (tab === k ? ' pd-tab-on' : '')} onClick={() => pickTab(k)}>{name}</button>
        ))}
      </div>

      {tab === 'list' && (
        <>
          {rangeButtons(['last2', 'week'])}
          <div className="pd-quick">
            {['all'].concat(SHIFT_ORDER).map(s => <button key={s} className={'pd-chip pd-chip-sm' + (shift === s ? ' pd-chip-primary' : '')} onClick={() => setShift(s)}>{s === 'all' ? 'All' : s}</button>)}
          </div>
        </>
      )}
      {tab === 'table' && rangeButtons(['week', 'month'])}
      {tab === 'works' && (
        <>
          <input className="pd-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search contractor" aria-label="Search contractor" />
          {rangeButtons(['week', 'month'])}
        </>
      )}

      {error && <div className="pd-card pd-bad">{error}</div>}
      {!error && ((tab === 'works' && !works) || (tab !== 'works' && !data)) && <div className="pd-muted">Loading...</div>}

      {tab === 'list' && data && datesBetween(from, to).map(date => {
        const dayRows = rows.filter(r => r.date === date);
        if (!dayRows.length) return null;
        return (
          <div key={date} className="pd-day-group">
            <div className="pd-label">{date === today ? 'TODAY' : nice(date).toUpperCase()}</div>
            {date === today && <div className="pd-small pd-muted">Touch a shift to see its timeline.</div>}
            {dayRows.map(r => (
              <button key={r.ROWID} className={'pd-hrow' + (r.status === 'on_duty' || r.status === 'on_break' ? ' pd-hrow-now' : '')} onClick={() => openRow(r)}>
                <span className="pd-avatar pd-avatar-sm">{initials(r.name)}</span>
                <span className="pd-grow">
                  <span className="pd-row-between"><b>{r.name}</b><span className="pd-pill pd-pill-sm pd-neutral">Shift {r.shift}</span></span>
                  <span className={'pd-small ' + (r.late ? 'pd-amber-text' : 'pd-muted')}>{times(r)}{r.late ? ' · late' : ''}</span>
                  <span className="pd-small pd-muted">{counts(r.counts)}</span>
                </span>
              </button>
            ))}
          </div>
        );
      })}
      {tab === 'list' && data && rows.length === 0 && <div className="pd-muted">No duty at this post in these days.</div>}

      {tab === 'table' && data && (
        <div className="pd-table-wrap">
          <table className="pd-htable">
            <thead><tr><th>Date</th>{shifts.map(s => <th key={s.code}>{s.code} · {s.start.slice(0, 2).replace(/^0/, '')}–{s.end.slice(0, 2).replace(/^0/, '')}</th>)}</tr></thead>
            <tbody>
              {datesBetween(from, to).map(date => (
                <tr key={date}>
                  <td className="pd-hdate">{nice(date)}</td>
                  {shifts.map(s => {
                    const cell = data.rows.filter(r => r.date === date && r.shift === s.code);
                    return (
                      <td key={s.code} data-shift={s.code} className={cell.length ? '' : 'pd-hempty'}>
                        {cell.map(r => (
                          <button key={r.ROWID} className={'pd-hcell' + (r.status === 'on_duty' || r.status === 'on_break' ? ' pd-hcell-now' : r.late ? ' pd-hcell-late' : '')} onClick={() => openRow(r)}>
                            <b>{r.name.split(' ')[0]}</b><span>{r.took || '—'}</span>
                            {/* Work updates and alerts of that shift (Prem, 26 Oct: works did not show). */}
                            {(r.counts.works > 0 || r.counts.alerts > 0) && (
                              <span className="pd-hbadges">{r.counts.works > 0 && <em>🔧 {r.counts.works}</em>}{r.counts.alerts > 0 && <em>🚨 {r.counts.alerts}</em>}</span>
                            )}
                          </button>
                        ))}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="pd-legend"><span className="pd-dot pd-dot-green"></span>On duty now <span className="pd-dot pd-dot-amber"></span>Late take over</div>
        </div>
      )}

      {tab === 'works' && works && (
        <>
          <div className="pd-tiles pd-tiles-3">
            <div className="pd-tile"><div className="pd-tile-k">Works</div><div className="pd-tile-v">{shownWorks.length}</div></div>
            <div className="pd-tile"><div className="pd-tile-k">Contractors</div><div className="pd-tile-v">{new Set(shownWorks.map(w => w.contractor.toLowerCase())).size}</div></div>
            <div className="pd-tile"><div className="pd-tile-k">In progress</div><div className="pd-tile-v">{shownWorks.filter(w => !w.finished).length}</div></div>
          </div>
          {shownWorks.map(w => (
            <div key={w.ROWID} className="pd-card pd-gap8">
              <div className="pd-row-between">
                <b>{w.contractor} · {w.persons} persons</b>
                <span className={'pd-pill pd-pill-sm ' + (w.finished ? 'pd-green' : w.expired ? 'pd-red' : 'pd-amber')}>{w.finished ? 'Finished' : w.expired ? 'Permit expired' : 'In progress'}</span>
              </div>
              {w.description && <div className="pd-small">{w.description}</div>}
              <div className="pd-small pd-muted">{nice(w.date)} · {w.started} – {w.finished || 'now'} · permit {w.from} – {w.to}</div>
              <div className="pd-small pd-muted">Added by {w.addedBy}{w.finishedBy ? ' · finished by ' + w.finishedBy : ''}</div>
            </div>
          ))}
          {shownWorks.length === 0 && <div className="pd-muted">No works in these days.</div>}
        </>
      )}
    </div>
  );
}
