import { ROTATION } from '../utils.js';

export default function Toolbar({ startDate, dutyDate, onStartDate, onDutyDate, onUpload, onPrint, onGenerate }) {
  return (
    <div className="toolbar no-print">
      <div>
        <label htmlFor="startDate">Start Date:</label>
        <input type="date" id="startDate" value={startDate} onChange={e => onStartDate(e.target.value)} />
      </div>
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
      <a className="btn secondary" href="#simulator">🪪 Card Simulator</a>
      <button className="btn secondary" onClick={onUpload}>Upload Excel</button>
      <button className="btn secondary" onClick={onPrint}>Print</button>
      <button className="btn" onClick={onGenerate}>Generate</button>
    </div>
  );
}
