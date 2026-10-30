'use strict';

/* ---------------- SETUP MOVE (Prem, 30 Oct: going to Production) ---------------- */
// "Deploy to Production" copies the code and the tables, not the rows, and Production gives every row a new
// ROWID. 📤 Export (Development) writes the setup as one file; 📥 Import (an empty Production) adds it back
// in order, turning every old ROWID into the new one: states → cities → branches → shifts → agencies →
// guards → incharges → posts → office logins.
// Not moved: photos and Aadhaar (Aadhaar is locked with Development's key), guard links, QR keys, Settings
// (API keys), rosters, schedules, swipes, chats. Only active rows; relievers stay behind.

module.exports = function setupMoveRoutes(app, h) {
  const { catalyst, selectAll, fail, auth } = h;
  const VERSION = 1;
  const yes = v => v === true || v === 'true';
  const pick = (row, cols) => { const o = {}; cols.forEach(c => { if (row[c] !== undefined && row[c] !== null && row[c] !== '') o[c] = row[c]; }); return o; };

  const COLS = {
    States: ['ROWID', 'state_name', 'country', 'is_active'],
    Cities: ['ROWID', 'city_name', 'state_id', 'is_active'],
    Branches: ['ROWID', 'branch_code', 'branch_name', 'company', 'country', 'state', 'city', 'city_id', 'area', 'address', 'supervisor_phone', 'shift_times', 'lat', 'lng', 'radius_m', 'is_active'],
    Shifts: ['ROWID', 'shift_code', 'start_time', 'end_time'],
    Agencies: ['ROWID', 'agency_name', 'contact_name', 'contact_phone', 'contact_email', 'address', 'license_no', 'license_till', 'branch_ids', 'incharge_ids', 'is_active'],
    Guards: ['ROWID', 'id_number', 'card_number', 'guard_name', 'agency', 'agency_id', 'branch_id', 'area', 'phone', 'tags', 'gender', 'designation', 'date_of_joining', 'date_of_birth', 'emergency_contact', 'created_by', 'is_active'],
    Posts: ['ROWID', 'branch_id', 'agency_id', 'post_name', 'post_type', 'vehicle_entry', 'extra_duty', 'auto_fill', 'section', 'sort_order', 'shift_codes', 'regular_guards', 'relief_guards', 'is_active'],
    UserRoles: ['ROWID', 'email', 'name', 'role', 'state', 'city', 'branch_id', 'agency_id', 'created_by', 'is_active']
  };

  app.get('/setupExport', async (req, res) => {
    try {
      auth.need(req, 'super_admin');
      const zcql = catalyst.initialize(req, { scope: 'admin' }).zcql();
      const all = t => selectAll(zcql, t, `SELECT ${COLS[t].join(', ')} FROM ${t} ORDER BY ROWID ASC`);
      const [states, cities, branches, shifts, agencies, guards, posts, users] = await Promise.all(
        ['States', 'Cities', 'Branches', 'Shifts', 'Agencies', 'Guards', 'Posts', 'UserRoles'].map(all));
      const active = r => r.is_active === undefined || r.is_active === null || yes(r.is_active);
      // A switched-off branch or agency (BSS test, 30 Oct) leaves its guards and posts behind too.
      // ?branch=<ROWID>: one branch only (Prem, 30 Oct: Cumbum goes live first), with its city, state,
      // agencies (their other branches drop out on import) and the office logins of that branch.
      const one = /^\d+$/.test(String(req.query.branch || '')) ? String(req.query.branch) : '';
      const inOne = b => !one || String(b.ROWID) === one;
      const brList = branches.filter(b => active(b) && inOne(b));
      const brOk = new Set(brList.map(r => String(r.ROWID)));
      const cityIds = new Set(brList.map(b => String(b.city_id)));
      const cityList = cities.filter(c => active(c) && (!one || cityIds.has(String(c.ROWID))));
      const stateIds = new Set(cityList.map(c => String(c.state_id)));
      const agOk = new Set(agencies.filter(active).map(r => String(r.ROWID)));
      const placed = r => brOk.has(String(r.branch_id)) && (!r.agency_id || agOk.has(String(r.agency_id)));
      const data = {
        version: VERSION, at: new Date().toISOString(),
        States: states.filter(r => active(r) && (!one || stateIds.has(String(r.ROWID)))).map(r => pick(r, COLS.States)),
        Cities: cityList.map(r => pick(r, COLS.Cities)),
        Branches: brList.map(r => pick(r, COLS.Branches)),
        Shifts: shifts.map(r => pick(r, COLS.Shifts)),
        Agencies: agencies.filter(a => active(a) && (!one || String(a.branch_ids || '').split(',').map(x => x.trim()).includes(one))).map(r => pick(r, COLS.Agencies)),
        Guards: guards.filter(g => active(g) && placed(g) && !String(g.tags || '').split(',').includes('Reliever')).map(r => pick(r, COLS.Guards)),
        Posts: posts.filter(p => active(p) && placed(p)).map(r => pick(r, COLS.Posts)),
        UserRoles: users.filter(u => active(u) && (!one || !u.branch_id || brOk.has(String(u.branch_id)))).map(r => pick(r, COLS.UserRoles))
      };
      res.status(200).json({ status: 'success', data });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post('/setupImport', async (req, res) => {
    try {
      auth.need(req, 'super_admin');
      const catalystApp = catalyst.initialize(req, { scope: 'admin' });
      const zcql = catalystApp.zcql();
      const d = req.body || {};
      if (d.version !== VERSION || !Array.isArray(d.Guards)) throw new Error('This is not a setup file from 📤 Export setup.');
      // Only into an empty place: a second import would make every branch and guard twice.
      const [b, g] = await Promise.all([
        zcql.executeZCQLQuery('SELECT ROWID FROM Branches LIMIT 1'), zcql.executeZCQLQuery('SELECT ROWID FROM Guards LIMIT 1')]);
      if (b.length || g.length) throw new Error('This environment already has branches or guards. Import works only into an empty one.');

      const newId = {}; // old ROWID → new ROWID, all tables together (ROWIDs never repeat across tables)
      const map = v => (v === undefined || v === null || v === '' ? v : newId[String(v)] || null);
      // "id,id;id;AB;RG" → the same text with the new ids; an id not moved (an inactive guard) drops out.
      const mapList = v => (v ? String(v).split(';').map(part => part.split(',').map(x => x.trim()).filter(Boolean)
        .map(x => (/^\d{10,}$/.test(x) ? newId[x] || '' : x)).filter(Boolean).join(',')).join(';') : v);
      const counts = {};
      async function put(table, rows, shape) {
        const t = catalystApp.datastore().table(table);
        counts[table] = 0;
        for (let i = 0; i < rows.length; i += 100) {
          const part = rows.slice(i, i + 100);
          const saved = await t.insertRows(part.map(r => { const o = { ...shape(r) }; delete o.ROWID; return o; }));
          saved.forEach((s, k) => { newId[String(part[k].ROWID)] = String(s.ROWID); });
          counts[table] += saved.length;
        }
      }
      await put('States', d.States || [], r => r);
      await put('Cities', d.Cities || [], r => ({ ...r, state_id: map(r.state_id) }));
      await put('Branches', d.Branches || [], r => ({ ...r, city_id: map(r.city_id) }));
      const haveShifts = await zcql.executeZCQLQuery('SELECT ROWID FROM Shifts LIMIT 1');
      if (!haveShifts.length) await put('Shifts', d.Shifts || [], r => r);
      await put('Agencies', d.Agencies || [], r => ({ ...r, branch_ids: mapList(r.branch_ids), incharge_ids: null }));
      await put('Guards', d.Guards, r => ({ ...r, branch_id: map(r.branch_id), agency_id: map(r.agency_id), created_by: r.created_by || 'Setup import' }));
      // Incharges point at guards, so they come after the guards.
      const inch = (d.Agencies || []).filter(a => a.incharge_ids).map(a => ({ ROWID: newId[String(a.ROWID)], incharge_ids: mapList(a.incharge_ids) })).filter(a => a.ROWID);
      if (inch.length) await catalystApp.datastore().table('Agencies').updateRows(inch);
      await put('Posts', d.Posts || [], r => ({ ...r, branch_id: map(r.branch_id), agency_id: map(r.agency_id), regular_guards: mapList(r.regular_guards), relief_guards: mapList(r.relief_guards) }));
      // Office logins: the person importing is already there.
      const have = new Set((await zcql.executeZCQLQuery('SELECT email FROM UserRoles')).map(x => String(x.UserRoles.email || '').trim().toLowerCase()));
      await put('UserRoles', (d.UserRoles || []).filter(u => !have.has(String(u.email || '').trim().toLowerCase())),
        r => ({ ...r, branch_id: map(r.branch_id), agency_id: map(r.agency_id) }));
      auth.forgetBranches && auth.forgetBranches();
      res.status(200).json({ status: 'success', data: { counts } });
    } catch (err) {
      fail(res, err);
    }
  });
};
