'use strict';

/* ---------------- HISTORY LOG (AuditLog, Prem 5 Nov) ---------------- */
// "Any changes like publish, post creation, new guard add — record maintain pannanum." One middleware
// writes a row after every successful office change listed in ACTIONS: when, who (name + role), what,
// branch / agency, a short target and the request fields (never phone, Aadhaar, photo, token, PIN).
// Rows are never deleted (Prem: keep records forever). The office reads them on 📜 History log
// (Admin + Branch Admin).

const ACTIONS = {
  '/schedulePublish': ['Schedule published', b => b.date],
  '/scheduleAuto': ['Auto fill run', b => b.date],
  '/scheduleCopy': ['Copied from yesterday', b => b.date],
  '/scheduleClear': ['Day cleared', b => b.date],
  '/scheduleSet': ['Schedule changed', b => [b.date, b.shift_code].filter(Boolean).join(' · ')],
  '/rosterUpload': ['Month roster uploaded', b => b.month],
  '/rosterRow': ['Month roster row changed', b => b.month],
  '/rosterSet': ['Month roster changed', b => b.month],
  '/addPost': ['Post created', b => b.post_name],
  '/updatePost': ['Post edited', b => b.post_name],
  '/deletePost': ['Post deleted', b => b.ROWID || b.id],
  '/postOrder': ['Posts reordered', () => ''],
  '/addGuard': ['Guard added', b => b.guard_name],
  '/updateGuard': ['Guard edited', b => b.guard_name],
  '/setGuardActive': ['Guard switched ' + 'on/off', b => b.guard_name || b.ROWID],
  '/guardImport': ['Guards imported', b => (Array.isArray(b.rows) ? b.rows.length + ' rows' : '')],
  '/setupImport': ['Branch imported', () => ''],
  '/userAdd': ['Login added', b => b.email],
  '/userUpdate': ['Login changed', b => b.email || b.rowid],
  '/userActive': ['Login on/off', b => b.email || b.rowid],
  '/userDelete': ['Login deleted', b => b.email || b.rowid],
  '/branchSave': ['Branch saved', b => b.branch_name],
  '/agencySave': ['Agency saved', b => b.agency_name]
};
const SECRET = /aadhaar|phone|mobile|photo|token|password|pin|secret|key|face|image|data_url|file/i;

module.exports = function auditRoutes(app, h) {
  const { catalyst, selectAll, requireDate, fail, auth } = h;
  const stamp = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 16).replace('T', ' ');

  // Small, safe copy of the request body: no secrets, no big lists, at most 2000 letters.
  function brief(b) {
    const out = {};
    Object.keys(b || {}).forEach(k => {
      if (SECRET.test(k)) return;
      const v = b[k];
      if (Array.isArray(v)) out[k] = '[' + v.length + ' items]';
      else if (v && typeof v === 'object') out[k] = '{…}';
      else if (v !== undefined && v !== '') out[k] = String(v).slice(0, 120);
    });
    return JSON.stringify(out).slice(0, 2000);
  }

  async function write(req, label, target) {
    try {
      const catalystApp = catalyst.initialize(req, { scope: 'admin' });
      const b = req.body || {};
      const num = v => (/^[0-9]+$/.test(String(v || '')) ? String(v) : null);
      await catalystApp.datastore().table('AuditLog').insertRow({
        at: stamp(), who: String(req.user.name || req.user.email).slice(0, 100), role: req.user.role,
        action: label, branch_id: num(b.branch_id || b.branch || req.user.branch_id), agency_id: num(b.agency_id || b.agency || req.user.agency_id),
        target: String(target || '').slice(0, 150), details: brief(b)
      });
    } catch (err) {
      console.error('Audit log write failed:', err.message || err);
    }
  }

  // After auth (req.user set): watch the reply; a success writes the row. Never blocks the change itself.
  app.use((req, res, next) => {
    const a = ACTIONS[req.path];
    if (!a || req.method === 'GET' || !req.user) return next();
    const json = res.json.bind(res);
    res.json = body => {
      if (res.statusCode < 300 && body && body.status === 'success') {
        let target = '';
        try { target = a[1](req.body || {}) || ''; } catch { /* keep empty */ }
        write(req, a[0], target);
      }
      return json(body);
    };
    next();
  });

  // 📜 History log page: Admin + Branch Admin (Prem, 5 Nov), their area only, newest first.
  app.get('/auditLog', async (req, res) => {
    try {
      auth.need(req, 'branch_admin');
      const zcql = catalyst.initialize(req, { scope: 'admin' }).zcql();
      const from = requireDate(req.query.from), to = requireDate(req.query.to || req.query.from);
      const rows = await selectAll(zcql, 'AuditLog', `SELECT ROWID, at, who, role, action, branch_id, agency_id, target, details FROM AuditLog WHERE at >= '${from} 00:00' AND at <= '${to} 23:59' ORDER BY CREATEDTIME DESC`);
      const branches = await auth.branchList(zcql);
      const name = {};
      branches.forEach(b => { name[String(b.ROWID)] = b.branch_name; });
      const mine = rows.filter(r => !r.branch_id || auth.branchOk(req, r.branch_id));
      res.status(200).json({ status: 'success', data: { rows: mine.map(r => ({ ...r, branch: name[String(r.branch_id)] || '' })) } });
    } catch (err) {
      fail(res, err);
    }
  });
};
