import Field from './Field.jsx';
import { isTripComplete, routeStatusClass } from '../utils.js';

const timeFilter = v => v.replace(/[^0-9:]/g, '');

// One "Route N" cell: Location on top, Out | In below.
// timeMode 'picker' → Out/In are read-only and open the grid time picker on click.
// timeMode 'typed'  → Out/In are typed (Sunday pickup table).
// timeMode 'blank'  → nothing is saved (Sunday pickup Route 2 — left for handwriting on print).
// onOpenTrip (main duty table only) → after Out time, a bar shows the trip's employee entries.
export default function RouteCell({ rec = {}, locks = {}, saveState, timeMode = 'picker', stops = [], onChange, onCommit, onPickTime, onRetry, onOpenTrip }) {
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
      {onOpenTrip && rec.out && <TripBar rec={rec} stops={stops} onOpen={onOpenTrip} />}
    </td>
  );
}

function TripBar({ rec, stops, onOpen }) {
  // The trip row must exist in the Data Store before employees can point to it.
  if (!rec.ROWID) return <div className="trip-bar no-print">⏳</div>;
  const complete = isTripComplete(rec, stops);
  let cls = 'trip-bar no-print';
  let text = '👤 ' + stops.length + '  +';
  if (complete) {
    cls += ' done';
    text = '✅ 👤 ' + stops.length;
  } else if (rec.in) {
    cls += ' pending';
    text = '⚠️ Entry pending';
  }
  return (
    <button type="button" className={cls} onClick={e => { e.stopPropagation(); onOpen(); }}>{text}</button>
  );
}
