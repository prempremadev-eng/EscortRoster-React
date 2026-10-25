'use strict';

/* ---------------- STRENGTH (admin home, Prem 26 Oct) ---------------- */
// One date + one shift, every branch · agency of the login's area:
//   allotted = guards on that day's published Schedule for that shift (a branch with no schedule that day:
//              the Month Roster letter of that shift), present = allotted with a card IN that duty day,
//   absent   = allotted without IN once the shift is 15 min old ("not yet" before), leave / off = the
//              roster's L / O that day (whole day, not per shift).
// GET /strength?date&shift → totals + one line per branch · agency; add &branch&agency for that group's
// people (who is IN, absent, on leave). About 6–10 reads per load; no timer.

const LATE_MIN = 15;

module.exports = function strengthRoutes(app, h) {
  const { catalyst, fail, requireDate, requireRowId, selectAll, getShifts, shiftDate, nowStamp, auth } = h;

  app.get('/strength', async (req, res) => {
    try {
      auth.need(req, 'branch_admin');
      const zcql = catalyst.initialize(req, { scope: 'admin' }).zcql();
      const date = requireDate(req.query.date || shiftDate());
      const shifts = await getShifts(zcql);
      const shift = shifts.find(s => s.code === String(req.query.shift || 'A')) || shifts[0];
      const area = auth.branchIn(req); // null = every branch
      if (area && !area.length) return res.status(200).json({ status: 'success', data: { date, shift, totals: null, groups: [] } });
      const inBranches = area ? ` AND branch_id IN (${area.map(requireRowId).join(', ')})` : '';
      const pickBranch = req.query.branch ? String(requireRowId(req.query.branch)) : '';
      const pickAgency = req.query.agency ? String(requireRowId(req.query.agency)) : '';

      const [branches, agencies, guards, slots, roster, ins] = await Promise.all([
        selectAll(zcql, 'Branches', `SELECT ROWID, branch_name, city FROM Branches WHERE is_active = 'true'${area ? ` AND ROWID IN (${area.map(requireRowId).join(', ')})` : ''} ORDER BY branch_name ASC`),
        selectAll(zcql, 'Agencies', 'SELECT ROWID, agency_name FROM Agencies ORDER BY agency_name ASC'),
        selectAll(zcql, 'Guards', `SELECT ROWID, guard_name, id_number, branch_id, agency_id FROM Guards WHERE is_active = 'true'${inBranches} ORDER BY ROWID ASC`),
        selectAll(zcql, 'Schedule', `SELECT guard_id, post_id, branch_id, shift_code FROM Schedule WHERE sched_date = '${date}' AND published = true${inBranches} ORDER BY ROWID ASC`),
        selectAll(zcql, 'MonthRoster', `SELECT guard_id, codes FROM MonthRoster WHERE roster_month = '${date.slice(0, 7)}'${inBranches} ORDER BY ROWID ASC`),
        selectAll(zcql, 'AccessLog', `SELECT guard_id, punch_time FROM AccessLog WHERE duty_date = '${date}' AND direction = 'IN' ORDER BY CREATEDTIME ASC`)
      ]);
      const day = Number(date.slice(8, 10)) - 1;
      const codeOf = {};
      roster.forEach(r => { const c = String(r.codes || '')[day]; if (c) codeOf[String(r.guard_id)] = c; });
      const firstIn = {};
      ins.forEach(x => { const id = String(x.guard_id); if (!firstIn[id]) firstIn[id] = x.punch_time; });
      const scheduled = new Set(slots.map(s => String(s.branch_id)));
      const onShift = {};
      slots.filter(s => s.shift_code === shift.code).forEach(s => { onShift[String(s.guard_id)] = String(s.post_id); });

      // Shift started 15 min ago? Before that nobody is "absent" yet.
      const begunOf = sh => (sh.start < '06:00' ? addDay(date) : date) + ' ' + sh.start <= minus(nowStamp(), LATE_MIN);
      const begun = begunOf(shift);

      // Every shift of the day in one go, for the home page's A / G / B / C lines (Prem, 26 Oct), plus the
      // day's leave and week off (roster L / O, not per shift).
      const branchOk = new Set(branches.map(b => String(b.ROWID)));
      const inArea = guards.filter(g => g.branch_id && branchOk.has(String(g.branch_id)));
      const byShift = shifts.map(sh => {
        const on = new Set(slots.filter(x => x.shift_code === sh.code).map(x => String(x.guard_id)));
        let allotted = 0, present = 0;
        inArea.forEach(g => {
          const id = String(g.ROWID);
          if (on.has(id) || (!scheduled.has(String(g.branch_id)) && codeOf[id] === sh.code)) { allotted++; if (firstIn[id]) present++; }
        });
        const b = begunOf(sh);
        return { code: sh.code, start: sh.start, end: sh.end, begun: b, allotted, present, absent: b ? allotted - present : 0 };
      }).sort((x, y) => 'AGBC'.indexOf(x.code) - 'AGBC'.indexOf(y.code));
      const day0 = { leave: inArea.filter(g => codeOf[String(g.ROWID)] === 'L').length, off: inArea.filter(g => codeOf[String(g.ROWID)] === 'O').length };

      const groups = {};
      const groupOf = g => {
        const key = String(g.branch_id) + '-' + String(g.agency_id || '');
        if (!groups[key]) groups[key] = { branchId: String(g.branch_id), agencyId: String(g.agency_id || ''), allotted: 0, present: 0, absent: 0, leave: 0, off: 0, people: [] };
        return groups[key];
      };
      for (const g of guards) {
        if (!g.branch_id) continue;
        const id = String(g.ROWID);
        const code = codeOf[id] || '';
        const allotted = id in onShift || (!scheduled.has(String(g.branch_id)) && code === shift.code);
        const gr = groupOf(g);
        let state = '';
        if (allotted) {
          gr.allotted++;
          if (firstIn[id]) { gr.present++; state = 'present'; } else if (begun) { gr.absent++; state = 'absent'; } else state = 'due';
        } else if (code === 'L') { gr.leave++; state = 'leave'; } else if (code === 'O') { gr.off++; state = 'off'; }
        if (state && pickBranch === String(g.branch_id) && pickAgency === String(g.agency_id || '')) {
          gr.people.push({ id: g.id_number || '', name: g.guard_name, state, in: firstIn[id] || '', postId: onShift[id] || '' });
        }
      }

      const branchById = {};
      branches.forEach(b => { branchById[String(b.ROWID)] = b; });
      const agencyById = {};
      agencies.forEach(a => { agencyById[String(a.ROWID)] = a.agency_name; });
      const list = Object.values(groups).filter(g => branchById[g.branchId] && (g.allotted || g.leave || g.off)).map(g => ({
        ...g, branch: branchById[g.branchId].branch_name, city: branchById[g.branchId].city || '', agency: agencyById[g.agencyId] || 'No agency',
        people: g.people.length ? g.people : undefined
      })).sort((a, b) => a.branch.localeCompare(b.branch) || a.agency.localeCompare(b.agency));

      // Post names for the picked group's people.
      const picked = list.find(g => g.people);
      if (picked) {
        const postIds = [...new Set(picked.people.map(p => p.postId).filter(Boolean))];
        const posts = postIds.length ? (await zcql.executeZCQLQuery(`SELECT ROWID, post_name FROM Posts WHERE ROWID IN (${postIds.map(requireRowId).join(', ')})`)).map(r => r.Posts) : [];
        const nameOf = {};
        posts.forEach(p => { nameOf[String(p.ROWID)] = p.post_name; });
        picked.people = picked.people.map(p => ({ ...p, post: nameOf[p.postId] || '' }))
          .sort((a, b) => ['absent', 'due', 'present', 'leave', 'off'].indexOf(a.state) - ['absent', 'due', 'present', 'leave', 'off'].indexOf(b.state) || a.name.localeCompare(b.name));
      }

      const totals = { allotted: 0, present: 0, absent: 0, leave: 0, off: 0 };
      list.forEach(g => Object.keys(totals).forEach(k => { totals[k] += g[k]; }));
      res.status(200).json({ status: 'success', data: { date, shift, shifts, begun, totals, groups: list, byShift, day: day0 } });
    } catch (err) {
      fail(res, err);
    }
  });

  function addDay(date) {
    const d = new Date(date + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }
  // "2026-10-26 06:20" minus n minutes (same text form, India time).
  function minus(stamp, n) {
    const d = new Date(stamp.replace(' ', 'T') + ':00Z');
    d.setUTCMinutes(d.getUTCMinutes() - n);
    return d.toISOString().slice(0, 16).replace('T', ' ');
  }
};
