import DesktopViewToggle from './DesktopView.jsx';
import { useRef } from 'react';
import { ROTATION, shortDate, plusDay } from '../utils.js';

// rosterDay: the list comes from the Month Roster (rotation from Monday), so Start Date and the
// Excel upload do nothing that day and are hidden.
export default function Toolbar({ startDate, dutyDate, onStartDate, onDutyDate, onUpload, onPrint, onGenerate, rosterDay }) {
  // Tap the date text to open the calendar (the date box itself is hidden: it showed the old MM/DD format).
  const picker = useRef(null);
  const openPicker = () => { const el = picker.current; if (!el) return; try { el.showPicker(); } catch { el.focus(); el.click(); } };
  return (
    <div className="toolbar no-print">
      {!rosterDay && <div>
        <label htmlFor="startDate">Start Date:</label>
        <input type="date" id="startDate" value={startDate} onChange={e => onStartDate(e.target.value)} />
      </div>}
      <div className="tb-date">
        <button className="btn secondary tb-day" onClick={() => onDutyDate(plusDay(dutyDate, -1))} aria-label="Previous day">‹</button>
        <button className="tb-day-text" onClick={openPicker} title="Pick a date">{shortDate(dutyDate)} 📅</button>
        <button className="btn secondary tb-day" onClick={() => onDutyDate(plusDay(dutyDate, 1))} aria-label="Next day">›</button>
        <input ref={picker} className="tb-picker" type="date" id="dutyDate" value={dutyDate} onChange={e => e.target.value && onDutyDate(e.target.value)} aria-label="Pick a date" tabIndex={-1} />
      </div>
      <div>
        <label>Rotation:</label>
        <span className="rotation-fixed" title="Fixed: 4 routes, seats move 4 per duty day">{ROTATION}</span>
      </div>
      <div className="spacer"></div>
      <a className="btn secondary" href="#dashboard">📊 Dashboard</a>
      {!rosterDay && <button className="btn secondary" onClick={onUpload}>Upload Excel</button>}
      <button className="btn secondary" onClick={onPrint}>Print</button>
      <button className="btn" onClick={onGenerate}>Generate</button>
      <DesktopViewToggle />
    </div>
  );
}
