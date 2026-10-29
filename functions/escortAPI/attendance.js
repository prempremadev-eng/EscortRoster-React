'use strict';

/* ---------------- ATTENDANCE (Prem, 30 Oct) ---------------- */
// One row per guard per duty day, in the headings of the agency's "Attendances" report, for every branch:
// card swipes (Estancia) and QR selfies (Cumbum) alike. Present = an IN that day; Absent = published on the
// schedule but no IN. Read only: nothing here changes a swipe.

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MAX_DAYS = 31;

module.exports = function attendanceRoutes(app, h) {
  const { catalyst, selectAll, requireRowId, fail, auth } = h;
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
      const branch = auth.requireBranch(req, requireRowId(req.query.branch));
      const agency = req.scope.agency || (req.query.agency ? String(requireRowId(req.query.agency)) : '');
      const from = String(req.query.from || ''), to = String(req.query.to || from);
      if (!DATE.test(from) || !DATE.test(to) || to < from) throw new Error('Pick the dates.');
      if ((Date.parse(to) - Date.parse(from)) / 86400000 >= MAX_DAYS) throw new Error('At most ' + MAX_DAYS + ' days at a time.');
      const agWhere = agency ? ` AND agency_id = ${agency}` : '';

      const [br, guards, logs, sched, posts] = await Promise.all([
        zcql.executeZCQLQuery(`SELECT branch_name, city FROM Branches WHERE ROWID = ${branch}`),
        selectAll(zcql, 'Guards', `SELECT ROWID, guard_name, id_number, card_number, designation, agency, agency_id, branch_id, is_active, tags FROM Guards WHERE branch_id = ${branch}${agWhere} ORDER BY ROWID ASC`),
        selectAll(zcql, 'AccessLog', `SELECT ROWID, guard_id, direction, duty_date, source, allowed_by, CREATEDTIME FROM AccessLog WHERE duty_date >= '${from}' AND duty_date <= '${to}' ORDER BY CREATEDTIME ASC`),
        selectAll(zcql, 'Schedule', `SELECT guard_id, sched_date, shift_code, post_id FROM Schedule WHERE branch_id = ${branch} AND sched_date >= '${from}' AND sched_date <= '${to}' AND published = true ORDER BY ROWID ASC`),
        selectAll(zcql, 'Posts', `SELECT ROWID, post_name FROM Posts WHERE branch_id = ${branch} ORDER BY ROWID ASC`)
      ]);
      const b = br.length ? br[0].Branches : {};
      const office = [b.city, b.branch_name].filter(Boolean).join(' - ');
      const byGuard = {};
      guards.forEach(g => { byGuard[String(g.ROWID)] = g; });
      const postName = {};
      posts.forEach(p => { postName[String(p.ROWID)] = p.post_name; });

      // guard + day → its swipes and its published duty.
      const days = {};
      const slot = (gid, day) => (days[gid + '|' + day] = days[gid + '|' + day] || { gid, day, log: [], duty: null });
      logs.forEach(l => { if (byGuard[String(l.guard_id)]) slot(String(l.guard_id), String(l.duty_date).slice(0, 10)).log.push(l); });
      sched.forEach(s => { if (s.guard_id && byGuard[String(s.guard_id)]) { const x = slot(String(s.guard_id), String(s.sched_date).slice(0, 10)); x.duty = x.duty || s; } });

      const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
      const rows = [];
      for (const x of Object.values(days)) {
        if (!x.log.length && x.day > today) continue; // a future duty is not absent yet
        const g = byGuard[x.gid];
        const firstIn = x.log.find(l => l.direction === 'IN');
        const outs = firstIn ? x.log.filter(l => l.direction === 'OUT' && l.CREATEDTIME > firstIn.CREATEDTIME) : [];
        const lastOut = outs[outs.length - 1];
        const reliever = String(g.tags || '').split(',').includes('Reliever');
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
          office,
          addedUser2: 'GuardDesk'
        });
      }
      rows.sort((p, q) => q.sortDay.localeCompare(p.sortDay) || p.name.localeCompare(q.name));
      res.status(200).json({ status: 'success', data: { rows, office } });
    } catch (err) {
      fail(res, err);
    }
  });
};
