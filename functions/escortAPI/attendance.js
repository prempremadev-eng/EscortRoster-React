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
        selectAll(zcql, 'Schedule', `SELECT guard_id, sched_date, shift_code, post_id, swap_note FROM Schedule WHERE sched_date >= '${from}' AND sched_date <= '${to}' AND published = true ORDER BY ROWID ASC`),
        selectAll(zcql, 'Posts', 'SELECT ROWID, post_name FROM Posts ORDER BY ROWID ASC')
      ]);
      const branchById = {};
      branches.filter(b => auth.branchOk(req, b.ROWID)).forEach(b => { branchById[String(b.ROWID)] = b; });
      // Relievers are not regular guards (Prem, 30 Oct: they come some day only): not listed, not counted.
      // Their visits are on Setup → Relievers.
      const guards = auth.inArea(req, guardsAll).filter(g => branchById[String(g.branch_id)] && !String(g.tags || '').split(',').includes('Reliever'));
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
        const b = branchById[String(g.branch_id)];
        const [y, m, d] = x.day.split('-');
        rows.push({
          date: niceDay(x.day), sortDay: x.day,
          vendorId: g.card_number || '', clock: g.id_number || '', name: g.guard_name,
          status: firstIn ? 'Present' : 'Absent',
          approvalStatus: lastOut && lastOut.allowed_by ? 'Approved' : '',
          shift: x.duty ? x.duty.shift_code : '',
          swap: x.duty && x.duty.swap_note ? x.duty.swap_note : '', // 🔄 a shift swap the office OK'd at the gate (2 Nov)
          post: x.duty ? g.agency + ' - ' + (postName[String(x.duty.post_id)] || '') : '',
          entry: firstIn ? niceTime(firstIn.CREATEDTIME) : '',
          exit: lastOut ? niceTime(lastOut.CREATEDTIME) : '',
          inTime: firstIn && lastOut ? hours(firstIn.CREATEDTIME, lastOut.CREATEDTIME) : '',
          approvedBy: lastOut && lastOut.allowed_by ? lastOut.allowed_by : '',
          agency: g.agency || '',
          approvedTime: lastOut && lastOut.allowed_by ? niceTime(lastOut.CREATEDTIME) : '',
          designation: g.designation || '',
          day: +d, month: +m, year: +y,
          addedUser: firstIn ? SOURCE[firstIn.source] || firstIn.source || '' : '',
          status2: '',
          active: g.is_active === 'true' || g.is_active === true ? 'Active' : 'Inactive',
          addedTime: firstIn ? niceTime(firstIn.CREATEDTIME) : '',
          id: firstIn ? String(firstIn.ROWID) : '',
          office: [b.city, b.branch_name].filter(Boolean).join(' - '),
          branchId: String(g.branch_id), agencyId: String(g.agency_id || ''), state: b.state || '', city: b.city || '',
          addedUser2: 'NightOwl'
        });
      }
      rows.sort((p, q) => q.sortDay.localeCompare(p.sortDay) || p.name.localeCompare(q.name));
      res.status(200).json({ status: 'success', data: { rows } });
    } catch (err) {
      fail(res, err);
    }
  });

  // 📅 Month view (Prem, 5 Nov: "monthly attendance, modern and easy to understand"): one row per guard,
  // one cell per day. P = IN that day (shows the shift letter), AB = on the published schedule but no IN
  // (after the shift began), L / WO = leave / week off from the month roster, '' = nothing that day.
  app.get('/attendanceMonth', async (req, res) => {
    try {
      auth.need(req, 'supervisor');
      const catalystApp = catalyst.initialize(req, { scope: 'admin' });
      const zcql = catalystApp.zcql();
      const month = String(req.query.month || '');
      if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Pick the month.');
      const [y, m] = month.split('-').map(Number);
      const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const from = month + '-01', to = month + '-' + String(days).padStart(2, '0');
      const [branches, guardsAll, logs, sched, roster, posts] = await Promise.all([
        auth.branchList(zcql),
        selectAll(zcql, 'Guards', 'SELECT ROWID, guard_name, id_number, card_number, agency, agency_id, branch_id, is_active, tags FROM Guards ORDER BY ROWID ASC'),
        selectAll(zcql, 'AccessLog', `SELECT guard_id, direction, duty_date, CREATEDTIME FROM AccessLog WHERE duty_date >= '${from}' AND duty_date <= '${to}' ORDER BY CREATEDTIME ASC`),
        selectAll(zcql, 'Schedule', `SELECT guard_id, sched_date, shift_code, post_id FROM Schedule WHERE sched_date >= '${from}' AND sched_date <= '${to}' AND published = true ORDER BY ROWID ASC`),
        selectAll(zcql, 'MonthRoster', `SELECT guard_id, codes, team FROM MonthRoster WHERE roster_month = '${month}' ORDER BY ROWID ASC`),
        selectAll(zcql, 'Posts', 'SELECT ROWID, post_name FROM Posts ORDER BY ROWID ASC')
      ]);
      const branchById = {};
      branches.filter(b => auth.branchOk(req, b.ROWID)).forEach(b => { branchById[String(b.ROWID)] = b; });
      const guards = auth.inArea(req, guardsAll).filter(g => branchById[String(g.branch_id)] && !String(g.tags || '').split(',').includes('Reliever'));
      const postName = {};
      posts.forEach(p => { postName[String(p.ROWID)] = p.post_name; });
      const rosterOf = {};
      roster.forEach(r => { rosterOf[String(r.guard_id)] = r; });
      const startOf = {};
      for (const id of Object.keys(branchById)) {
        startOf[id] = {};
        (await getShifts(zcql, id)).forEach(sh => { if (sh.start) startOf[id][sh.code] = sh.start; });
      }
      const nowIst = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 16).replace('T', ' ');
      const today = nowIst.slice(0, 10);
      const begun = (branch, day, code) => { const st = (startOf[branch] || {})[code]; if (!st) return day < today; return mins(day + ' ' + st + ':00') + 15 <= mins(nowIst + ':00'); };

      const logOf = {}, dutyOf = {};
      logs.forEach(l => { (logOf[String(l.guard_id) + '|' + String(l.duty_date).slice(0, 10)] = logOf[String(l.guard_id) + '|' + String(l.duty_date).slice(0, 10)] || []).push(l); });
      sched.forEach(s => { const k = String(s.guard_id) + '|' + String(s.sched_date).slice(0, 10); dutyOf[k] = dutyOf[k] || s; });

      const rows = [];
      for (const g of guards) {
        const id = String(g.ROWID);
        const r = rosterOf[id];
        const codes = String((r && r.codes) || '');
        const cells = [];
        const tot = { P: 0, AB: 0, L: 0, WO: 0, mins: 0 };
        const postCount = {};
        for (let d = 1; d <= days; d++) {
          const day = month + '-' + String(d).padStart(2, '0');
          const log = logOf[id + '|' + day] || [];
          const duty = dutyOf[id + '|' + day];
          const rc = codes[d - 1] || '';
          if (duty) postCount[duty.post_id] = (postCount[duty.post_id] || 0) + 1;
          const firstIn = log.find(l => l.direction === 'IN');
          if (firstIn) {
            const outs = log.filter(l => l.direction === 'OUT' && l.CREATEDTIME > firstIn.CREATEDTIME);
            const lastOut = outs[outs.length - 1];
            const worked = lastOut ? Math.max(0, Math.round(mins(lastOut.CREATEDTIME) - mins(firstIn.CREATEDTIME))) : 0;
            tot.P++; tot.mins += worked;
            cells.push({ s: 'P', c: (duty && duty.shift_code) || ('ABCG'.includes(rc) && rc) || 'P', in: String(firstIn.CREATEDTIME).slice(11, 16), out: lastOut ? String(lastOut.CREATEDTIME).slice(11, 16) : '', h: worked, post: duty ? postName[String(duty.post_id)] || '' : '' });
          } else if (rc === 'L') { tot.L++; cells.push({ s: 'L' }); }
          else if (rc === 'O') { tot.WO++; cells.push({ s: 'WO' }); }
          else if (duty && begun(String(g.branch_id), day, duty.shift_code)) { tot.AB++; cells.push({ s: 'AB', c: duty.shift_code, post: postName[String(duty.post_id)] || '' }); }
          else cells.push(day > today ? { s: '', f: 1 } : { s: '' });
        }
        // Not active and nothing this month: leave out.
        const any = cells.some(c => c.s);
        if (!any && !(g.is_active === 'true' || g.is_active === true)) continue;
        const topPost = Object.keys(postCount).sort((a, b) => postCount[b] - postCount[a])[0];
        const b = branchById[String(g.branch_id)];
        rows.push({
          gid: id, name: g.guard_name, clock: g.id_number || '', vendorId: g.card_number || '', agency: g.agency || '',
          team: (r && r.team) || (topPost ? postName[topPost] || '' : ''), branch: b.branch_name, branchId: String(g.branch_id), agencyId: String(g.agency_id || ''),
          state: b.state || '', city: b.city || '', cells, tot: { ...tot, hours: Math.floor(tot.mins / 60) + 'h ' + String(tot.mins % 60).padStart(2, '0') + 'm' }
        });
      }
      rows.sort((p, q) => p.branch.localeCompare(q.branch) || p.agency.localeCompare(q.agency) || p.name.localeCompare(q.name));
      res.status(200).json({ status: 'success', data: { month, days, today, rows } });
    } catch (err) {
      fail(res, err);
    }
  });
};
