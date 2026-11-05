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

module.exports = function auditRoutes(app, h) {
  const { catalyst, selectAll, requireDate, fail, auth } = h;
  const stamp = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 16).replace('T', ' ');
  const id = v => (/^[0-9]+$/.test(String(v || '')) ? String(v) : null);
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = d => { const [, m, dd] = String(d || '').split('-'); return dd && m ? +dd + ' ' + MON[+m - 1] : String(d || ''); };
  const CODE = { A: 'A', B: 'B', C: 'C', G: 'G', O: 'Week off', L: 'Leave', '-': 'blank' };
  const code = c => CODE[c] || c || 'blank';
  const SHOW = { post_name: 'Name', post_type: 'Type', shift_codes: 'Shifts', section: 'Section', vehicle_entry: 'Vehicle entry', report_type: 'Report', auto_fill: 'Auto fill', extra_duty: 'Extra duty', agency_id: 'Agency',
    guard_name: 'Name', id_number: 'Clock NO', card_number: 'Employee No', designation: 'Designation', agency: 'Agency', branch_id: 'Branch', gender: 'Gender', tags: 'Tags', area: 'Area', escort_id: 'Escort seat' };
  const yes = v => (v === true || v === 'true' ? 'Yes' : v === false || v === 'false' ? 'No' : v === null || v === undefined || v === '' ? '—' : String(v));

  async function one(zcql, table, cols, rowid) {
    if (!id(rowid)) return null;
    const r = await zcql.executeZCQLQuery(`SELECT ${cols} FROM ${table} WHERE ROWID = ${rowid}`);
    return r.length ? r[0][table] : null;
  }
  const guardName = async (zcql, gid) => ((await one(zcql, 'Guards', 'ROWID, guard_name', gid)) || {}).guard_name || '';
  // "Shifts: ABC → ABCG" for every shown field that changed.
  const diff = (before, b) => Object.keys(SHOW).filter(k => k in b && before && yes(before[k]) !== yes(b[k]) && !(k === 'agency_id' && !b[k]))
    .map(k => SHOW[k] + ': ' + yes(before[k]) + ' → ' + yes(b[k]));

  // Before the change: read what is there now, so the log can say "old → new" in words.
  // Each returns { target, lines } built after the change succeeds (`reply` = the route's data).
  const READ = {
    '/rosterSet': async (zcql, b) => {
      const name = await guardName(zcql, b.guard_id);
      const r = id(b.guard_id) ? await zcql.executeZCQLQuery(`SELECT codes FROM MonthRoster WHERE guard_id = ${b.guard_id} AND roster_month = '${String(b.month).replace(/[^0-9-]/g, '')}'`) : [];
      const old = r.length ? String(r[0].MonthRoster.codes || '')[Number(b.day) - 1] : '';
      return () => ({ target: name + ' · ' + day(b.month + '-' + String(b.day).padStart(2, '0')) + ': ' + code(old) + ' → ' + code(String(b.code || '').toUpperCase()), lines: [] });
    },
    '/rosterRow': async (zcql, b) => {
      const name = await guardName(zcql, b.guard_id);
      const r = id(b.guard_id) ? await zcql.executeZCQLQuery(`SELECT codes FROM MonthRoster WHERE guard_id = ${b.guard_id} AND roster_month = '${String(b.month).replace(/[^0-9-]/g, '')}'`) : [];
      const old = r.length ? String(r[0].MonthRoster.codes || '') : '';
      return reply => {
        const now = String((reply && reply.codes) || b.codes || '');
        const lines = [];
        for (let i = 0; i < now.length; i++) if ((old[i] || '-') !== now[i]) lines.push(day(b.month + '-' + String(i + 1).padStart(2, '0')) + ': ' + code(old[i]) + ' → ' + code(now[i]));
        return { target: name + ' · ' + lines.length + ' day(s) changed', lines };
      };
    },
    '/scheduleSet': async (zcql, b) => {
      const post = ((await one(zcql, 'Posts', 'ROWID, post_name', b.post)) || {}).post_name || '';
      const cell = id(b.post) ? await zcql.executeZCQLQuery(`SELECT guard_id FROM Schedule WHERE post_id = ${b.post} AND sched_date = '${String(b.date).replace(/[^0-9-]/g, '')}' AND shift_code = '${String(b.shift).replace(/[^A-Z]/g, '')}'`) : [];
      const oldName = cell.length ? await guardName(zcql, cell[0].Schedule.guard_id) : '';
      const newName = b.guard ? await guardName(zcql, b.guard) : '';
      return () => ({ target: post + ' · Shift ' + b.shift + ' · ' + day(b.date) + ': ' + (oldName || 'empty') + ' → ' + (newName || 'empty'), lines: [] });
    },
    '/schedulePublish': async (zcql, b) => reply => ({ target: day(b.date) + (reply && reply.published !== undefined ? ' · ' + reply.published + ' change(s) sent to guards' : ''), lines: [] }),
    '/scheduleAuto': async (zcql, b) => reply => ({ target: day(b.date) + (reply && reply.filled !== undefined ? ' · ' + reply.filled + ' slot(s) filled' : ''), lines: [] }),
    '/scheduleCopy': async (zcql, b) => () => ({ target: day(b.date), lines: [] }),
    '/scheduleClear': async (zcql, b) => reply => ({ target: day(b.date) + (reply && reply.cleared !== undefined ? ' · ' + reply.cleared + ' slot(s) removed' : ''), lines: [] }),
    '/updatePost': async (zcql, b) => {
      const before = await one(zcql, 'Posts', 'ROWID, post_name, post_type, shift_codes, section, vehicle_entry, report_type, auto_fill, extra_duty, agency_id', b.ROWID);
      return () => { const lines = diff(before, b); return { target: (b.post_name || (before || {}).post_name || '') + (lines.length ? '' : ' · rules / order only'), lines }; };
    },
    '/addPost': async (zcql, b) => () => ({ target: b.post_name || '', lines: ['Shifts: ' + (b.shift_codes || 'all'), b.section ? 'Section: ' + b.section : ''].filter(Boolean) }),
    '/deletePost': async (zcql, b) => { const p = await one(zcql, 'Posts', 'ROWID, post_name', b.ROWID); return () => ({ target: (p || {}).post_name || '', lines: [] }); },
    '/updateGuard': async (zcql, b) => {
      const before = await one(zcql, 'Guards', 'ROWID, guard_name, id_number, card_number, designation, agency, branch_id, gender, tags, area, escort_id', b.ROWID);
      return () => { const lines = diff(before, b); return { target: b.guard_name || (before || {}).guard_name || '', lines: lines.length ? lines : ['Details updated (phone / Aadhaar / photo are not shown here)'] }; };
    },
    '/addGuard': async (zcql, b) => () => ({ target: b.guard_name || '', lines: [b.id_number ? 'Clock NO: ' + b.id_number : '', b.agency ? 'Agency: ' + b.agency : ''].filter(Boolean) }),
    '/setGuardActive': async (zcql, b) => { const n = await guardName(zcql, b.ROWID); return () => ({ target: n + ' · ' + (b.active === true ? 'switched ON (back on duty)' : 'switched OFF (relieved)'), lines: [b.relieved_date ? 'Relieved date: ' + b.relieved_date : '', b.reason ? 'Reason: ' + b.reason : ''].filter(Boolean) }); },
    '/rosterUpload': async (zcql, b) => reply => ({ target: b.month + (Array.isArray(b.rows) ? ' · ' + b.rows.length + ' guards' : ''), lines: reply && reply.areas ? ['Teams updated: ' + reply.areas] : [] })
  };

  async function write(req, label, target, lines) {
    try {
      const catalystApp = catalyst.initialize(req, { scope: 'admin' });
      const b = req.body || {};
      await catalystApp.datastore().table('AuditLog').insertRow({
        at: stamp(), who: String(req.user.name || req.user.email).slice(0, 100), role: req.user.role,
        action: label, branch_id: id(b.branch_id || b.branch || req.user.branch_id), agency_id: id(b.agency_id || b.agency || req.user.agency_id),
        target: String(target || '').slice(0, 150), details: JSON.stringify({ lines: (lines || []).slice(0, 60) }).slice(0, 9000)
      });
    } catch (err) {
      console.error('Audit log write failed:', err.message || err);
    }
  }

  // After auth (req.user set): read the "before" (READ), watch the reply; a success writes the row.
  // Never blocks or fails the change itself.
  app.use(async (req, res, next) => {
    const a = ACTIONS[req.path];
    if (!a || req.method === 'GET' || !req.user) return next();
    let after = null;
    try {
      if (READ[req.path]) after = await READ[req.path](catalyst.initialize(req, { scope: 'admin' }).zcql(), req.body || {});
    } catch (err) {
      console.error('Audit read failed:', err.message || err);
    }
    const json = res.json.bind(res);
    res.json = body => {
      if (res.statusCode < 300 && body && body.status === 'success') {
        let out = { target: '', lines: [] };
        try { out = after ? after(body.data) : { target: a[1](req.body || {}) || '', lines: [] }; } catch { /* plain row */ }
        write(req, a[0], out.target, out.lines);
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
