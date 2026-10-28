// Every call to the escortAPI function goes through here.
const API_BASE = '/server/escortAPI';

async function apiCall(method, endpoint, body) {
  const options = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) options.body = JSON.stringify(body);
  const res = await fetch(API_BASE + endpoint, options);
  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error('Server returned ' + res.status);
  }
  // Signed out (session ended): AuthGate shows the login again.
  if (res.status === 401 && json.login) window.dispatchEvent(new Event('need-login'));
  // The function answers 400 + { status: 'failure' } on errors; treat that as a failed call.
  if (!res.ok || json.status !== 'success') {
    throw new Error(json.error || 'Request failed (' + res.status + ')');
  }
  return json;
}

const q = encodeURIComponent;

// Photo / video / voice: the file itself is the request body, the details go in the address.
async function uploadMedia(t, blob, { kind, source, duration, reply_to, post }) {
  const qs = 't=' + q(t) + '&kind=' + q(kind) + '&source=' + q(source) + '&duration=' + q(duration || 0) + (reply_to ? '&reply_to=' + q(reply_to) : '') + (post ? '&post=' + q(post) : '');
  const res = await fetch(API_BASE + '/uploadMedia?' + qs, { method: 'POST', headers: { 'Content-Type': blob.type || 'application/octet-stream' }, body: blob });
  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error('Upload failed (' + res.status + ')');
  }
  if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Upload failed (' + res.status + ')');
  return json;
}

// Office photo / video / voice to a post (signed-in; same rules as the guard's uploadMedia).
async function supMedia(post, blob, { kind, source, duration, reply_to }) {
  const qs = 'post=' + q(post) + '&kind=' + q(kind) + '&source=' + q(source) + '&duration=' + q(duration || 0) + (reply_to ? '&reply_to=' + q(reply_to) : '');
  const res = await fetch(API_BASE + '/supMedia?' + qs, { method: 'POST', headers: { 'Content-Type': blob.type || 'application/octet-stream' }, body: blob });
  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error('Upload failed (' + res.status + ')');
  }
  if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Upload failed (' + res.status + ')');
  return json;
}

// Agency group ("IPF Schedule"): a photo / video / voice to the group, by guard link (t) or office login.
async function groupMediaTo(path, params, blob, { kind, source, duration, reply_to }) {
  const qs = Object.entries({ ...params, kind, source, duration: duration || 0, reply_to: reply_to || '' })
    .filter(([, v]) => v !== '' && v !== null && v !== undefined).map(([k, v]) => k + '=' + q(v)).join('&');
  const res = await fetch(API_BASE + path + '?' + qs, { method: 'POST', headers: { 'Content-Type': blob.type || 'application/octet-stream' }, body: blob });
  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error('Upload failed (' + res.status + ')');
  }
  if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Upload failed (' + res.status + ')');
  return json;
}

// Vehicle photo of one entry, or a photo to read the number plate from: the photo is the body.
async function vehiclePhoto(path, blob) {
  const res = await fetch(API_BASE + path, { method: 'POST', headers: { 'Content-Type': blob.type || 'application/octet-stream' }, body: blob });
  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error('Photo upload failed (' + res.status + ')');
  }
  if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Photo upload failed (' + res.status + ')');
  return json;
}

export const api = {
  getEscorts: () => apiCall('GET', '/getEscorts'),
  addEscort: escort => apiCall('POST', '/addEscort', escort),
  updateEscort: escort => apiCall('PUT', '/updateEscort', escort),
  deleteEscort: rowid => apiCall('DELETE', '/deleteEscort?rowid=' + q(rowid)),

  getDutyRecords: date => apiCall('GET', '/getDutyRecords?date=' + q(date)),
  addDutyRecord: rec => apiCall('POST', '/addDutyRecord', rec),
  updateDutyRecord: rec => apiCall('PUT', '/updateDutyRecord', rec),
  deleteDutyRecord: rowid => apiCall('DELETE', '/deleteDutyRecord?rowid=' + q(rowid)),

  updateTripCab: cab => apiCall('PUT', '/updateTripCab', cab),
  getDashboard: (from, to) => apiCall('GET', '/getDashboard?from=' + q(from) + '&to=' + q(to)),
  getDayData: date => apiCall('GET', '/getDayData?date=' + q(date)),
  getTripStops: date => apiCall('GET', '/getTripStops?date=' + q(date)),
  addTripStop: stop => apiCall('POST', '/addTripStop', stop),
  updateTripStop: stop => apiCall('PUT', '/updateTripStop', stop),
  deleteTripStop: rowid => apiCall('DELETE', '/deleteTripStop?rowid=' + q(rowid)),

  getExtraDutyRecords: date => apiCall('GET', '/getExtraDutyRecords?date=' + q(date)),
  addExtraDutyRecord: rec => apiCall('POST', '/addExtraDutyRecord', rec),
  updateExtraDutyRecord: rec => apiCall('PUT', '/updateExtraDutyRecord', rec),

  getSundayPickupRecords: date => apiCall('GET', '/getSundayPickupRecords?date=' + q(date)),
  addSundayPickupRecord: rec => apiCall('POST', '/addSundayPickupRecord', rec),
  updateSundayPickupRecord: rec => apiCall('PUT', '/updateSundayPickupRecord', rec),

  getStartDate: () => apiCall('GET', '/getStartDate'),
  saveStartDate: value => apiCall('POST', '/saveStartDate', { value }),
  getLastUploadDate: () => apiCall('GET', '/getLastUploadDate'),
  markUploadDone: value => apiCall('POST', '/markUploadDone', { value }),

  getGuards: () => apiCall('GET', '/getGuards'),
  getMaster: () => apiCall('GET', '/getMaster'),
  getPosts: () => apiCall('GET', '/getPosts'),
  addPost: post => apiCall('POST', '/addPost', post),
  updatePost: post => apiCall('PUT', '/updatePost', post),
  postOrder: ids => apiCall('POST', '/postOrder', { ids }),
  getChart: (week, branch) => apiCall('GET', '/getChart?week=' + q(week || '') + (branch ? '&branch=' + q(branch) : '')),
  saveChart: row => apiCall('POST', '/saveChart', row),
  copyChart: (week, branch_id) => apiCall('POST', '/copyChart', { week, branch_id }),
  getFreeEscorts: keep => apiCall('GET', '/getFreeEscorts' + (keep ? '?keep=' + q(keep) : '')),
  addGuard: guard => apiCall('POST', '/addGuard', guard),
  updateGuard: guard => apiCall('PUT', '/updateGuard', guard),
  setGuardActive: (ROWID, active) => apiCall('PUT', '/setGuardActive', { ROWID, active }),
  guardPhotoUrl: guard => apiCall('GET', '/guardPhotoUrl?guard=' + q(guard)),
  guardPhoto: async (guard, file) => {
    const res = await fetch(API_BASE + '/guardPhoto?guard=' + q(guard), { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Photo upload failed (' + res.status + ')');
    return json;
  },
  addAccessLog: (guard_id, direction) => apiCall('POST', '/addAccessLog', { guard_id, direction }),
  getAccessLog: date => apiCall('GET', '/getAccessLog?date=' + q(date)),

  getGuardLinks: () => apiCall('GET', '/getGuardLinks'),
  createGuardLink: guard_id => apiCall('POST', '/createGuardLink', { guard_id }),
  resetGuardLink: guard_id => apiCall('POST', '/resetGuardLink', { guard_id }),
  guardInfo: token => apiCall('GET', '/guardInfo?t=' + q(token)),
  saveSubscription: (t, subscription, device) => apiCall('POST', '/saveSubscription', { t, subscription, device }),
  testPush: t => apiCall('POST', '/testPush', { t }),
  guardDay: (t, date) => apiCall('GET', '/guardDay?t=' + q(t) + (date ? '&date=' + q(date) : '')),
  guardSaveRoute: body => apiCall('POST', '/guardSaveRoute', body),
  guardSaveCab: body => apiCall('POST', '/guardSaveCab', body),
  guardAddStop: body => apiCall('POST', '/guardAddStop', body),
  guardUpdateStop: body => apiCall('POST', '/guardUpdateStop', body),
  guardDeleteStop: body => apiCall('POST', '/guardDeleteStop', body),

  postDuty: t => apiCall('GET', '/postDuty?t=' + q(t)),
  takeOver: t => apiCall('POST', '/takeOver', { t }),
  // `post` = another post the guard is covering during a break (empty = their own post).
  postTimeline: (t, post) => apiCall('GET', '/postTimeline?t=' + q(t) + (post ? '&post=' + q(post) : '')),
  postMessage: (t, text, reply_to, post) => apiCall('POST', '/postMessage', { t, text, reply_to, post }),
  pinMessage: (t, rowid, pinned, post) => apiCall('POST', '/pinMessage', { t, rowid, pinned, post }),
  forwardMessage: (t, rowid, post) => apiCall('POST', '/forwardMessage', { t, rowid, post }),
  addWork: (t, work, post) => apiCall('POST', '/addWork', { t, ...work, post }),
  finishWork: (t, rowid, post) => apiCall('POST', '/finishWork', { t, rowid, post }),
  safety: (t, post) => apiCall('GET', '/safety?t=' + q(t) + (post ? '&post=' + q(post) : '')),
  addSafety: (t, entry, post) => apiCall('POST', '/addSafety', { t, ...entry, post }),
  vehicles: (t, post) => apiCall('GET', '/vehicles?t=' + q(t) + (post ? '&post=' + q(post) : '')),
  vehicleIn: (t, entry, post) => apiCall('POST', '/vehicleIn', { t, ...entry, post }),
  vehicleOut: (t, id, post) => apiCall('POST', '/vehicleOut', { t, id, post }),
  vehiclePhoto: (t, id, blob, post) => vehiclePhoto('/vehiclePhoto?t=' + q(t) + '&id=' + q(id) + (post ? '&post=' + q(post) : ''), blob),
  vehiclePlate: (t, blob, post) => vehiclePhoto('/vehiclePlate?t=' + q(t) + (post ? '&post=' + q(post) : ''), blob),
  vehicleVoice: (t, blob, post, lang) => vehiclePhoto('/vehicleVoice?t=' + q(t) + '&lang=' + q(lang || 'ta-IN') + (post ? '&post=' + q(post) : ''), blob),
  vehicleKnown: (t, post) => apiCall('GET', '/vehicleKnown?t=' + q(t) + (post ? '&post=' + q(post) : '')),
  vehiclePhotoLink: (t, id, post) => apiCall('GET', '/vehiclePhotoLink?t=' + q(t) + '&id=' + q(id) + (post ? '&post=' + q(post) : '')),
  sendAlert: (t, text, post) => apiCall('POST', '/sendAlert', { t, text, post }),
  cancelAlert: (t, rowid, post) => apiCall('POST', '/cancelAlert', { t, rowid, post }),
  postHistory: (t, from, to, post) => apiCall('GET', '/postHistory?t=' + q(t) + '&from=' + q(from) + '&to=' + q(to) + (post ? '&post=' + q(post) : '')),
  postWorks: (t, from, to, post) => apiCall('GET', '/postWorks?t=' + q(t) + '&from=' + q(from) + '&to=' + q(to) + (post ? '&post=' + q(post) : '')),
  pastShift: (t, log, post) => apiCall('GET', '/pastShift?t=' + q(t) + '&log=' + q(log) + (post ? '&post=' + q(post) : '')),
  startGeneral: t => apiCall('POST', '/startGeneral', { t }),
  endGeneral: (t, note) => apiCall('POST', '/endGeneral', { t, note }),
  supInbox: (branch, seen, agency) => apiCall('POST', '/supInbox', { branch, seen, agency }),
  supPost: post => apiCall('GET', '/supPost?post=' + q(post)),
  shiftReport: (branch, date, agency) => apiCall('GET', '/shiftReport?branch=' + q(branch) + '&date=' + q(date) + (agency ? '&agency=' + q(agency) : '')),
  vehicleList: (branch, date, agency) => apiCall('GET', '/vehicleList?branch=' + q(branch) + '&date=' + q(date) + (agency ? '&agency=' + q(agency) : '')),
  vehicleAdd: entry => apiCall('POST', '/vehicleAdd', entry),
  vehicleMarkOut: id => apiCall('POST', '/vehicleMarkOut', { id }),
  vehicleDelete: id => apiCall('POST', '/vehicleDelete', { id }),
  vehiclePhotoAdd: (id, blob) => vehiclePhoto('/vehiclePhotoAdd?id=' + q(id), blob),
  vehiclePlateScan: blob => vehiclePhoto('/vehiclePlateScan', blob),
  vehicleVoiceText: (blob, lang) => vehiclePhoto('/vehicleVoiceText?lang=' + q(lang || 'ta-IN'), blob),
  vehicleKnownAt: post => apiCall('GET', '/vehicleKnownAt?post=' + q(post)),
  vehiclePhotoUrl: id => apiCall('GET', '/vehiclePhotoUrl?id=' + q(id)),
  dutyHistory: (branch, date) => apiCall('GET', '/dutyHistory?branch=' + q(branch) + '&date=' + q(date)),
  supBoard: (branch, shift, agency) => apiCall('GET', '/supBoard?branch=' + q(branch) + (shift ? '&shift=' + q(shift) : '') + (agency ? '&agency=' + q(agency) : '')),
  supVapid: () => apiCall('GET', '/supVapid'),
  supSubscribe: (branch, subscription, device) => apiCall('POST', '/supSubscribe', { branch, subscription, device }),
  // `agency` (optional): Branch Admin and above work on one agency's schedule at a time.
  schedule: (branch, date, agency) => apiCall('GET', '/schedule?branch=' + q(branch) + '&date=' + q(date) + (agency ? '&agency=' + q(agency) : '')),
  scheduleSet: (branch, date, post, shift, guard, agency) => apiCall('POST', '/scheduleSet', { branch, date, post, shift, guard, agency }),
  scheduleCopy: (branch, date, agency) => apiCall('POST', '/scheduleCopy', { branch, date, agency }),
  schedulePublish: (branch, date, agency) => apiCall('POST', '/schedulePublish', { branch, date, agency }),
  scheduleAuto: (branch, date, agency) => apiCall('POST', '/scheduleAuto', { branch, date, agency }),
  scheduleUpload: (branch, date, rows, agency) => apiCall('POST', '/scheduleUpload', { branch, date, rows, agency }),
  scheduleClear: (branch, date, agency) => apiCall('POST', '/scheduleClear', { branch, date, agency }),
  escortPoint: (branch, date, guard_id, point) => apiCall('POST', '/escortPoint', { branch, date, guard_id, point }),
  supMessage: (post, text, reply_to) => apiCall('POST', '/supMessage', { post, text, reply_to }),
  supMedia,
  strengthList: (date, list) => apiCall('GET', '/strength?date=' + q(date) + '&list=' + q(list)),
  strength: (date, shift, branch, agency) => apiCall('GET', '/strength?date=' + q(date) + '&shift=' + q(shift) + (branch ? '&branch=' + q(branch) + '&agency=' + q(agency || '') : '')),
  groupChat: t => apiCall('GET', '/groupChat?t=' + q(t)),
  groupSend: (t, text, reply_to) => apiCall('POST', '/groupSend', { t, text, reply_to }),
  groupMedia: (t, blob, opts) => groupMediaTo('/groupMedia', { t }, blob, opts),
  supGroup: (branch, agency) => apiCall('GET', '/supGroup?branch=' + q(branch) + (agency ? '&agency=' + q(agency) : '')),
  supGroupSend: (branch, agency, text, reply_to) => apiCall('POST', '/supGroupSend', { branch, agency, text, reply_to }),
  supGroupMedia: (branch, agency, blob, opts) => groupMediaTo('/supGroupMedia', { branch, agency: agency || '' }, blob, opts),
  supWork: (post, form) => apiCall('POST', '/supWork', { post, ...form }),
  coverCandidates: t => apiCall('GET', '/coverCandidates?t=' + q(t)),
  startBreak: (t, type, cover_guard_id) => apiCall('POST', '/startBreak', { t, type, cover_guard_id }),
  cancelBreak: t => apiCall('POST', '/cancelBreak', { t }),
  respondCover: (t, rowid, answer) => apiCall('POST', '/respondCover', { t, rowid, answer }),
  pingBack: (t, rowid) => apiCall('POST', '/pingBack', { t, rowid }),
  backOnDuty: t => apiCall('POST', '/backOnDuty', { t }),
  coverReturned: t => apiCall('POST', '/coverReturned', { t }),
  replyPing: (t, text) => apiCall('POST', '/replyPing', { t, text }),
  leaveCover: (t, rowid) => apiCall('POST', '/leaveCover', { t, rowid }),
  uploadMedia,

  syncEscortsFromExcel: escorts => apiCall('POST', '/syncEscortsFromExcel', { escorts }),
  getAllLocations: () => apiCall('GET', '/getAllLocations'),

  me: () => apiCall('GET', '/me'),
  agencies: () => apiCall('GET', '/agencies'),
  adminData: () => apiCall('GET', '/adminData'),
  userAdd: user => apiCall('POST', '/userAdd', user),
  userUpdate: user => apiCall('PUT', '/userUpdate', user),
  userActive: (ROWID, active) => apiCall('PUT', '/userActive', { ROWID, active }),
  userMail: ROWID => apiCall('POST', '/userMail', { ROWID }),
  userDelete: ROWID => apiCall('POST', '/userDelete', { ROWID }),
  branchSave: branch => apiCall('POST', '/branchSave', branch),
  agencySave: agency => apiCall('POST', '/agencySave', agency),
  stateSave: state => apiCall('POST', '/stateSave', state),
  roster: (branch, month, agency) => apiCall('GET', '/roster?branch=' + q(branch) + '&month=' + q(month) + (agency ? '&agency=' + q(agency) : '')),
  rosterUpload: (branch, month, entries, agency) => apiCall('POST', '/rosterUpload', { branch, month, entries, agency }),
  rosterRow: (branch, month, guard_id, codes, agency) => apiCall('POST', '/rosterRow', { branch, month, guard_id, codes, agency }),
  rosterSet: (branch, month, guard_id, day, code, agency) => apiCall('POST', '/rosterSet', { branch, month, guard_id, day, code, agency }),
  citySave: city => apiCall('POST', '/citySave', city)
};
