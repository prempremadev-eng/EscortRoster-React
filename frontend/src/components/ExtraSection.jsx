import Field from './Field.jsx';
import RouteCell from './RouteCell.jsx';
import TableHeader from './TableHeader.jsx';
import { routeLocks } from '../utils.js';

// "Extra Escorts (Today Only)" — screen only, not printed.
export default function ExtraSection({ extraRows, rotation, actions }) {
  const visible = extraRows.filter(r => !r.deleted);
  if (visible.length === 0) return null;

  return (
    <div className="extra-section page-block no-print">
      <div className="extra-title">Extra Escorts (Today Only)</div>
      <table>
        <TableHeader rotation={rotation} />
        <tbody>
          {visible.map((r, i) => {
            const textCell = (field, cls) => (
              <td className={cls}>
                <Field
                  value={r[field]}
                  onChange={v => actions.setExtraField(r.uid, field, v)}
                  onCommit={() => actions.saveExtraMeta(r.uid)}
                />
              </td>
            );
            return (
              <tr className="extra-row" key={r.uid}>
                <td className="rowno col-sno">E{i + 1}</td>
                {textCell('name', 'name col-name')}
                {textCell('agency')}
                {textCell('mobile')}
                {textCell('id')}
                {Array.from({ length: rotation }, (_, i2) => (
                  <RouteCell
                    key={i2}
                    rec={r.routes[i2]}
                    locks={routeLocks(r.routes, i2)}
                    onChange={(field, v) => actions.setExtraRouteField(r.uid, i2, field, v)}
                    onCommit={() => actions.saveExtraRoute(r.uid, i2)}
                    onPickTime={(field, label) => actions.pickExtraTime(r.uid, i2, field, label)}
                  />
                ))}
                <td className="remarks">
                  <Field
                    textarea
                    rows={1}
                    value={r.remarks}
                    onChange={v => actions.setExtraField(r.uid, 'remarks', v)}
                    onCommit={() => actions.saveExtraMeta(r.uid)}
                  />
                </td>
                <td className="delcell-col no-print">
                  <button className="delcell" onClick={() => actions.deleteExtra(r.uid)}>&times;</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
