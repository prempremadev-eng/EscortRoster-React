'use strict';

/* ---------------- ATTENDANCE (Prem, 30 Oct) ---------------- */
// One row per guard per duty day, in the headings of the agency's "Attendances" report, for every branch:
// card swipes (Estancia) and QR selfies (Cumbum) alike. Present = an IN that day; Absent = published on the
// schedule but no IN. Read only: nothing here changes a swipe.

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MAX_DAYS = 31;

module.exports = function attendanceRoutes(app, h) {
  const { catalyst, selectAll, requireRowId, fail, auth, getShifts } = h;
  const DATE = /^\d{4}-\d{2}-\d{2}$/;

  // "2026-10-29" → "29-Oct-2026"; "2026-10-29 17:34:59:123" → "29-Oct-2026 17:34:59".
  const niceDay = d => { const [y, m, dd] = String(d).slice(0, 10).split('-'); return dd + '-' + MON[+m - 1] + '-' + y; };
  const niceTime = t => (t ? niceDay(t) + ' ' + String(t).slice(11, 19) : '');
  const mins = t => Date.parse(String(t).slice(0, 19).replace(' ', 'T') + 'Z') / 60000;
  const hours = (a, b) => { const m = Math.round(mins(b) - mins(a)); return m > 0 ? Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm' : ''; };
  const SOURCE = { REAL: 'Card', SIMULATOR: 'Card (test)', QR: 'QR selfie' };

  app.get('/attendance', async (req, res) => {
    try {
      auth.need(req, 'supervisor');
      const catalystApp = catalyst.initialize(req, { scope: 'admin' });
      const zcql = catalystApp.zcql();
      // Every branch in the area (Prem, 30 Oct: all states, cities, branches, agencies on one page); the page filters.
      const from = String(req.query.from || ''), to = String(req.query.to || from);
      if (!DATE.test(from) || !DATE.test(to) || to < from) throw new Error('Pick the dates.');
      if ((Date.parse(to) - Date.parse(from)) / 86400000 >= MAX_DAYS) throw new Error('At most ' + MAX_DAYS + ' days at a time.');

      const [branches, guardsAll, logs, sched, posts] = await Promise.all([
        auth.branchList(zcql),
        selectAll(zcql, 'Guards', 'SELECT ROWID, guard_name, id_number, card_number, designation, agency, agency_id, branch_id, is_active, tags FROM Guards ORDER BY ROWID ASC'),
        selectAll(zcql, 'AccessLog', `SELECT ROWID, guard_id, direction, duty_date, source, allowed_by, CREATEDTIME FROM AccessLog WHERE duty_date >= '${from}' AND duty_date <= '${to}' ORDER BY CREATEDTIME ASC`),
        selectAll(zcql, 'Schedule', `SELECT guard_id, sched_date, shift_code, post_id FROM Schedule WHERE sched_date >= '${from}' AND sched_date <= '${to}' AND published = true ORDER BY ROWID ASC`),
        selectAll(zcql, 'Posts', 'SELECT ROWID, post_name FROM Posts ORDER BY ROWID ASC')
      ]);
      const branchById = {};
      branches.filter(b => auth.branchOk(req, b.ROWID)).forEach(b => { branchById[String(b.ROWID)] = b; });
      const guards = auth.inArea(req, guardsAll).filter(g => branchById[String(g.branch_id)]);
      // Absent only after the shift has begun + 15 min late time (30 Oct: at 00:41 the day's A and C showed Absent).
      const startOf = {};
      for (const id of Object.keys(branchById)) {
        startOf[id] = {};
        (await getShifts(zcql, id)).forEach(sh => { if (sh.start) startOf[id][sh.code] = sh.start; });
      }
      const byGuard = {};
      guards.forEach(g => { byGuard[String(g.ROWID)] = g; });
      const postName = {};
      posts.forEach(p => { postName[String(p.ROWID)] = p.post_name; });

      // guard + day → its swipes and its published duty.
      const days = {};
      const slot = (gid, day) => (days[gid + '|' + day] = days[gid + '|' + day] || { gid, day, log: [], duty: null });
      logs.forEach(l => { if (byGuard[String(l.guard_id)]) slot(String(l.guard_id), String(l.duty_date).slice(0, 10)).log.push(l); });
      sched.forEach(s => { if (s.guard_id && byGuard[String(s.guard_id)]) { const x = slot(String(s.guard_id), String(s.sched_date).slice(0, 10)); x.duty = x.duty || s; } });

      const nowIst = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 16).replace('T', ' ');
      const today = nowIst.slice(0, 10);
      const begun = (branch, day, code) => { const st = (startOf[branch] || {})[code]; if (!st) return day < today; return mins(day + ' ' + st + ':00') + 15 <= mins(nowIst + ':00'); };
      const rows = [];
      for (const x of Object.values(days)) {
        if (!x.log.length && (x.day > today || (x.duty && !begun(String(byGuard[x.gid].branch_id), x.day, x.duty.shift_code)))) continue; // not begun: not absent yet
        const g = byGuard[x.gid];
        const firstIn = x.log.find(l => l.direction === 'IN');
        const outs = firstIn ? x.log.filter(l => l.direction === 'OUT' && l.CREATEDTIME > firstIn.CREATEDTIME) : [];
        const lastOut = outs[outs.length - 1];
        const reliever = String(g.tags || '').split(',').includes('Reliever');
        const b = branchById[String(g.branch_id)];
        const [y, m, d] = x.day.split('-');
        rows.push({
          date: niceDay(x.day), sortDay: x.day,
          vendorId: g.card_number || '', clock: g.id_number || '', name: g.guard_name,
          status: firstIn ? 'Present' : 'Absent',
          approvalStatus: lastOut && lastOut.allowed_by ? 'Approved' : '',
          shift: x.duty ? x.duty.shift_code : '',
          post: x.duty ? g.agency + ' - ' + (postName[String(x.duty.post_id)] || '') : '',
          entry: firstIn ? niceTime(firstIn.CREATEDTIME) : '',
          exit: lastOut ? niceTime(lastOut.CREATEDTIME) : '',
          inTime: firstIn && lastOut ? hours(firstIn.CREATEDTIME, lastOut.CREATEDTIME) : '',
          approvedBy: lastOut && lastOut.allowed_by ? lastOut.allowed_by : '',
          agency: g.agency || '',
          approvedTime: lastOut && lastOut.allowed_by ? niceTime(lastOut.CREATEDTIME) : '',
          designation: reliever ? 'Reliever' : g.designation || '',
          day: +d, month: +m, year: +y,
          addedUser: firstIn ? SOURCE[firstIn.source] || firstIn.source || '' : '',
          status2: '',
          active: g.is_active === 'true' || g.is_active === true ? 'Active' : 'Inactive',
          addedTime: firstIn ? niceTime(firstIn.CREATEDTIME) : '',
          id: firstIn ? String(firstIn.ROWID) : '',
          office: [b.city, b.branch_name].filter(Boolean).join(' - '),
          branchId: String(g.branch_id), agencyId: String(g.agency_id || ''), state: b.state || '', city: b.city || '',
          addedUser2: 'GuardDesk'
        });
      }
      rows.sort((p, q) => q.sortDay.localeCompare(p.sortDay) || p.name.localeCompare(q.name));
      res.status(200).json({ status: 'success', data: { rows } });
    } catch (err) {
      fail(res, err);
    }
  });
};
