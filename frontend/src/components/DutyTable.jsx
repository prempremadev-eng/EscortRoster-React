import Field from './Field.jsx';
import RouteCell from './RouteCell.jsx';
import TableHeader from './TableHeader.jsx';
import TableFooter from './TableFooter.jsx';
import { PAGE_SIZE, formatLongDate, routeLocks } from '../utils.js';

// Main duty sheet: one page-block (header + 15 rows + footer) per printed A4 page.
// title: "6 to 5" / "9 to 6" on Month Roster days. lockDetails: name, agency, mobile and ID come from
// Guard Master then, so they show as text and the row has no remove button.
export default function DutyTable({ displayRows, duty, stops, rotation, dutyDate, cellStatus, actions, title, lockDetails }) {
  const totalPages = Math.max(1, Math.ceil(displayRows.length / PAGE_SIZE));
  const dateText = formatLongDate(dutyDate);
  const pages = Array.from({ length: totalPages }, (_, p) => p);

  return pages.map(p => {
    const startIdx = p * PAGE_SIZE;
    const pageRows = displayRows.slice(startIdx, startIdx + PAGE_SIZE);
    return (
      <div className="page-block" key={p}>
        <div className="print-page-header">
          <span className="print-title">Escort Duty Sheet{title ? ' · ' + title : ''}</span>
          <span className="print-date">{dateText}</span>
        </div>
        <div className="page-label no-print">
          <span>{title ? <b>{title} · </b> : null}Page {p + 1} of {totalPages}</span>
          <span>{dateText}</span>
        </div>
        <table>
          <TableHeader rotation={rotation} />
          <tbody>
            {pageRows.map((r, i) => (
              <EscortRow
                key={r.ROWID}
                r={r}
                seatNo={r.seat || startIdx + i + 1}
                lockDetails={lockDetails}
                entry={duty[String(r.ROWID)]}
                stops={stops}
                rotation={rotation}
                cellStatus={cellStatus}
                actions={actions}
              />
            ))}
          </tbody>
          <TableFooter rotation={rotation} />
        </table>
        <div className="page-bottom-label">😇Operation D</div>
      </div>
    );
  });
}

function EscortRow({ r, seatNo, entry, stops, rotation, cellStatus, actions, lockDetails }) {
  const routes = (entry && entry.routes) || [];
  const remarks = (entry && entry.remarks) || '';
  const id = String(r.ROWID);

  const textCell = (field, cls) => lockDetails ? <td className={cls}>{r[field]}</td> : (
    <td className={cls}>
      <Field
        value={r[field]}
        onChange={v => actions.setEscortField(id, field, v)}
        onCommit={() => actions.saveEscort(id)}
      />
    </td>
  );

  return (
    <tr>
      <td className="rowno col-sno">{seatNo}</td>
      {textCell('name', 'name col-name')}
      {textCell('agency')}
      {textCell('mobile')}
      {textCell('id')}
      {Array.from({ length: rotation }, (_, i) => (
        <RouteCell
          key={i}
          rec={routes[i]}
          locks={routeLocks(routes, i)}
          saveState={cellStatus['m-' + id + '-' + i]}
          onChange={(field, v) => actions.setRouteField(id, i, field, v)}
          onCommit={() => actions.saveRoute(id, i, seatNo, true)}
          onPickTime={(field, label) => actions.pickRouteTime(id, i, seatNo, field, label)}
          onRetry={() => actions.saveRoute(id, i, seatNo, true)}
          stops={(routes[i] && stops[String(routes[i].ROWID)]) || []}
          onOpenTrip={() => actions.openTrip(id, i)}
        />
      ))}
      <td className="remarks">
        <Field
          textarea
          rows={1}
          value={remarks}
          onChange={v => actions.setRemarks(id, v)}
          onCommit={() => actions.saveRoute(id, 0, seatNo, false)}
        />
      </td>
      <td className="delcell-col no-print">
        {!lockDetails && <button className="delcell" title="Remove escort" onClick={() => actions.deleteEscort(id)}>&times;</button>}
      </td>
    </tr>
  );
}
