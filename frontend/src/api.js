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
  // The function answers 400 + { status: 'failure' } on errors; treat that as a failed call.
  if (!res.ok || json.status !== 'success') {
    throw new Error(json.error || 'Request failed (' + res.status + ')');
  }
  return json;
}

const q = encodeURIComponent;

// Photo / video / voice: the file itself is the request body, the details go in the address.
async function uploadMedia(t, blob, { kind, source, duration, reply_to }) {
  const qs = 't=' + q(t) + '&kind=' + q(kind) + '&source=' + q(source) + '&duration=' + q(duration || 0) + (reply_to ? '&reply_to=' + q(reply_to) : '');
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
  getChart: (week, branch) => apiCall('GET', '/getChart?week=' + q(week || '') + (branch ? '&branch=' + q(branch) : '')),
  saveChart: row => apiCall('POST', '/saveChart', row),
  copyChart: (week, branch_id) => apiCall('POST', '/copyChart', { week, branch_id }),
  getFreeEscorts: keep => apiCall('GET', '/getFreeEscorts' + (keep ? '?keep=' + q(keep) : '')),
  addGuard: guard => apiCall('POST', '/addGuard', guard),
  updateGuard: guard => apiCall('PUT', '/updateGuard', guard),
  setGuardActive: (ROWID, active) => apiCall('PUT', '/setGuardActive', { ROWID, active }),
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
  postTimeline: t => apiCall('GET', '/postTimeline?t=' + q(t)),
  postMessage: (t, text, reply_to) => apiCall('POST', '/postMessage', { t, text, reply_to }),
  pinMessage: (t, rowid, pinned) => apiCall('POST', '/pinMessage', { t, rowid, pinned }),
  forwardMessage: (t, rowid) => apiCall('POST', '/forwardMessage', { t, rowid }),
  addWork: (t, work) => apiCall('POST', '/addWork', { t, ...work }),
  finishWork: (t, rowid) => apiCall('POST', '/finishWork', { t, rowid }),
  safety: t => apiCall('GET', '/safety?t=' + q(t)),
  addSafety: (t, entry) => apiCall('POST', '/addSafety', { t, ...entry }),
  sendAlert: (t, text) => apiCall('POST', '/sendAlert', { t, text }),
  cancelAlert: (t, rowid) => apiCall('POST', '/cancelAlert', { t, rowid }),
  uploadMedia,

  syncEscortsFromExcel: escorts => apiCall('POST', '/syncEscortsFromExcel', { escorts }),
  getAllLocations: () => apiCall('GET', '/getAllLocations'),
  wipeAllData: () => apiCall('POST', '/wipeAllData')
};
