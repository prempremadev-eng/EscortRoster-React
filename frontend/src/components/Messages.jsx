export function LeaveMessage() {
  return <div className="leave-message">🚫 Today is Leave — No Duty Scheduled</div>;
}

export function UploadPrompt({ onUpload, onAlreadyUploaded }) {
  return (
    <div className="upload-prompt">
      <div className="upload-prompt-text">📋 Please upload today's Excel roster</div>
      <div className="upload-prompt-buttons">
        <button className="upload-prompt-upload" onClick={onUpload}>Upload Excel</button>
        <button className="upload-prompt-done" onClick={onAlreadyUploaded}>Already Uploaded</button>
      </div>
    </div>
  );
}

export function MondayReminder() {
  return <div className="monday-reminder no-print">📋 Please upload today's Excel roster</div>;
}
