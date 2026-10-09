export default function Toolbar({ startDate, dutyDate, rotation, onStartDate, onDutyDate, onRotation, onUpload, onPrint, onGenerate }) {
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
        <label htmlFor="rotation">Rotation:</label>
        <input type="number" id="rotation" min="1" max="8" value={rotation} onChange={e => onRotation(e.target.value)} />
      </div>
      <div className="spacer"></div>
      <a className="btn secondary" href="#dashboard">📊 Dashboard</a>
      <button className="btn secondary" onClick={onUpload}>Upload Excel</button>
      <button className="btn secondary" onClick={onPrint}>Print</button>
      <button className="btn" onClick={onGenerate}>Generate</button>
    </div>
  );
}
