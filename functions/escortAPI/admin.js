"use strict"

/* ---------------- ADMIN: USERS, BRANCHES, AGENCIES (#admin) ---------------- */
// Who may log in and what they see (UserRoles), the branches (country → state → city → branch)
// and the security agencies. One post belongs to one agency; a supervisor sees only their
// agency's posts and guards in their branch.

const APP_URL = 'https://escortcardaccess-60086856508.development.catalystserverless.in/app/index.html';
const CODE_RE = /^[A-Z0-9-]{2,20}$/;

module.exports = function adminRoutes(app, h) {
  const { catalyst, selectAll, requireRowId, requireText, fail, auth } = h;
  const { ROLES, RANK, ROLE_NAME, EMAIL_RE, need, branchOk, requireBranch, branchList, forgetBranches, forgetUser } = auth;

  const admin = req => catalyst.initialize(req, { scope: 'admin' });
  const ok = (res, data) => res.status(200).json({ status: 'success', data });

  // Who is signed in. Answers even without a role, so the page can say "ask your admin".
  app.get('/me', async (req, res) => {
    try {
      if (!req.user) return ok(res, { email: req.login.email, name: req.login.name, role: null });
      const u = req.user;
      ok(res, { email: u.email, name: u.name, role: u.role, roleName: ROLE_NAME[u.role], city: u.city, branch_id: u.branch_id, agency_id: u.agency_id });
    } catch (err) {
      fail(res, err);
    }
  });

  // Agencies are a short list everybody signed in may read (dropdowns).
  async function agencyList(zcql) {
    return selectAll(zcql, 'Agencies', 'SELECT ROWID, agency_name, is_active FROM Agencies ORDER BY agency_name ASC');
  }
  app.get('/agencies', async (req, res) => {
    try {
      ok(res, await agencyList(admin(req).zcql()));
    } catch (err) {
      fail(res, err);
    }
  });

  // Can `me` manage the user row `u`? Lower rank (a super admin also manages super admins)
  // and inside my area.
  function canManage(req, u) {
    const me = req.user;
    if (!(RANK[u.role] < me.rank || me.role === 'super_admin')) return false;
    if (req.scope.all) return true;
    if (u.role === 'city_admin') return false;
    return branchOk(req, u.branch_id);
  }

  // Admin page in one call: branches of my area (switched-off too), agencies, users I manage.
  app.get('/adminData', async (req, res) => {
    try {
      need(req, 'branch_admin');
      const zcql = admin(req).zcql();
      const [branches, agencies, users] = await Promise.all([
        branchList(zcql),
        agencyList(zcql),
        selectAll(zcql, 'UserRoles', 'SELECT ROWID, email, name, role, city, branch_id, agency_id, is_active, created_by, CREATEDTIME FROM UserRoles ORDER BY name ASC')
      ]);
      ok(res, {
        me: { email: req.user.email, role: req.user.role, city: req.user.city, branch_id: req.user.branch_id },
        roles: ROLES.filter(r => RANK[r] < req.user.rank || req.user.role === 'super_admin').reverse().map(r => ({ code: r, name: ROLE_NAME[r] })),
        branches: branches.filter(b => branchOk(req, b.ROWID)),
        agencies,
        users: users.filter(u => canManage(req, u) || u.email === req.user.email)
      });
    } catch (err) {
      fail(res, err);
    }
  });

  /* ---------- users ---------- */

  // Form → a clean UserRoles row, checked against what I may give.
  async function userFromBody(req, zcql, b) {
    const role = String(b.role || '');
    if (!RANK[role]) throw new Error('Pick a role');
    if (!(RANK[role] < req.user.rank || req.user.role === 'super_admin')) throw new Error('You cannot give the role ' + ROLE_NAME[role] + '.');
    const row = { name: requireText(b.name, 'Name', 100), role, city: null, branch_id: null, agency_id: null };
    if (role === 'city_admin') {
      const city = requireText(b.city, 'City', 100);
      const branches = await branchList(zcql);
      if (!branches.some(x => String(x.city || '').toLowerCase() === city.toLowerCase())) throw new Error('No branch in the city ' + city + '. Add the branch first.');
      if (!req.scope.all && city.toLowerCase() !== req.user.city.toLowerCase()) throw new Error('This city is not in your area.');
      row.city = city;
    }
    if (role === 'branch_admin' || role === 'supervisor') {
      row.branch_id = requireBranch(req, requireRowId(b.branch_id));
    }
    if (role === 'supervisor') {
      row.agency_id = requireRowId(b.agency_id);
      const a = await zcql.executeZCQLQuery(`SELECT ROWID FROM Agencies WHERE ROWID = ${row.agency_id} AND is_active = true`);
      if (!a.length) throw new Error('Agency not found');
    }
    return row;
  }

  // The invite mail: Catalyst sends the person a link to set their password.
  async function invite(catalystApp, email, name) {
    try {
      await catalystApp.userManagement().registerUser({ platform_type: 'web', redirect_url: APP_URL }, { first_name: name, email_id: email });
      return 'invited';
    } catch (err) {
      const msg = String((err && err.message) || err);
      // Already a user of this app (invited before, or the project owner): nothing to send.
      if (/exist|already/i.test(msg)) return 'already';
      throw new Error('Saved, but the invite mail failed: ' + msg);
    }
  }

  app.post('/userAdd', async (req, res) => {
    try {
      need(req, 'branch_admin');
      const catalystApp = admin(req);
      const zcql = catalystApp.zcql();
      const b = req.body || {};
      const email = String(b.email || '').trim().toLowerCase();
      if (!EMAIL_RE.test(email)) throw new Error('Enter a valid email');
      const row = await userFromBody(req, zcql, b);
      const same = await zcql.executeZCQLQuery(`SELECT ROWID FROM UserRoles WHERE email = '${email}'`);
      if (same.length) throw new Error(email + ' already has a login. Edit that one.');
      const saved = await catalystApp.datastore().table('UserRoles').insertRow({ ...row, email, is_active: true, created_by: req.user.email });
      forgetUser(email);
      const mail = await invite(catalystApp, email, row.name);
      ok(res, { ROWID: saved.ROWID, mail });
    } catch (err) {
      fail(res, err);
    }
  });

  async function managedUser(req, zcql, rowid) {
    const rows = await zcql.executeZCQLQuery(`SELECT * FROM UserRoles WHERE ROWID = ${requireRowId(rowid)}`);
    if (!rows.length) throw new Error('User not found');
    const u = rows[0].UserRoles;
    if (!canManage(req, u)) throw new Error('You cannot change this user.');
    return u;
  }

  app.put('/userUpdate', async (req, res) => {
    try {
      need(req, 'branch_admin');
      const catalystApp = admin(req);
      const zcql = catalystApp.zcql();
      const u = await managedUser(req, zcql, req.body && req.body.ROWID);
      if (u.email === req.user.email) throw new Error('You cannot change your own role. Ask another admin.');
      const row = await userFromBody(req, zcql, req.body);
      await catalystApp.datastore().table('UserRoles').updateRow({ ROWID: u.ROWID, ...row });
      forgetUser(u.email);
      ok(res, { saved: true });
    } catch (err) {
      fail(res, err);
    }
  });

  // Switch a login off (or on again). Never deleted, so "created by" stays readable.
  app.put('/userActive', async (req, res) => {
    try {
      need(req, 'branch_admin');
      const catalystApp = admin(req);
      const zcql = catalystApp.zcql();
      const u = await managedUser(req, zcql, req.body && req.body.ROWID);
      if (u.email === req.user.email) throw new Error('You cannot switch off your own login.');
      await catalystApp.datastore().table('UserRoles').updateRow({ ROWID: u.ROWID, is_active: req.body.active === true });
      forgetUser(u.email);
      ok(res, { saved: true });
    } catch (err) {
      fail(res, err);
    }
  });

  // Mail again: a new invite, or (already a user) a "set a new password" link.
  app.post('/userMail', async (req, res) => {
    try {
      need(req, 'branch_admin');
      const catalystApp = admin(req);
      const u = await managedUser(req, catalystApp.zcql(), req.body && req.body.ROWID);
      let mail = await invite(catalystApp, u.email, u.name);
      if (mail === 'already') {
        await catalystApp.userManagement().resetPassword(u.email, { platform_type: 'web', redirect_url: APP_URL });
        mail = 'reset';
      }
      ok(res, { mail });
    } catch (err) {
      fail(res, err);
    }
  });

  /* ---------- branches ---------- */

  app.post('/branchSave', async (req, res) => {
    try {
      need(req, 'city_admin');
      const catalystApp = admin(req);
      const b = req.body || {};
      const phone = String(b.supervisor_phone || '').trim();
      if (phone && !/^[0-9+ ]{6,15}$/.test(phone)) throw new Error('Supervisor phone: numbers only (6 to 15)');
      const code = String(b.branch_code || '').trim().toUpperCase();
      if (!CODE_RE.test(code)) throw new Error('Branch code: capital letters, numbers and - (e.g. TN-CHN-BCH)');
      const row = {
        branch_code: code,
        branch_name: requireText(b.branch_name, 'Branch name', 100),
        company: requireText(b.company || 'Nokia', 'Company', 100),
        country: requireText(b.country || 'India', 'Country', 100),
        state: requireText(b.state, 'State', 100),
        city: requireText(b.city, 'City', 100),
        area: String(b.area || '').trim().slice(0, 100) || null,
        supervisor_phone: phone || null,
        is_active: b.is_active === false ? 'false' : 'true'
      };
      if (!req.scope.all && row.city.toLowerCase() !== req.user.city.toLowerCase()) throw new Error('You can add branches only in ' + req.user.city + '.');
      const zcql = catalystApp.zcql();
      const branches = await branchList(zcql);
      const self = b.ROWID ? String(requireRowId(b.ROWID)) : '';
      if (self) requireBranch(req, self);
      if (branches.some(x => x.branch_code === code && String(x.ROWID) !== self)) throw new Error('Branch code ' + code + ' is already used');
      const table = catalystApp.datastore().table('Branches');
      const saved = self ? await table.updateRow({ ROWID: self, ...row }) : await table.insertRow(row);
      forgetBranches();
      ok(res, { ROWID: saved.ROWID });
    } catch (err) {
      fail(res, err);
    }
  });

  /* ---------- agencies ---------- */

  app.post('/agencySave', async (req, res) => {
    try {
      need(req, 'city_admin');
      const catalystApp = admin(req);
      const zcql = catalystApp.zcql();
      const b = req.body || {};
      const name = requireText(b.agency_name, 'Agency name', 100);
      const self = b.ROWID ? String(requireRowId(b.ROWID)) : '';
      const all = await agencyList(zcql);
      if (all.some(a => a.agency_name.toLowerCase() === name.toLowerCase() && String(a.ROWID) !== self)) throw new Error('Agency ' + name + ' already exists');
      const row = { agency_name: name, is_active: b.is_active !== false };
      const table = catalystApp.datastore().table('Agencies');
      const saved = self ? await table.updateRow({ ROWID: self, ...row }) : await table.insertRow(row);
      // Guards keep the agency name as text too (older screens show it): keep it in step.
      if (self) {
        const guards = await selectAll(zcql, 'Guards', `SELECT ROWID FROM Guards WHERE agency_id = ${self} ORDER BY ROWID ASC`);
        const gt = catalystApp.datastore().table('Guards');
        for (const g of guards) await gt.updateRow({ ROWID: g.ROWID, agency: name });
      }
      ok(res, { ROWID: saved.ROWID });
    } catch (err) {
      fail(res, err);
    }
  });

  return { agencyList };
};
