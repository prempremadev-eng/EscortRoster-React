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
  ['allotted', 'Allotted', 'ah-blue'],
  ['present', 'Present', 'ah-green'],
  ['absent', 'Absent', 'ah-red'],
  ['leave', 'Leave', 'ah-amber'],
  ['off', 'Week off', 'ah-grey']
];

function Stats({ t, begun }) {
  return (
    <div className="ah-stats">
      {STATS.map(([k, label, cls]) => (
        <div key={k} className={'ah-stat ' + cls}>
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
  // The guards behind a KPI number (present / absent / leave / week off), for the whole day.
  const [people, setPeople] = useState(null);
  async function openList(list, label) {
    setPeople({ label, rows: null });
    try {
      setPeople({ label, rows: (await api.strengthList(date, list)).data.people });
    } catch (err) {
      setPeople(null);
      setError(err.message);
    }
  }
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
      {people && (
        <div className="ah-dim" onClick={() => setPeople(null)}>
          <div className="ah-sheet" onClick={e => e.stopPropagation()} role="dialog" aria-label={people.label}>
            <div className="ah-sheet-head">
              <div><div className="ah-kicker">{niceDate(date)}</div><h2>{people.label}{people.rows ? ' · ' + people.rows.length : ''}</h2></div>
              <button className="ah-refresh" onClick={() => setPeople(null)} aria-label="Close">✕</button>
            </div>
            {!people.rows && <div className="ah-loading">Loading…</div>}
            {people.rows && people.rows.length === 0 && <div className="ah-loading">Nobody.</div>}
            {people.rows && (
              <div className="ah-list">
                {people.rows.map((p, i) => {
                  const group = p.branch + ' · ' + p.agency;
                  const head = i === 0 || group !== people.rows[i - 1].branch + ' · ' + people.rows[i - 1].agency;
                  return (
                    <div key={i}>
                      {head && <div className="ah-list-group">{group}</div>}
                      <div className="ah-person">
                        <span className="ah-person-name"><b>{p.name}</b><span>{p.id}{p.shift ? ' · Shift ' + p.shift : ''}{p.post ? ' · ' + p.post : ''}</span></span>
                        {p.state === 'present' && <em className="ah-n-green">IN {p.in}</em>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
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

      {data && view === 'total' && (() => {
        // Enterprise look (Prem, 26 Oct): a white KPI strip for the whole day, then one table line per
        // shift, no emoji; green / red only for present / absent.
        const all = data.byShift.reduce((t, x) => ({ allotted: t.allotted + x.allotted, present: t.present + x.present, out: t.out + (x.out || 0), absent: t.absent + x.absent }), { allotted: 0, present: 0, out: 0, absent: 0 });
        const now = date === today() ? runningShift() : '';
        const kpis = [
          ['Allotted', all.allotted, '', '', ''], ['IN', all.present, 'ah-k-green', pct(all.present, all.allotted) + '%', 'present'], ['OUT', all.out, '', '', ''],
          ['Absent', all.absent, 'ah-k-red', '', 'absent'], ['Leave', data.day.leave, '', '', 'leave'], ['Week off', data.day.off, '', '', 'off']
        ];
        return (
          <section className="ah-day">
            <div className="ah-kpis">
              {/* Tap a number → who they are (Prem, 26 Oct: "the 18 week off, which guards?"). */}
              {kpis.map(([label, n, cls, extra, list]) => {
                const Tag = list ? 'button' : 'div';
                return (
                  <Tag key={label} className={'ah-kpi ' + cls + (list ? ' ah-kpi-tap' : '')} onClick={list ? () => openList(list, label) : undefined}>
                    <span className="ah-kpi-label">{label}{list && <span className="ah-kpi-more">View ›</span>}</span>
                    <span className="ah-kpi-value">{n}{extra && <small>{extra}</small>}</span>
                  </Tag>
                );
              })}
            </div>
            <div className="ah-table" role="table">
              <div className="ah-tr ah-th" role="row">
                <span>Shift</span><span>Time</span><span className="ah-num">Allotted</span><span className="ah-num">IN</span><span className="ah-num">OUT</span><span className="ah-num">Absent</span><span className="ah-num">Leave</span><span className="ah-num">Off</span><span>Attendance</span><span></span>
              </div>
              {data.byShift.map((x, i) => (
                <button key={x.code} role="row" className={'ah-tr' + (x.code === now ? ' ah-tr-now' : '')} style={{ animationDelay: (0.05 + i * 0.08) + 's' }}
                  onClick={() => { setShift(x.code); go('#home/list'); }}>
                  <span className="ah-td-shift"><b className="ah-letter">{x.code}</b>{x.code === now && <em className="ah-now">● Now</em>}</span>
                  <span className="ah-td-time">{x.start} – {x.end}</span>
                  {/* Phone: the three numbers in one line (the columns are hidden there). */}
                  <span className="ah-mnums"><span><b>{x.allotted}</b>allotted</span><span className="ah-green-n"><b>{x.present}</b>IN</span><span><b>{x.out || 0}</b>OUT</span><span><b>{x.begun ? x.absent : '–'}</b>{x.begun ? 'absent' : 'not started'}</span><span><b>{x.leave || 0}</b>leave</span><span><b>{x.off || 0}</b>off</span></span>
                  <span className="ah-num">{x.allotted}</span>
                  <span className="ah-num ah-green-n">{x.present}</span>
                  <span className="ah-num">{x.out || 0}</span>
                  <span className={'ah-num' + (x.begun ? ' ah-red-n' : ' ah-muted')}>{x.begun ? x.absent : 'Not started'}</span>
                  <span className="ah-num">{x.leave || 0}</span>
                  <span className="ah-num">{x.off || 0}</span>
                  <span className="ah-att"><span className="ah-bar"><span className="ah-bar-fill" style={{ width: pct(x.present, x.allotted) + '%' }}></span></span><b>{x.allotted ? pct(x.present, x.allotted) + '%' : '–'}</b></span>
                  <span className="ah-go">›</span>
                </button>
              ))}
            </div>
            {groups.length > 1 && <div className="ah-actions">
              <button className="ah-btn" onClick={() => go('#home/list')}>View branches &amp; agencies ({groups.length}) →</button>
            </div>}
          </section>
        );
      })()}

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
