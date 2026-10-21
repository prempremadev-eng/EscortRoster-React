import { ROTATION } from '../utils.js';

// rosterDay: the list comes from the Month Roster (rotation from Monday), so Start Date and the
// Excel upload do nothing that day and are hidden.
export default function Toolbar({ startDate, dutyDate, onStartDate, onDutyDate, onUpload, onPrint, onGenerate, rosterDay }) {
  return (
    <div className="toolbar no-print">
      {!rosterDay && <div>
        <label htmlFor="startDate">Start Date:</label>
        <input type="date" id="startDate" value={startDate} onChange={e => onStartDate(e.target.value)} />
      </div>}
      <div>
        <label htmlFor="dutyDate">Date:</label>
        <input type="date" id="dutyDate" value={dutyDate} onChange={e => onDutyDate(e.target.value)} />
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
    </div>
  );
}
