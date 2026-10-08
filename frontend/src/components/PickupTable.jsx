import Field from './Field.jsx';
import RouteCell from './RouteCell.jsx';
import TableHeader from './TableHeader.jsx';
import TableFooter from './TableFooter.jsx';
import { PICKUP_ROUTES, routeLocks } from '../utils.js';

// Sunday view: early-morning pickup sheet, 10 rows, Route 1 saved, Route 2 left blank for print.
export default function PickupTable({ pickupRows, actions }) {
  return (
    <div className="pickup-section page-block">
      <div className="pickup-title">Monday Morning Pickup (3:00 AM - 6:00 AM)</div>
      <table>
        <TableHeader rotation={PICKUP_ROUTES} />
        <tbody>
          {pickupRows.map((r, i) => {
            const textCell = (field, cls) => (
              <td className={cls}>
                <Field
                  value={r[field]}
                  onChange={v => actions.setPickupField(i, field, v)}
                  onCommit={() => actions.savePickup(i)}
                />
              </td>
            );
            const route1 = { loc: r.loc, out: r.out, in: r.in };
            return (
              <tr className="pickup-row" key={i}>
                <td className="rowno col-sno">P{i + 1}</td>
                {textCell('name', 'name col-name')}
                {textCell('agency')}
                {textCell('mobile')}
                {textCell('id')}
                <RouteCell
                  rec={route1}
                  locks={routeLocks([route1], 0)}
                  timeMode="typed"
                  onChange={(field, v) => actions.setPickupField(i, field, v)}
                  onCommit={() => actions.savePickup(i)}
                />
                {Array.from({ length: PICKUP_ROUTES - 1 }, (_, k) => <RouteCell key={k} timeMode="blank" />)}
                <td className="remarks">
                  <Field
                    textarea
                    rows={1}
                    value={r.remarks}
                    onChange={v => actions.setPickupField(i, 'remarks', v)}
                    onCommit={() => actions.savePickup(i)}
                  />
                </td>
                <td className="delcell-col no-print"></td>
              </tr>
            );
          })}
        </tbody>
        <TableFooter rotation={PICKUP_ROUTES} />
      </table>
    </div>
  );
}
