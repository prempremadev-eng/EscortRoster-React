"use strict"

/* ---------------- MONTH ROSTER (#roster) ---------------- */
// The agency's monthly shift chart in the app: one row per guard per month, the day codes in one
// string ("AAAAAOBBBBBBO…", one letter per day). One read shows a whole branch for a month.
//   A / B / C / G = shift, O = week off, L = leave, - = nothing given.
// Which post a guard stands at is still the day's Schedule; this only says the shift.

const CODES = ['A', 'B', 'C', 'G', 'O', 'L', '-'];
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

module.exports = function rosterRoutes(app, h) {
  const { catalyst, selectAll, requireRowId, fail, auth } = h;
  const admin = req => catalyst.initialize(req, { scope: 'admin' });
  const ok = (res, data) => res.status(200).json({ status: 'success', data });

  function requireMonth(value) {
    if (!MONTH_RE.test(String(value || ''))) throw new Error('Pick a month');
    return value;
  }
  const daysIn = month => new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).getUTCDate();
  // Any code string → exactly one allowed letter per day of that month.
  function cleanCodes(codes, days) {
    const s = String(codes || '').toUpperCase();
    let out = '';
    for (let i = 0; i < days; i++) out += CODES.includes(s[i]) ? s[i] : '-';
    return out;
  }

  // Active guards of a branch in my area (a supervisor: only their agency).
  async function branchGuards(req, zcql, branch) {
    return selectAll(zcql, 'Guards', `SELECT ROWID, id_number, card_number, guard_name, area, agency, agency_id, branch_id FROM Guards WHERE branch_id = ${branch} AND is_active = 'true'${auth.agencyWhere(req)} ORDER BY guard_name ASC`);
  }
  // A supervisor reads only their agency's rows (Prem, 25 Oct: no agency sees another's details).
  async function monthRows(req, zcql, branch, month) {
    return selectAll(zcql, 'MonthRoster', `SELECT ROWID, guard_id, codes, updated_by, MODIFIEDTIME FROM MonthRoster WHERE branch_id = ${branch}${auth.agencyWhere(req)} AND roster_month = '${month}' ORDER BY ROWID ASC`);
  }

  // One branch, one month: the guards and their day codes (about 2 reads).
  app.get('/roster', async (req, res) => {
    try {
      const zcql = admin(req).zcql();
      const branch = auth.requireBranch(req, requireRowId(req.query.branch));
      const month = requireMonth(req.query.month);
      const [guards, rows] = await Promise.all([branchGuards(req, zcql, branch), monthRows(req, zcql, branch, month)]);
      const codes = {};
      let updated = null;
      rows.forEach(r => {
        codes[String(r.guard_id)] = r.codes;
        if (!updated || String(r.MODIFIEDTIME) > updated.at) updated = { at: String(r.MODIFIEDTIME).slice(0, 16), by: r.updated_by || '' };
      });
      ok(res, {
        month, days: daysIn(month), updated,
        guards: guards.map(g => ({ ROWID: String(g.ROWID), id: g.id_number, card: g.card_number || '', name: g.guard_name, area: g.area || '', agency: g.agency || '' })),
        codes
      });
    } catch (err) {
      fail(res, err);
    }
  });

  // Save many guards at once (the Excel upload). Only guards of this branch in my area; a guard
  // already in the month is replaced, the rest are added. Guards not in the upload are kept.
  app.post('/rosterUpload', async (req, res) => {
    try {
      const catalystApp = admin(req);
      const zcql = catalystApp.zcql();
      const branch = auth.requireBranch(req, requireRowId(req.body.branch));
      const month = requireMonth(req.body.month);
      const entries = Array.isArray(req.body.entries) ? req.body.entries : [];
      if (!entries.length) throw new Error('Nothing to save.');
      if (entries.length > 1000) throw new Error('Too many rows in one upload.');
      const days = daysIn(month);
      const [guards, rows] = await Promise.all([branchGuards(req, zcql, branch), monthRows(req, zcql, branch, month)]);
      const guardById = new Map(guards.map(g => [String(g.ROWID), g]));
      const rowByGuard = new Map(rows.map(r => [String(r.guard_id), r]));
      const inserts = [], updates = [], skipped = [];
      const seen = new Set();
      for (const e of entries) {
        const id = String(e.guard_id || '');
        const g = guardById.get(id);
        if (!g || seen.has(id)) { skipped.push(id); continue; }
        seen.add(id);
        const codes = cleanCodes(e.codes, days);
        const old = rowByGuard.get(id);
        if (old) updates.push({ ROWID: old.ROWID, codes, updated_by: req.user.name });
        else inserts.push({ guard_id: id, roster_month: month, codes, branch_id: branch, agency_id: g.agency_id || null, updated_by: req.user.name });
      }
      const table = catalystApp.datastore().table('MonthRoster');
      for (let i = 0; i < inserts.length; i += 100) await table.insertRows(inserts.slice(i, i + 100));
      for (let i = 0; i < updates.length; i += 100) await table.updateRows(updates.slice(i, i + 100));
      ok(res, { added: inserts.length, replaced: updates.length, skipped: skipped.length });
    } catch (err) {
      fail(res, err);
    }
  });

  // One box: one guard, one day.
  app.post('/rosterSet', async (req, res) => {
    try {
      const catalystApp = admin(req);
      const zcql = catalystApp.zcql();
      const branch = auth.requireBranch(req, requireRowId(req.body.branch));
      const month = requireMonth(req.body.month);
      const days = daysIn(month);
      const day = Number(req.body.day);
      if (!Number.isInteger(day) || day < 1 || day > days) throw new Error('Pick a day');
      const code = String(req.body.code || '').toUpperCase();
      if (!CODES.includes(code)) throw new Error('Code must be A, B, C, G, O, L or -');
      const g = (await zcql.executeZCQLQuery(`SELECT ROWID, branch_id, agency_id FROM Guards WHERE ROWID = ${requireRowId(req.body.guard_id)}`))[0];
      const guard = auth.requireRow(req, g && g.Guards, 'guard');
      if (String(guard.branch_id) !== String(branch)) throw new Error('This guard is in another branch.');
      const existing = await zcql.executeZCQLQuery(`SELECT ROWID, codes FROM MonthRoster WHERE guard_id = ${guard.ROWID} AND roster_month = '${month}'`);
      const table = catalystApp.datastore().table('MonthRoster');
      const before = existing.length ? cleanCodes(existing[0].MonthRoster.codes, days) : '-'.repeat(days);
      const codes = before.slice(0, day - 1) + code + before.slice(day);
      if (existing.length) await table.updateRow({ ROWID: existing[0].MonthRoster.ROWID, codes, updated_by: req.user.name });
      else await table.insertRow({ guard_id: guard.ROWID, roster_month: month, codes, branch_id: branch, agency_id: guard.agency_id || null, updated_by: req.user.name });
      ok(res, { codes });
    } catch (err) {
      fail(res, err);
    }
  });

  // A guard's shift letter for one date (used by card IN and the guard's page): '' when none.
  async function shiftOf(zcql, guardId, date) {
    const rows = await zcql.executeZCQLQuery(`SELECT codes FROM MonthRoster WHERE guard_id = ${requireRowId(guardId)} AND roster_month = '${String(date).slice(0, 7)}'`);
    if (!rows.length) return '';
    const c = String(rows[0].MonthRoster.codes || '')[Number(String(date).slice(8, 10)) - 1];
    return c && c !== '-' ? c : '';
  }

  return { shiftOf };
};
