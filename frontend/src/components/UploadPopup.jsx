import { useState } from 'react';

// "Before Uploading Excel" — confirm Start Date, then open the file chooser.
export function UploadSetupPopup({ startDate, onCancel, onContinue }) {
  const [start, setStart] = useState(startDate);
  return (
    <div className="upload-setup-overlay">
      <div className="upload-setup-box">
        <div className="upload-setup-title">Before Uploading Excel</div>
        <div className="upload-setup-field">
          <label htmlFor="setupStartDate">Start Date</label>
          <input type="date" id="setupStartDate" value={start} onChange={e => setStart(e.target.value)} />
        </div>
        <div className="upload-setup-actions">
          <button className="upload-setup-cancel" onClick={onCancel}>Cancel</button>
          <button className="upload-setup-continue" onClick={() => onContinue(start)}>Continue</button>
        </div>
      </div>
    </div>
  );
}

// Upload status popup: loading spinner, success summary, or error message.
export default function UploadPopup({ state, onClose }) {
  return (
    <div className="upload-overlay">
      <div className="upload-box">
        {state.type === 'loading' && (
          <>
            <div className="upload-spinner"></div>
            <div className="upload-title">{state.message || 'Uploading...'}</div>
            <div className="upload-sub">Please wait, don't close this page</div>
          </>
        )}
        {state.type === 'success' && (
          <>
            <div className="upload-success-icon">✓</div>
            <div className="upload-title">Excel Sync Complete!</div>
            <div className="upload-summary">
              <div><span>Added</span><b>{state.summary.added}</b></div>
              <div><span>Reactivated</span><b>{state.summary.reactivated}</b></div>
              <div><span>Deactivated</span><b>{state.summary.deactivated}</b></div>
            </div>
            <button className="upload-ok-btn" onClick={onClose}>OK</button>
          </>
        )}
        {state.type === 'error' && (
          <>
            <div className="upload-error-icon">!</div>
            <div className="upload-title">Upload Failed</div>
            <div className="upload-error-text">{state.message}</div>
            <button className="upload-ok-btn" onClick={onClose}>OK</button>
          </>
        )}
      </div>
    </div>
  );
}
