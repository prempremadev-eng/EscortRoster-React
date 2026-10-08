import Field from './Field.jsx';
import { routeStatusClass } from '../utils.js';

const timeFilter = v => v.replace(/[^0-9:]/g, '');

// One "Route N" cell: Location on top, Out | In below.
// timeMode 'picker' → Out/In are read-only and open the grid time picker on click.
// timeMode 'typed'  → Out/In are typed (Sunday pickup table).
// timeMode 'blank'  → nothing is saved (Sunday pickup Route 2 — left for handwriting on print).
export default function RouteCell({ rec = {}, locks = {}, saveState, timeMode = 'picker', onChange, onCommit, onPickTime, onRetry }) {
  const cls = ['routecell', routeStatusClass(rec.out, rec.in)];
  if (saveState === 'saving') cls.push('route-saving');
  if (saveState === 'failed') cls.push('route-failed');

  if (timeMode === 'blank') {
    return (
      <td colSpan={2} className="routecell">
        <input type="text" className="loc-input" placeholder="Location" readOnly />
        <div className="bottom-row">
          <input type="text" placeholder="Out" readOnly />
          <input type="text" placeholder="In" readOnly />
        </div>
      </td>
    );
  }

  const timeInput = (field, placeholder, disabled) => timeMode === 'picker' ? (
    <input
      type="text"
      readOnly
      placeholder={placeholder}
      value={rec[field] || ''}
      disabled={disabled}
      onClick={() => { if (!disabled) onPickTime(field, placeholder === 'Out' ? 'Out Time' : 'In Time'); }}
    />
  ) : (
    <Field
      inputMode="numeric"
      placeholder={placeholder}
      value={rec[field]}
      disabled={disabled}
      filter={timeFilter}
      onChange={v => onChange(field, v)}
      onCommit={onCommit}
    />
  );

  return (
    <td
      colSpan={2}
      className={cls.filter(Boolean).join(' ')}
      onClick={() => { if (saveState === 'failed' && onRetry) onRetry(); }}
    >
      <Field
        className="loc-input"
        placeholder="Location"
        list="locationSuggestions"
        value={rec.loc}
        disabled={locks.locDisabled}
        onChange={v => onChange('loc', v)}
        onCommit={onCommit}
      />
      <div className="bottom-row">
        {timeInput('out', 'Out', locks.outDisabled)}
        {timeInput('in', 'In', locks.inDisabled)}
      </div>
    </td>
  );
}
