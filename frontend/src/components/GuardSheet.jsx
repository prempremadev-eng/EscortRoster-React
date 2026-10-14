import { useEffect, useRef, useState } from 'react';
import { RouteCard } from './GuardDuty.jsx';

const ROUTES = 4;

// The whole escort duty sheet of the day on the guard's phone, laid out like the supervisor's
// sheet. Every row is read only except the guard's own (⭐): tapping one of its route cells
// opens the editor for that route.
export default function GuardSheet({ token, testDate, sheet, routes, stops, onRoute, onStops }) {
  const [editing, setEditing] = useState(null);
  const box = useRef(null);
  const myRow = useRef(null);
  const auth = { t: token, ...(testDate ? { date: testDate } : {}) };

  // Open the sheet at the guard's own row (scrolls the table box only, not the page).
  useEffect(() => {
    if (box.current && myRow.current) {
      box.current.scrollTop = myRow.current.offsetTop - box.current.clientHeight / 2;
    }
  }, []);

  // Own row comes from the guard's saved trips, so a save shows at once.
  const myRec = n => routes.find(r => (parseInt(r.route_no, 10) || 1) === n) || null;
  const myCell = n => {
    const r = myRec(n);
    return r ? { loc: r.location || '', out: r.out_time || '', in: r.in_time || '' } : null;
  };
  const isOpen = n => {
    if (n === 1) return true;
    const prev = myRec(n - 1);
    return !!(prev && prev.out_time && prev.in_time);
  };

  const editRec = editing ? myRec(editing) : null;

  return (
    <>
      <div className="gsheet-scroll" ref={box}>
        <table className="gsheet">
          <thead>
            <tr>
              <th className="gsheet-sno">S.No</th>
              <th className="gsheet-name">Name of Escort</th>
              <th>Agency</th>
              {Array.from({ length: ROUTES }, (_, i) => <th key={i}>Route {i + 1}<div className="gsheet-sub">Out | In</div></th>)}
              <th>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {sheet.map(row => (
              <tr key={row.seat} ref={row.me ? myRow : null} className={row.me ? 'me' : ''}>
                <td className="gsheet-sno">{row.seat}</td>
                <td className="gsheet-name">
                  {row.me ? '⭐ ' : ''}{row.name}
                  {row.inTime && <div className="gsheet-in">✅ {row.inTime}</div>}
                </td>
                <td>{row.agency}</td>
                {Array.from({ length: ROUTES }, (_, i) => {
                  const n = i + 1;
                  const cell = row.me ? myCell(n) : row.routes[i];
                  const body = (
                    <>
                      <div className="gsheet-loc">{(cell && cell.loc) || (row.me && isOpen(n) ? '✏️ Tap' : '')}</div>
                      <div className="gsheet-times">{cell && cell.out ? cell.out + ' | ' + (cell.in || '…') : ''}</div>
                    </>
                  );
                  if (!row.me) return <td key={n} className="gsheet-route">{body}</td>;
                  return (
                    <td key={n} className={'gsheet-route mine' + (isOpen(n) ? '' : ' locked')}>
                      <button type="button" disabled={!isOpen(n)} onClick={() => setEditing(n)} title={isOpen(n) ? 'Edit Route ' + n : 'Route ' + (n - 1) + ' needs Out and In first'}>
                        {isOpen(n) ? body : '🔒'}
                      </button>
                    </td>
                  );
                })}
                <td className="gsheet-remarks">{row.remarks}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="grid-picker-overlay" onClick={e => { if (e.target === e.currentTarget) setEditing(null); }}>
          <div className="trip-box gsheet-editor">
            <div className="trip-header">
              <div className="trip-title">Route {editing}</div>
              <button type="button" className="trip-close" onClick={() => setEditing(null)}>&times;</button>
            </div>
            <RouteCard
              key={(editRec && editRec.ROWID) || 'new-' + editing}
              n={editing}
              open={isOpen(editing)}
              rec={editRec}
              stops={editRec ? stops.filter(s => String(s.duty_record_id) === String(editRec.ROWID)) : []}
              auth={auth}
              onRoute={onRoute}
              onStops={onStops}
            />
          </div>
        </div>
      )}
    </>
  );
}
