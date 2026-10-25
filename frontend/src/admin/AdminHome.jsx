import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';

// Admin home (Prem, 26 Oct): the first page an admin sees. One date + one shift for the whole area.
//   #home        → the overall strength: allotted, present, absent, leave, off
//   #home/list   → one tile per branch · agency (like a menu of cups)
//   #home/g/<branch>-<agency> → that tile's strength and people on the left, the tiles on the right
// One call per date / shift (≈ 8 reads), one more for a picked tile's people. No timer: ↻ reloads.

const pad = n => String(n).padStart(2, '0');
// The duty day: before 06:00 it is still yesterday's (Shift C runs past midnight).
function today() {
  const d = new Date();
  if (d.getHours() < 6) d.setDate(d.getDate() - 1);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
function runningShift() {
  const h = new Date().getHours();
  return h >= 6 && h < 14 ? 'A' : h >= 14 && h < 21 ? 'B' : 'C';
}
const niceDate = d => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

// Present out of allotted as a ring; the % in the middle.
function Ring({ present, allotted, size = 180, stroke = 16, label = true }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = allotted ? Math.min(1, present / allotted) : 0;
  return (
    <svg className="ah-ring" width={size} height={size} viewBox={'0 0 ' + size + ' ' + size} role="img" aria-label={present + ' of ' + allotted + ' present'}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ah-track)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ah-green)" strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - p)} transform={'rotate(-90 ' + size / 2 + ' ' + size / 2 + ')'} className="ah-ring-arc" />
      {label && <>
        <text x="50%" y="47%" textAnchor="middle" className="ah-ring-big" style={{ fontSize: size * 0.22 }}>{pct(present, allotted)}%</text>
        <text x="50%" y="63%" textAnchor="middle" className="ah-ring-small" style={{ fontSize: size * 0.085 }}>{present} / {allotted} present</text>
      </>}
    </svg>
  );
}

const STATS = [
  ['allotted', 'Allotted', 'ah-blue', '👥'],
  ['present', 'Present', 'ah-green', '✅'],
  ['absent', 'Absent', 'ah-red', '❌'],
  ['leave', 'Leave', 'ah-amber', '🌴'],
  ['off', 'Week off', 'ah-grey', '🛌']
];

function Stats({ t, begun }) {
  return (
    <div className="ah-stats">
      {STATS.map(([k, label, cls, icon]) => (
        <div key={k} className={'ah-stat ' + cls}>
          <span className="ah-stat-icon">{icon}</span>
          <b>{k === 'absent' && !begun ? '–' : t[k]}</b>
          <span>{k === 'absent' && !begun ? 'Absent · not yet' : label}</span>
        </div>
      ))}
    </div>
  );
}

function Tile({ g, on, begun, onPick }) {
  return (
    <button className={'ah-tile' + (on ? ' ah-tile-on' : '')} onClick={onPick}>
      <span className="ah-tile-ring"><Ring present={g.present} allotted={g.allotted} size={76} stroke={8} label={false} /><b>{pct(g.present, g.allotted)}%</b></span>
      <span className="ah-tile-name">{g.branch}</span>
      <span className="ah-tile-agency">{g.agency}{g.city ? ' · ' + g.city : ''}</span>
      <span className="ah-tile-nums">
        <em className="ah-n-green">✓ {g.present}/{g.allotted}</em>
        {begun && g.absent > 0 && <em className="ah-n-red">✕ {g.absent}</em>}
        {g.leave > 0 && <em className="ah-n-amber">L {g.leave}</em>}
      </span>
    </button>
  );
}

const SHIFT_ICON = { A: '☀️', G: '🕘', B: '🌇', C: '🌙' };
const STATE = { absent: ['Absent', 'ah-n-red'], due: ['Not IN yet', 'ah-n-grey'], present: ['IN', 'ah-n-green'], leave: ['Leave', 'ah-n-amber'], off: ['Week off', 'ah-n-grey'] };

export default function AdminHome({ hash }) {
  const [date, setDate] = useState(today);
  const [shift, setShift] = useState(runningShift);
  const [data, setData] = useState(null);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');
  const parts = (hash || '#home').split('/');
  const view = parts[1] === 'list' ? 'list' : parts[1] === 'g' ? 'group' : 'total';
  const [pickB, pickA] = view === 'group' ? (parts[2] || '').split('-') : ['', ''];

  const load = useCallback(async () => {
    setError('');
    try {
      setData((await api.strength(date, shift)).data);
    } catch (err) {
      setError(err.message);
    }
  }, [date, shift]);
  useEffect(() => { setData(null); load(); }, [load]);
  useEffect(() => {
    if (view !== 'group' || !pickB) { setDetail(null); return; }
    setDetail(null);
    api.strength(date, shift, pickB, pickA).then(r => setDetail((r.data.groups || []).find(g => g.branchId === pickB && g.agencyId === pickA) || { missing: true })).catch(err => setError(err.message));
  }, [view, pickB, pickA, date, shift]);

  const go = h => { window.location.hash = h; };
  const groups = data ? data.groups : [];
  const shiftObj = data ? data.shift : null;

  const controls = (
    <div className="ah-controls">
      <input type="date" value={date} max={today()} onChange={e => e.target.value && setDate(e.target.value)} aria-label="Date" />
      {view !== 'total' && <div className="ah-shifts" role="tablist">
        {(data ? data.shifts.map(s => s.code) : ['A', 'G', 'B', 'C']).sort((a, b) => 'AGBC'.indexOf(a) - 'AGBC'.indexOf(b)).map(c => (
          <button key={c} className={shift === c ? 'on' : ''} onClick={() => setShift(c)}>Shift {c}</button>
        ))}
      </div>}
      <button className="ah-refresh" onClick={load} aria-label="Refresh">↻</button>
    </div>
  );

  return (
    <div className="ah">
      <header className="ah-head">
        <div>
          <div className="ah-kicker">{view === 'total' ? 'Overall strength' : view === 'list' ? 'Branches & agencies' : 'Branch · agency'}</div>
          <h1>{niceDate(date)}</h1>
          {shiftObj && view !== 'total' && <div className="ah-sub">Shift {shiftObj.code} · {shiftObj.start} – {shiftObj.end}</div>}
          {view === 'total' && <div className="ah-sub">All branches and agencies in your area</div>}
        </div>
        {controls}
      </header>
      {error && <div className="ah-error">{error}</div>}
      {!data && !error && <div className="ah-loading">Loading…</div>}

      {data && view === 'total' && (
        <section className="ah-day">
          {/* The whole day first, then Shift A, G, B, C one line each, coming in one by one (Prem, 26 Oct). */}
          {(() => {
            const all = data.byShift.reduce((t, x) => ({ allotted: t.allotted + x.allotted, present: t.present + x.present, absent: t.absent + x.absent }), { allotted: 0, present: 0, absent: 0 });
            return (
              <div className="ah-daytotal">
                <div className="ah-daytotal-main">
                  <span className="ah-daytotal-label">Whole day</span>
                  <b>{all.present}<small> / {all.allotted}</small></b>
                  <span className="ah-daytotal-sub">guards came · {pct(all.present, all.allotted)}%</span>
                </div>
                <div className="ah-daytotal-chips">
                  <span className="ah-chip ah-n-red">❌ {all.absent} absent</span>
                  <span className="ah-chip ah-n-amber">🌴 {data.day.leave} leave</span>
                  <span className="ah-chip ah-n-grey">🛌 {data.day.off} week off</span>
                </div>
              </div>
            );
          })()}
          {data.byShift.map((x, i) => (
            <button key={x.code} className={'ah-shiftrow ah-sh-' + x.code + (x.code === runningShift() && date === today() ? ' ah-shiftrow-now' : '')} style={{ animationDelay: (0.12 + i * 0.15) + 's' }}
              onClick={() => { setShift(x.code); go('#home/list'); }}>
              <span className="ah-shift-badge">{SHIFT_ICON[x.code] || '🕘'}<b>{x.code}</b></span>
              <span className="ah-shift-name">
                <b>Shift {x.code}</b>
                <span>{x.start} – {x.end}{x.code === runningShift() && date === today() ? ' · now' : ''}</span>
              </span>
              <span className="ah-shift-bar">
                <span className="ah-bar"><span className="ah-bar-fill" style={{ width: pct(x.present, x.allotted) + '%' }}></span></span>
                <span className="ah-bar-text">{x.allotted ? pct(x.present, x.allotted) + '% present' : 'No guards'}</span>
              </span>
              <span className="ah-shift-nums">
                <span><b>{x.allotted}</b>Allotted</span>
                <span className="ah-green-t"><b>{x.present}</b>Present</span>
                <span className="ah-red-t"><b>{x.begun ? x.absent : '–'}</b>{x.begun ? 'Absent' : 'Not started'}</span>
              </span>
              <span className="ah-shift-go">›</span>
            </button>
          ))}
          <button className="ah-cta" onClick={() => go('#home/list')}>
            <span>🏢 Branches &amp; agencies</span><b>{groups.length}</b><span className="ah-cta-arrow">→</span>
          </button>
        </section>
      )}

      {data && view !== 'total' && (
        <section className={'ah-split' + (view === 'group' ? ' ah-split-on' : '')}>
          {view === 'group' && (
            <aside className="ah-detail">
              <button className="ah-back" onClick={() => go('#home/list')}>← All branches</button>
              {!detail && <div className="ah-loading">Loading…</div>}
              {detail && detail.missing && <div className="ah-loading">No guards for this branch · agency on this day.</div>}
              {detail && !detail.missing && (
                <>
                  <h2>{detail.branch}</h2>
                  <div className="ah-detail-agency">{detail.agency}{detail.city ? ' · ' + detail.city : ''}</div>
                  <div className="ah-detail-ring"><Ring present={detail.present} allotted={detail.allotted} size={150} stroke={14} /></div>
                  <Stats t={detail} begun={data.begun} />
                  <div className="ah-people">
                    {(detail.people || []).map((p, i) => (
                      <div key={i} className="ah-person">
                        <span className="ah-person-name"><b>{p.name}</b><span>{p.id}{p.post ? ' · ' + p.post : ''}</span></span>
                        <em className={STATE[p.state][1]}>{p.state === 'present' ? 'IN ' + p.in : STATE[p.state][0]}</em>
                      </div>
                    ))}
                    {detail.people && detail.people.length === 0 && <div className="ah-loading">Nobody on this shift.</div>}
                  </div>
                </>
              )}
            </aside>
          )}
          <div className="ah-grid-wrap">
            {view === 'list' && <button className="ah-back" onClick={() => go('#home')}>← Overall</button>}
            <div className="ah-grid">
              {groups.map(g => (
                <Tile key={g.branchId + '-' + g.agencyId} g={g} begun={data.begun} on={g.branchId === pickB && g.agencyId === pickA}
                  onPick={() => go('#home/g/' + g.branchId + '-' + g.agencyId)} />
              ))}
              {groups.length === 0 && <div className="ah-loading">No branch has guards on this day.</div>}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
