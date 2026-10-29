"use strict"

/* ---------------- LOGIN + ROLES ---------------- */
// Guards never log in: their routes are protected by the secret link (?t=). Every other route
// needs a Catalyst Authentication login AND a row in UserRoles that says what the person may see.
//
//   super_admin  everything, can add other super admins
//   admin        everything
//   city_admin   every branch of one city
//   branch_admin one branch, every agency
//   supervisor   one branch, only the posts and guards of one agency
//
// A higher role creates the lower ones, always inside its own area.

// State Admin added on 23 Oct (notes/ROLES-FLOW.md): one state, between City Admin and Admin.
const ROLES = ['supervisor', 'branch_admin', 'city_admin', 'state_admin', 'admin', 'super_admin'];
const RANK = {};
ROLES.forEach((r, i) => { RANK[r] = i + 1; });
const ROLE_NAME = { supervisor: 'Supervisor', branch_admin: 'Branch Admin', city_admin: 'City Admin', state_admin: 'State Admin', admin: 'Admin', super_admin: 'Super Admin' };

// Who does the work (notes/ROLES-FLOW.md, 23 Oct): Supervisor and Branch Admin change things; City and
// State Admin only watch; an Admin only sets up (users, places, agencies) and runs the card simulator.
// The Super Admin (app owner) may do everything. POSTs that only read or subscribe stay open to all.
const VIEW_ONLY = new Set(['city_admin', 'state_admin']);
const SETUP_ROUTES = new Set(['/userAdd', '/userUpdate', '/userActive', '/userMail', '/userDelete', '/branchSave', '/citySave', '/stateSave', '/agencySave', '/addAccessLog']);
const READ_POSTS = new Set(['/supInbox', '/supSubscribe']);
// Escort sheet reads: only for logins whose branch has the Escort team (Prem, 25 Oct: other agencies of the
// same branch may look; nobody from another branch).
const ESCORT_READS = new Set(['/getEscorts', '/getDutyRecords', '/getDashboard', '/getDayData', '/getTripStops', '/getExtraDutyRecords',
  '/getSundayPickupRecords', '/getStartDate', '/getLastUploadDate', '/getFreeEscorts']);
// Escort sheet changes: a supervisor only when their agency has the Escort team (others only look).
const ESCORT_WRITES = new Set(['/addDutyRecord', '/updateDutyRecord', '/deleteDutyRecord', '/addExtraDutyRecord', '/updateExtraDutyRecord',
  '/addSundayPickupRecord', '/updateSundayPickupRecord', '/addTripStop', '/updateTripStop', '/deleteTripStop', '/updateTripCab',
  '/addEscort', '/updateEscort', '/deleteEscort', '/escortPoint', '/saveStartDate', '/markUploadDone', '/syncEscortsFromExcel']);

// Guard screens the office opens too, read only (Prem, 25 Oct: what the guard sees at the post, the admin
// sees): without a guard link they need a login and the post must be in the area.
const OFFICE_VIEWS = new Set(['/safety', '/postHistory', '/postWorks', '/pastShift']);

// Routes a guard's phone calls with its secret link. Everything else needs a login.
const GUARD_ROUTES = new Set([
  '/guardInfo', '/saveSubscription', '/testPush',
  '/guardDay', '/guardSaveRoute', '/guardSaveCab', '/guardAddStop', '/guardUpdateStop', '/guardDeleteStop',
  '/postDuty', '/takeOver', '/startGeneral', '/endGeneral', '/postTimeline', '/postMessage', '/uploadMedia',
  '/pinMessage', '/forwardMessage', '/addWork', '/finishWork', '/safety', '/addSafety', '/sendAlert', '/cancelAlert',
  '/postHistory', '/postWorks', '/pastShift', '/groupChat', '/groupSend', '/groupMedia',
  '/coverCandidates', '/startBreak', '/cancelBreak', '/respondCover', '/pingBack', '/replyPing', '/backOnDuty',
  '/coverReturned', '/leaveCover', '/qrSite', '/qrChallenge', '/qrCheck', '/qrPunch', '/qrReliever', '/vehicles', '/vehicleIn', '/vehicleOut', '/vehiclePhoto', '/vehiclePhotoLink', '/vehiclePlate', '/vehicleVoice', '/vehicleKnown'
]);

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const CACHE_MS = 60 * 1000;

module.exports = function auth(catalyst, selectAll) {
  // Kept while this function instance stays warm: one UserRoles read per person per minute,
  // one Branches read per 5 minutes (every login check would cost Data Store reads otherwise).
  const roleCache = new Map();
  let branchCache = { at: 0, rows: [] };

  async function branchList(zcql) {
    if (Date.now() - branchCache.at > 5 * CACHE_MS) {
      const rows = await selectAll(zcql, 'Branches', 'SELECT ROWID, branch_code, branch_name, company, country, state, city, city_id, area, supervisor_phone, is_active FROM Branches ORDER BY branch_code ASC');
      branchCache = { at: Date.now(), rows };
    }
    return branchCache.rows;
  }
  function forgetBranches() {
    branchCache = { at: 0, rows: [] };
  }
  function forgetUser(email) {
    roleCache.delete(String(email || '').toLowerCase());
  }

  // The Catalyst user of this request, or null when nobody is signed in.
  async function signedIn(req) {
    // No session cookie and no Authorization token = an anonymous visitor. Checked first so an
    // anonymous call can never be read as the project owner.
    const h = req.headers || {};
    if (!h.cookie && !h.authorization) return null;
    try {
      const u = await catalyst.initialize(req, { scope: 'user' }).userManagement().getCurrentUser();
      return u && u.email_id ? u : null;
    } catch {
      return null;
    }
  }

  async function roleOf(zcql, email) {
    const key = email.toLowerCase();
    const hit = roleCache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.row;
    const rows = await zcql.executeZCQLQuery(`SELECT * FROM UserRoles WHERE email = '${key}' AND is_active = true`);
    const row = rows.length ? rows[0].UserRoles : null;
    roleCache.set(key, { at: Date.now(), row });
    return row;
  }

  // What this person may see: all branches, or a set of branch ROWIDs, and maybe one agency.
  function scopeOf(role, branches) {
    const all = RANK[role.role] >= RANK.admin;
    let ids = [];
    if (!all) {
      if (role.role === 'city_admin') ids = branches.filter(b => String(b.city || '').toLowerCase() === String(role.city || '').toLowerCase()).map(b => String(b.ROWID));
      else if (role.role === 'state_admin') ids = branches.filter(b => String(b.state || '').toLowerCase() === String(role.state || '').toLowerCase()).map(b => String(b.ROWID));
      else if (role.branch_id) ids = [String(role.branch_id)];
    }
    return {
      all,
      branches: new Set(ids),
      agency: role.role === 'supervisor' && role.agency_id ? String(role.agency_id) : null
    };
  }

  // Express middleware: guard routes pass; the rest get req.user (+ req.scope) or a 401 / 403.
  async function middleware(req, res, next) {
    // The post screens the office may also open (no guard link → the office login decides).
    if (GUARD_ROUTES.has(req.path) && !(OFFICE_VIEWS.has(req.path) && !req.query.t)) return next();
    try {
      const user = await signedIn(req);
      if (!user) return res.status(401).json({ status: 'failure', error: 'Please sign in.', login: true });
      const zcql = catalyst.initialize(req, { scope: 'admin' }).zcql();
      const email = String(user.email_id).toLowerCase();
      const role = EMAIL_RE.test(email) ? await roleOf(zcql, email) : null;
      req.login = { email, user_id: String(user.user_id || ''), name: [user.first_name, user.last_name].filter(Boolean).join(' ') };
      if (!role || !RANK[role.role]) {
        if (req.path === '/me') return next();
        return res.status(403).json({ status: 'failure', error: 'Your login has no role yet. Ask your admin to give you access.', noRole: true });
      }
      req.user = {
        email, name: role.name || req.login.name || email, role: role.role, rank: RANK[role.role],
        city: role.city || '', state: role.state || '', branch_id: role.branch_id ? String(role.branch_id) : '', agency_id: role.agency_id ? String(role.agency_id) : '',
        rowid: String(role.ROWID)
      };
      req.scope = scopeOf(role, await branchList(zcql));
      // Branch Admin and above may look at one agency at a time (Schedule page agency picker, Prem 25 Oct):
      // the same agency filter a supervisor always has then applies to that request.
      const pickAgency = req.query.agency || (req.body && req.body.agency);
      if (role.role !== 'supervisor' && /^[0-9]+$/.test(String(pickAgency || ''))) req.scope.agency = String(pickAgency);
      if (req.method !== 'GET' && !READ_POSTS.has(req.path)
        && (VIEW_ONLY.has(role.role) || (role.role === 'admin' && !SETUP_ROUTES.has(req.path)))) {
        return res.status(403).json({ status: 'failure', error: 'View only: ' + ROLE_NAME[role.role] + ' can see this, but the Branch Admin or Supervisor makes the change.' });
      }
      if (!req.scope.all && ESCORT_READS.has(req.path)) {
        // ROWIDs stay text: Number() rounds 17 digits (50225000000094413 → …94420) and matched no branch.
        const ids = [...req.scope.branches].filter(id => /^[0-9]+$/.test(id));
        const team = ids.length ? await zcql.executeZCQLQuery(`SELECT ROWID FROM Guards WHERE branch_id IN (${ids.join(', ')}) AND area = 'Escort' LIMIT 1`) : [];
        if (!team.length) return res.status(403).json({ status: 'failure', error: 'No escort duty in your branch.' });
      }
      if (role.role === 'supervisor' && ESCORT_WRITES.has(req.path)) {
        const team = await zcql.executeZCQLQuery(`SELECT ROWID FROM Guards WHERE agency_id = ${/^[0-9]+$/.test(String(role.agency_id || '')) ? role.agency_id : 0} AND area = 'Escort' LIMIT 1`);
        if (!team.length) return res.status(403).json({ status: 'failure', error: 'View only: the escort sheet is changed by the shift incharge of the escort agency.' });
      }
      next();
    } catch (err) {
      res.status(400).json({ status: 'failure', error: err.message || String(err) });
    }
  }

  /* ---- checks used by the routes (each throws a plain message) ---- */

  function need(req, role) {
    if (!req.user || req.user.rank < RANK[role]) throw new Error('Only ' + ROLE_NAME[role] + ' or higher can do this.');
  }
  function branchOk(req, branchId) {
    return !!req.scope && (req.scope.all || req.scope.branches.has(String(branchId)));
  }
  function requireBranch(req, branchId) {
    if (!branchOk(req, branchId)) throw new Error('This branch is not in your area.');
    return branchId;
  }
  // A post or guard row: its branch must be in the area, and for a supervisor its agency must match.
  function rowOk(req, row) {
    if (!row || !branchOk(req, row.branch_id)) return false;
    return !req.scope.agency || String(row.agency_id || '') === req.scope.agency;
  }
  function requireRow(req, row, what) {
    if (!rowOk(req, row)) throw new Error('This ' + (what || 'item') + ' is not in your area.');
    return row;
  }
  // Extra ZCQL condition that keeps a supervisor to their agency ('' for everyone else).
  function agencyWhere(req) {
    return req.scope && req.scope.agency ? ` AND agency_id = ${req.scope.agency}` : '';
  }
  // ROWID list of the branches in the area, for "WHERE branch_id IN (...)"; null = every branch.
  function branchIn(req) {
    if (req.scope.all) return null;
    return [...req.scope.branches];
  }
  function inArea(req, rows) {
    return rows.filter(r => rowOk(req, r));
  }

  return {
    ROLES, RANK, ROLE_NAME, EMAIL_RE,
    middleware, branchList, forgetBranches, forgetUser,
    need, branchOk, requireBranch, rowOk, requireRow, agencyWhere, branchIn, inArea
  };
};
