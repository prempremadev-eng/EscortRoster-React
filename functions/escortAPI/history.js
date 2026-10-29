"use strict"

/* ---------------- POST HISTORY (screens 6–9) ---------------- */
// Every guard on duty at a post can read its whole history: who was on duty each shift,
// the works done there, and one past shift in full (view only), with "who was here at 01:20?"
// from the Presence rows.

const MAX_DAYS = 31;
const LATE_MIN = 10;
const PAGE = 300;

module.exports = function historyRoutes(app, h) {
  const { catalyst, fail, requireRowId, requireDate, getShifts, nowStamp, hhmm, minutesBetween, isTrue,
    namesOf, onDutyLog, viewLog, workView, mediaLinks, mediaLabel, postBranch } = h;

  // All rows of a query, 300 at a time (ZCQL's page size).
  async function all(zcql, table, query) {
    const rows = [];
    for (let offset = 1; ; offset += PAGE) {
      const page = (await zcql.executeZCQLQuery(`${query} LIMIT ${offset}, ${PAGE}`)).map(r => r[table]);
      rows.push(...page);
      if (page.length < PAGE) return rows;
    }
  }

  function range(req) {
    const from = requireDate(req.query.from);
    const to = requireDate(req.query.to);
    if (to < from) throw new Error('"To" date is before "From".');
    if (minutesBetween(from + ' 00:00', to + ' 00:00') / 1440 > MAX_DAYS) throw new Error('Pick ' + MAX_DAYS + ' days or less.');
    return { from, to };
  }

  // Shift start as a stamp: Shift C of 16 Oct starts 16 Oct 21:00.
  const shiftStart = (date, shift) => (shift && shift.start ? date + ' ' + shift.start : null);

  // Screens 6 + 7: who was on duty, shift by shift, in the dates picked.
  app.get('/postHistory', async (req, res) => {
    try {
      const catalystApp = catalyst.initialize(req, { scope: 'admin' });
      const zcql = catalystApp.zcql();
      const { log } = await viewLog(req, zcql);
      const { from, to } = range(req);
      const postId = requireRowId(log.post_id);
      const [logs, shifts, msgs] = await Promise.all([
        all(zcql, 'DutyLog', `SELECT ROWID, guard_id, shift_code, duty_date, status, in_at, taken_over_at, handed_over_at FROM DutyLog WHERE post_id = ${postId} AND duty_date >= '${from}' AND duty_date <= '${to}' ORDER BY CREATEDTIME ASC`),
        postBranch(zcql, postId).then(b => getShifts(zcql, b)),
        all(zcql, 'PostMessages', `SELECT duty_log_id, kind, CREATEDTIME FROM PostMessages WHERE post_id = ${postId} AND CREATEDTIME >= '${from} 00:00:00' ORDER BY CREATEDTIME ASC`)
      ]);
      const names = await namesOf(zcql, logs.map(l => l.guard_id));
      const counts = {};
      // Office messages and work updates have no shift of their own (26 Oct): they count in the shift that
      // was at the post at that minute.
      const stampOf = v => String(v || '').slice(0, 16);
      const shiftAt = t => logs.find(l => { const a = stampOf(l.taken_over_at || l.in_at); return a && a <= t && (!l.handed_over_at || t <= stampOf(l.handed_over_at)); });
      msgs.forEach(m => {
        const logId = m.duty_log_id || (shiftAt(stampOf(m.CREATEDTIME)) || {}).ROWID;
        if (!logId) return;
        const c = counts[String(logId)] = counts[String(logId)] || { notes: 0, photos: 0, works: 0, alerts: 0 };
        if (m.kind === 'text' || m.kind === 'voice') c.notes++;
        else if (m.kind === 'photo' || m.kind === 'video') c.photos++;
        else if (m.kind === 'work') c.works++;
        else if (m.kind === 'alert') c.alerts++;
      });
      const rows = logs.map(l => {
        const shift = shifts.find(s => s.code === l.shift_code);
        const start = shiftStart(l.duty_date, shift);
        return {
          ROWID: l.ROWID, mine: String(l.ROWID) === String(log.ROWID), name: (names[String(l.guard_id)] || {}).guard_name || 'Guard',
          date: l.duty_date, shift: l.shift_code, status: l.status,
          in: hhmm(l.in_at), took: hhmm(l.taken_over_at), handed: hhmm(l.handed_over_at),
          late: !!(start && l.taken_over_at && minutesBetween(start, l.taken_over_at) > LATE_MIN),
          counts: counts[String(l.ROWID)] || { notes: 0, photos: 0, works: 0, alerts: 0 }
        };
      });
      res.status(200).json({ status: 'success', data: { rows, shifts } });
    } catch (err) {
      fail(res, err);
    }
  });

  // Screen 8: contractor works at this post in the dates picked.
  app.get('/postWorks', async (req, res) => {
    try {
      const catalystApp = catalyst.initialize(req, { scope: 'admin' });
      const zcql = catalystApp.zcql();
      const { log } = await viewLog(req, zcql);
      const { from, to } = range(req);
      const works = await all(zcql, 'WorkUpdates', `SELECT * FROM WorkUpdates WHERE post_id = ${requireRowId(log.post_id)} AND started_at >= '${from} 00:00' AND started_at <= '${to} 23:59' ORDER BY CREATEDTIME DESC`);
      const names = await namesOf(zcql, works.flatMap(w => [w.guard_id, w.finished_by]));
      // An office work update has no guard: its chat card says who added it ("Name · Role").
      const officeIds = works.filter(w => !w.guard_id).map(w => requireRowId(w.ROWID));
      const officeBy = {};
      if (officeIds.length) {
        (await zcql.executeZCQLQuery(`SELECT ref_id, author_name FROM PostMessages WHERE kind = 'work' AND ref_id IN (${officeIds.join(', ')})`))
          .forEach(r => { officeBy[String(r.PostMessages.ref_id)] = r.PostMessages.author_name || ''; });
      }
      const nameOf = id => (names[String(id)] || {}).guard_name || '';
      res.status(200).json({
        status: 'success',
        data: works.map(w => ({ ...workView(w), date: String(w.started_at).slice(0, 10), addedBy: w.guard_id ? nameOf(w.guard_id) : officeBy[String(w.ROWID)] || 'Office', finishedBy: nameOf(w.finished_by) }))
      });
    } catch (err) {
      fail(res, err);
    }
  });

  // Screen 9: one past shift, view only: who stood at the post minute by minute + its timeline.
  app.get('/pastShift', async (req, res) => {
    try {
      const catalystApp = catalyst.initialize(req, { scope: 'admin' });
      const zcql = catalystApp.zcql();
      const { log } = await viewLog(req, zcql);
      const rows = await zcql.executeZCQLQuery(`SELECT * FROM DutyLog WHERE ROWID = ${requireRowId(req.query.log)}`);
      const shiftLog = rows.length ? rows[0].DutyLog : null;
      if (!shiftLog || String(shiftLog.post_id) !== String(log.post_id)) throw new Error('That shift is not at this post.');
      const postId = requireRowId(log.post_id);
      const shifts = await getShifts(zcql, await postBranch(zcql, postId));
      const shift = shifts.find(s => s.code === shiftLog.shift_code) || { code: shiftLog.shift_code, start: '', end: '' };
      // The window: from card IN (or shift start) to hand over (or now, if still on duty).
      const start = shiftLog.in_at || shiftStart(shiftLog.duty_date, shift) || shiftLog.duty_date + ' 00:00';
      const end = shiftLog.handed_over_at || nowStamp();

      // "Who was at this post" (minute by minute) is for Branch Admin and above only (Prem, 25 Oct): never
      // sent to a guard's link or a shift incharge. Relief / cover notes in the timeline stay for everyone.
      const seesPresence = !!req.user && req.user.role !== 'supervisor';
      const [presence, msgs] = await Promise.all([
        !seesPresence ? Promise.resolve([]) : all(zcql, 'Presence', `SELECT guard_id, kind, from_at, to_at FROM Presence WHERE post_id = ${postId} AND from_at <= '${end}' ORDER BY CREATEDTIME ASC`),
        all(zcql, 'PostMessages', `SELECT ROWID, guard_id, kind, text, pinned, ref_id, media_key, media_source, duration, CREATEDTIME FROM PostMessages WHERE post_id = ${postId} AND CREATEDTIME >= '${start}:00' AND CREATEDTIME <= '${end}:59' ORDER BY CREATEDTIME ASC`)
      ]);
      const segs = presence.filter(p => !p.to_at || p.to_at >= start);
      const workIds = msgs.filter(m => m.kind === 'work').map(m => m.ref_id).filter(Boolean);
      const [names, works, links] = await Promise.all([
        namesOf(zcql, segs.map(p => p.guard_id).concat(msgs.map(m => m.guard_id), [shiftLog.guard_id])),
        workIds.length ? zcql.executeZCQLQuery(`SELECT * FROM WorkUpdates WHERE ROWID IN (${workIds.map(requireRowId).join(', ')})`) : Promise.resolve([]),
        mediaLinks(req, msgs.filter(m => m.media_key).map(m => m.media_key))
      ]);
      const workById = {};
      works.forEach(r => { workById[String(r.WorkUpdates.ROWID)] = r.WorkUpdates; });
      const nameOf = id => (names[String(id)] || {}).guard_name || '';
      res.status(200).json({
        status: 'success',
        data: {
          name: nameOf(shiftLog.guard_id), shift, date: shiftLog.duty_date, start, end, open: !shiftLog.handed_over_at,
          // Clipped to the shift window; open rows (still there) end now.
          presence: !seesPresence ? null : segs.map(p => ({
            name: nameOf(p.guard_id), kind: p.kind,
            from: p.from_at < start ? start : p.from_at, to: !p.to_at || p.to_at > end ? end : p.to_at
          })),
          messages: msgs.map(m => ({
            ROWID: m.ROWID, kind: m.kind, text: m.text || (m.media_key ? mediaLabel(m.kind) : ''), pinned: isTrue(m.pinned),
            author: nameOf(m.guard_id), time: String(m.CREATEDTIME).slice(11, 16),
            work: m.kind === 'work' && workById[String(m.ref_id)] ? workView(workById[String(m.ref_id)]) : null,
            media: m.media_key ? { url: links[m.media_key] || '', source: m.media_source || '', duration: parseInt(m.duration, 10) || 0 } : null
          }))
        }
      });
    } catch (err) {
      fail(res, err);
    }
  });
};
