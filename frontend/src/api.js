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
  // `post` = another post the guard is covering during a break (empty = their own post).
  postTimeline: (t, post) => apiCall('GET', '/postTimeline?t=' + q(t) + (post ? '&post=' + q(post) : '')),
  postMessage: (t, text, reply_to, post) => apiCall('POST', '/postMessage', { t, text, reply_to, post }),
  pinMessage: (t, rowid, pinned, post) => apiCall('POST', '/pinMessage', { t, rowid, pinned, post }),
  forwardMessage: (t, rowid, post) => apiCall('POST', '/forwardMessage', { t, rowid, post }),
  addWork: (t, work, post) => apiCall('POST', '/addWork', { t, ...work, post }),
  finishWork: (t, rowid, post) => apiCall('POST', '/finishWork', { t, rowid, post }),
  safety: (t, post) => apiCall('GET', '/safety?t=' + q(t) + (post ? '&post=' + q(post) : '')),
  addSafety: (t, entry, post) => apiCall('POST', '/addSafety', { t, ...entry, post }),
  sendAlert: (t, text, post) => apiCall('POST', '/sendAlert', { t, text, post }),
  cancelAlert: (t, rowid, post) => apiCall('POST', '/cancelAlert', { t, rowid, post }),
  postHistory: (t, from, to, post) => apiCall('GET', '/postHistory?t=' + q(t) + '&from=' + q(from) + '&to=' + q(to) + (post ? '&post=' + q(post) : '')),
  postWorks: (t, from, to, post) => apiCall('GET', '/postWorks?t=' + q(t) + '&from=' + q(from) + '&to=' + q(to) + (post ? '&post=' + q(post) : '')),
  pastShift: (t, log, post) => apiCall('GET', '/pastShift?t=' + q(t) + '&log=' + q(log) + (post ? '&post=' + q(post) : '')),
  startGeneral: t => apiCall('POST', '/startGeneral', { t }),
  endGeneral: (t, note) => apiCall('POST', '/endGeneral', { t, note }),
  supInbox: (branch, seen) => apiCall('POST', '/supInbox', { branch, seen }),
  supPost: (post, name) => apiCall('GET', '/supPost?post=' + q(post) + (name ? '&name=' + q(name) : '')),
  supBoard: (branch, shift) => apiCall('GET', '/supBoard?branch=' + q(branch) + (shift ? '&shift=' + q(shift) : '')),
  supVapid: () => apiCall('GET', '/supVapid'),
  supSubscribe: (branch, name, subscription, device) => apiCall('POST', '/supSubscribe', { branch, name, subscription, device }),
  supMessage: (post, name, text) => apiCall('POST', '/supMessage', { post, name, text }),
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
  wipeAllData: () => apiCall('POST', '/wipeAllData')
};
