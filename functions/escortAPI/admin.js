"use strict"

/* ---------------- ADMIN: USERS, BRANCHES, AGENCIES (#admin) ---------------- */
// Who may log in and what they see (UserRoles), the places (States → Cities → Branches, picked
// from lists so "Chennai" is never typed two ways) and the security agencies. One post belongs to one agency; a supervisor sees only their
// agency's posts and guards in their branch.

const APP_URL = 'https://escortcardaccess-60086856508.development.catalystserverless.in/app/index.html';
const CODE_RE = /^[A-Z0-9-]{2,20}$/;
// The first Super Admin (added at setup, created_by = 'setup') is the owner: nobody can change
// or switch off that login, so the app can never lose its owner.
const isOwner = u => u.created_by === 'setup';

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
      // Escort duty belongs to the agency that has the Escort team (IPF at Estancia): every shift incharge
      // of the branch may look at the escort sheet, only that agency's may change it (Prem, 25 Oct).
      let escorts = true;
      if (u.role === 'supervisor') {
        const rows = await admin(req).zcql().executeZCQLQuery(`SELECT ROWID FROM Guards WHERE agency_id = ${requireRowId(u.agency_id)} AND area = 'Escort' LIMIT 1`);
        escorts = rows.length > 0;
      }
      ok(res, { email: u.email, name: u.name, role: u.role, roleName: ROLE_NAME[u.role], city: u.city, branch_id: u.branch_id, agency_id: u.agency_id, escortEdit: escorts });
    } catch (err) {
      fail(res, err);
    }
  });

  // Agencies are a short list everybody signed in may read (dropdowns).
  async function agencyList(zcql) {
    return selectAll(zcql, 'Agencies', 'SELECT ROWID, agency_name, branch_ids, is_active FROM Agencies ORDER BY agency_name ASC');
  }
  // branch_ids is a comma list of the branches the agency works in.
  const branchIdsOf = a => String((a && a.branch_ids) || '').split(',').map(x => x.trim()).filter(Boolean);
  const worksIn = (a, branchId) => branchIdsOf(a).includes(String(branchId));
  // States and cities: short lists, read with the admin page.
  async function placeList(zcql) {
    const [states, cities] = await Promise.all([
      selectAll(zcql, 'States', 'SELECT ROWID, state_name, country, is_active FROM States ORDER BY state_name ASC'),
      selectAll(zcql, 'Cities', 'SELECT ROWID, city_name, state_id, is_active FROM Cities ORDER BY city_name ASC')
    ]);
    return { states, cities };
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
    if (isOwner(u)) return false;
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
      const [branches, agencies, places, users] = await Promise.all([
        branchList(zcql),
        agencyList(zcql),
        placeList(zcql),
        selectAll(zcql, 'UserRoles', 'SELECT ROWID, email, name, role, city, state, branch_id, agency_id, is_active, created_by, CREATEDTIME FROM UserRoles ORDER BY name ASC')
      ]);
      ok(res, {
        me: { email: req.user.email, role: req.user.role, city: req.user.city, state: req.user.state, branch_id: req.user.branch_id },
        roles: ROLES.filter(r => RANK[r] < req.user.rank || req.user.role === 'super_admin').reverse().map(r => ({ code: r, name: ROLE_NAME[r] })),
        branches: branches.filter(b => branchOk(req, b.ROWID)),
        agencies,
        states: places.states,
        // A city admin sees only their own city.
        cities: req.scope.all ? places.cities : places.cities.filter(c => c.city_name.toLowerCase() === req.user.city.toLowerCase()),
        users: users.filter(u => canManage(req, u) || u.email === req.user.email || isOwner(u)).map(u => ({ ...u, owner: isOwner(u), canEdit: canManage(req, u) && u.email !== req.user.email }))
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
    const row = { name: requireText(b.name, 'Name', 100), role, city: null, state: null, branch_id: null, agency_id: null };
    if (role === 'state_admin') {
      const state = requireText(b.state, 'State', 50);
      const { states } = await placeList(zcql);
      if (!states.some(x => x.state_name.toLowerCase() === state.toLowerCase())) throw new Error('State ' + state + ' not found. Add it in States first.');
      row.state = state;
    }
    if (role === 'city_admin') {
      const city = requireText(b.city, 'City', 100);
      const { cities } = await placeList(zcql);
      if (!cities.some(x => x.city_name.toLowerCase() === city.toLowerCase())) throw new Error('City ' + city + ' not found. Add it in Cities first.');
      if (!req.scope.all && city.toLowerCase() !== req.user.city.toLowerCase()) throw new Error('This city is not in your area.');
      row.city = city;
    }
    if (role === 'branch_admin' || role === 'supervisor') {
      row.branch_id = requireBranch(req, requireRowId(b.branch_id));
    }
    if (role === 'supervisor') {
      row.agency_id = requireRowId(b.agency_id);
      const a = await zcql.executeZCQLQuery(`SELECT ROWID, branch_ids FROM Agencies WHERE ROWID = ${row.agency_id} AND is_active = true`);
      if (!a.length) throw new Error('Agency not found');
      if (!worksIn(a[0].Agencies, row.branch_id)) throw new Error('This agency does not work in this branch. Tick the branch in Agencies.');
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
      if (/exist|already|duplicate/i.test(msg)) return 'already';
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
    if (isOwner(u)) throw new Error('This is the owner login. Nobody can change it.');
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
      // A new email (Prem, 25 Oct): the login moves to it and the new address gets the invite mail.
      const email = String(req.body.email || u.email).trim().toLowerCase();
      if (!EMAIL_RE.test(email)) throw new Error('Enter a valid email');
      let mail = null;
      if (email !== u.email) {
        const same = await zcql.executeZCQLQuery(`SELECT ROWID FROM UserRoles WHERE email = '${email}'`);
        if (same.length) throw new Error(email + ' already has a login.');
        row.email = email;
      }
      await catalystApp.datastore().table('UserRoles').updateRow({ ROWID: u.ROWID, ...row });
      forgetUser(u.email);
      if (row.email) { forgetUser(email); mail = await invite(catalystApp, email, row.name); }
      ok(res, { saved: true, mail });
    } catch (err) {
      fail(res, err);
    }
  });

  // Delete a login (Prem, 25 Oct). Only the role row goes; schedules, reports and names in the history stay.
  app.post('/userDelete', async (req, res) => {
    try {
      need(req, 'branch_admin');
      const catalystApp = admin(req);
      const zcql = catalystApp.zcql();
      const u = await managedUser(req, zcql, req.body && req.body.ROWID);
      if (u.email === req.user.email) throw new Error('You cannot delete your own login.');
      await catalystApp.datastore().table('UserRoles').deleteRow(u.ROWID);
      forgetUser(u.email);
      ok(res, { deleted: true });
    } catch (err) {
      fail(res, err);
    }
  });

  // Switch a login off (or on again); kept, so it can come back.
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
      need(req, 'admin'); // setup flow (23 Oct): the Admin adds branches
      const catalystApp = admin(req);
      const b = req.body || {};
      const phone = String(b.supervisor_phone || '').trim();
      if (phone && !/^[0-9+ ]{6,15}$/.test(phone)) throw new Error('Supervisor phone: numbers only (6 to 15)');
      const code = String(b.branch_code || '').trim().toUpperCase();
      if (!CODE_RE.test(code)) throw new Error('Branch code: capital letters, numbers and - (e.g. TN-CHN-BCH)');
      // State and city come from the lists (Cities row → its State); kept as text too for the older screens.
      const zcql = catalystApp.zcql();
      const { states, cities } = await placeList(zcql);
      const cityRow = cities.find(c => String(c.ROWID) === String(b.city_id || ''));
      if (!cityRow) throw new Error('Pick the city');
      const stateRow = states.find(x => String(x.ROWID) === String(cityRow.state_id)) || {};
      const row = {
        branch_code: code,
        branch_name: requireText(b.branch_name, 'Branch name', 100),
        company: requireText(b.company || 'Nokia', 'Company', 100),
        country: stateRow.country || 'India',
        state: stateRow.state_name || '',
        city: cityRow.city_name,
        city_id: cityRow.ROWID,
        area: String(b.area || '').trim().slice(0, 100) || null,
        supervisor_phone: phone || null,
        is_active: b.is_active === false ? 'false' : 'true'
      };
      if (!req.scope.all && row.city.toLowerCase() !== req.user.city.toLowerCase()) throw new Error('You can add branches only in ' + req.user.city + '.');
      const self = b.ROWID ? String(requireRowId(b.ROWID)) : '';
      if (self) requireBranch(req, self);
      // Read fresh (not the 5-minute cache), so a code freed a moment ago can be used again.
      const same = await zcql.executeZCQLQuery(`SELECT ROWID FROM Branches WHERE branch_code = '${code}'`);
      if (same.some(x => String(x.Branches.ROWID) !== self)) throw new Error('Branch code ' + code + ' is already used');
      const table = catalystApp.datastore().table('Branches');
      const saved = self ? await table.updateRow({ ROWID: self, ...row }) : await table.insertRow(row);
      forgetBranches();
      ok(res, { ROWID: saved.ROWID });
    } catch (err) {
      fail(res, err);
    }
  });

  /* ---------- states and cities (admin and higher) ---------- */

  // A rename is copied into the text columns the older screens read (Branches.state / city, UserRoles.city).
  app.post('/stateSave', async (req, res) => {
    try {
      need(req, 'admin');
      const catalystApp = admin(req);
      const zcql = catalystApp.zcql();
      const b = req.body || {};
      const name = requireText(b.state_name, 'State name', 100);
      const self = b.ROWID ? String(requireRowId(b.ROWID)) : '';
      const { states, cities } = await placeList(zcql);
      if (states.some(x => x.state_name.toLowerCase() === name.toLowerCase() && String(x.ROWID) !== self)) throw new Error('State ' + name + ' already exists');
      const row = { state_name: name, country: requireText(b.country || 'India', 'Country', 100), is_active: b.is_active !== false };
      const table = catalystApp.datastore().table('States');
      const saved = self ? await table.updateRow({ ROWID: self, ...row }) : await table.insertRow(row);
      if (self) {
        const ids = new Set(cities.filter(c => String(c.state_id) === self).map(c => String(c.ROWID)));
        const bt = catalystApp.datastore().table('Branches');
        for (const br of await branchList(zcql)) {
          if (ids.has(String(br.city_id))) await bt.updateRow({ ROWID: br.ROWID, state: name, country: row.country });
        }
        forgetBranches();
      }
      ok(res, { ROWID: saved.ROWID });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post('/citySave', async (req, res) => {
    try {
      need(req, 'admin');
      const catalystApp = admin(req);
      const zcql = catalystApp.zcql();
      const b = req.body || {};
      const name = requireText(b.city_name, 'City name', 100);
      const self = b.ROWID ? String(requireRowId(b.ROWID)) : '';
      const { states, cities } = await placeList(zcql);
      const state = states.find(x => String(x.ROWID) === String(b.state_id || ''));
      if (!state) throw new Error('Pick the state');
      if (cities.some(x => x.city_name.toLowerCase() === name.toLowerCase() && String(x.ROWID) !== self)) throw new Error('City ' + name + ' already exists');
      const old = cities.find(x => String(x.ROWID) === self);
      const row = { city_name: name, state_id: state.ROWID, is_active: b.is_active !== false };
      const table = catalystApp.datastore().table('Cities');
      const saved = self ? await table.updateRow({ ROWID: self, ...row }) : await table.insertRow(row);
      if (old) {
        const bt = catalystApp.datastore().table('Branches');
        for (const br of await branchList(zcql)) {
          if (String(br.city_id) === self) await bt.updateRow({ ROWID: br.ROWID, city: name, state: state.state_name, country: state.country || 'India' });
        }
        if (old.city_name !== name) {
          const ut = catalystApp.datastore().table('UserRoles');
          const admins = await selectAll(zcql, 'UserRoles', "SELECT ROWID, email, city FROM UserRoles WHERE role = 'city_admin' ORDER BY ROWID ASC");
          for (const u of admins.filter(x => String(x.city || '').toLowerCase() === old.city_name.toLowerCase())) {
            await ut.updateRow({ ROWID: u.ROWID, city: name });
            forgetUser(u.email);
          }
        }
        forgetBranches();
      }
      ok(res, { ROWID: saved.ROWID });
    } catch (err) {
      fail(res, err);
    }
  });

  /* ---------- agencies ---------- */

  app.post('/agencySave', async (req, res) => {
    try {
      need(req, 'admin'); // setup flow (23 Oct): the Admin adds agencies
      const catalystApp = admin(req);
      const zcql = catalystApp.zcql();
      const b = req.body || {};
      const name = requireText(b.agency_name, 'Agency name', 100);
      const self = b.ROWID ? String(requireRowId(b.ROWID)) : '';
      const all = await agencyList(zcql);
      if (all.some(a => a.agency_name.toLowerCase() === name.toLowerCase() && String(a.ROWID) !== self)) throw new Error('Agency ' + name + ' already exists');
      // Branch ticks: a city admin changes only the ticks of their own branches.
      const branches = await branchList(zcql);
      const known = new Set(branches.map(x => String(x.ROWID)));
      const given = (Array.isArray(b.branch_ids) ? b.branch_ids : []).map(String).filter(id => known.has(id) && branchOk(req, id));
      const old = all.find(a => String(a.ROWID) === self);
      const kept = branchIdsOf(old).filter(id => !branchOk(req, id));
      const row = {
        agency_name: name,
        branch_ids: [...new Set(kept.concat(given))].join(','),
        is_active: b.is_active !== false
      };
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

  return { agencyList, worksIn };
};
