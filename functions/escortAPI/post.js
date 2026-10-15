"use strict"

/* ---------------- POST HANDOVER (guard at a gate / lobby, not escort) ---------------- */
// The WhatsApp group of a post, in the app:
//   card IN → DutyLog row "waiting" → guard meets the old guard → "Taken over"
//   → old guard "handed_over", new guard "on_duty" → notes on the post's timeline.
// DutyChart = the plan for the week. DutyLog = what really happened, one row per guard per duty day.
// PostMessages = the post's notebook; a note pinned by one guard is read by the next guard.
// Kept in its own file so the escort code stays as it is; it uses the helpers of index.js.

const MAX_TEXT = 255;
const TIMELINE_LIMIT = 100;
// ROWIDs are not given out in time order, so lists are sorted by time (CREATEDTIME / *_at).

module.exports = function postRoutes(app, h) {
  const { catalyst, selectAll, requireRowId, fail, guardByToken, sendPushToGuard, getShifts, shiftDate, IST_OFFSET_MIN } = h;

  // "2026-10-16 05:58" in India time. Date and time together, because Shift C runs past midnight.
  function nowStamp() {
    return new Date(Date.now() + IST_OFFSET_MIN * 60000).toISOString().slice(0, 16).replace('T', ' ');
  }

  const isTrue = v => v === true || v === 'true';

  // The guard's DutyLog row for the running duty day, or null (no card IN yet).
  async function myLog(zcql, guardId) {
    const rows = await zcql.executeZCQLQuery(`SELECT * FROM DutyLog WHERE guard_id = ${requireRowId(guardId)} AND duty_date = '${shiftDate()}' ORDER BY CREATEDTIME DESC LIMIT 1`);
    return rows.length ? rows[0].DutyLog : null;
  }

  // Who is on duty at this post now (other than me): the guard I take over from.
  async function onDutyAt(zcql, postId, myLogId) {
    const rows = await zcql.executeZCQLQuery(`SELECT * FROM DutyLog WHERE post_id = ${requireRowId(postId)} AND status = 'on_duty' ORDER BY taken_over_at DESC`);
    return rows.map(r => r.DutyLog).filter(l => String(l.ROWID) !== String(myLogId));
  }

  async function namesOf(zcql, guardIds) {
    const ids = [...new Set(guardIds.filter(Boolean).map(String))].map(requireRowId);
    if (!ids.length) return {};
    const rows = await zcql.executeZCQLQuery(`SELECT ROWID, guard_name, guard_token FROM Guards WHERE ROWID IN (${ids.join(', ')})`);
    const map = {};
    rows.forEach(r => { map[String(r.Guards.ROWID)] = r.Guards; });
    return map;
  }

  function addMessage(catalystApp, row) {
    return catalystApp.datastore().table('PostMessages').insertRow({ pinned: false, ...row });
  }

  // F1: called on the first card IN of the day of a guard whose chart row is a POST.
  // Makes their DutyLog row (waiting) unless it is already there.
  async function onPostIn(catalystApp, guard, duty) {
    const zcql = catalystApp.zcql();
    const existing = await myLog(zcql, guard.ROWID);
    if (existing) return existing;
    return catalystApp.datastore().table('DutyLog').insertRow({
      guard_id: guard.ROWID, post_id: duty.post.ROWID, shift_code: duty.shift.code,
      duty_date: shiftDate(), status: 'waiting', in_at: nowStamp()
    });
  }

  // Screens 1 and 2: my post, my shift, who I take over from, and their pinned notes.
  app.get('/postDuty', async (req, res) => {
    try {
      const catalystApp = catalyst.initialize(req);
      const zcql = catalystApp.zcql();
      const me = await guardByToken(zcql, req.query.t);
      const log = await myLog(zcql, me.ROWID);
      if (!log) {
        return res.status(200).json({ status: 'success', data: { name: me.guard_name, locked: true } });
      }
      const [posts, shifts, others] = await Promise.all([
        zcql.executeZCQLQuery(`SELECT ROWID, post_name, branch_id FROM Posts WHERE ROWID = ${requireRowId(log.post_id)}`),
        getShifts(zcql),
        log.status === 'waiting' ? onDutyAt(zcql, log.post_id, log.ROWID) : Promise.resolve([])
      ]);
      const post = posts.length ? posts[0].Posts : { post_name: 'Post', branch_id: null };
      const branches = post.branch_id
        ? await zcql.executeZCQLQuery(`SELECT branch_name, area, supervisor_phone FROM Branches WHERE ROWID = ${requireRowId(post.branch_id)}`)
        : [];
      const branch = branches.length ? branches[0].Branches : {};

      // Handover notes: what the last guard of this post pinned for the next guard.
      let from = null;
      let notes = [];
      if (log.status === 'waiting') {
        const prev = others[0] || null;
        const lastLogs = prev ? [prev] : (await zcql.executeZCQLQuery(`SELECT * FROM DutyLog WHERE post_id = ${requireRowId(log.post_id)} AND status = 'handed_over' ORDER BY handed_over_at DESC LIMIT 1`)).map(r => r.DutyLog);
        const last = lastLogs[0];
        if (last) {
          const pinned = await zcql.executeZCQLQuery(`SELECT ROWID, text, CREATEDTIME FROM PostMessages WHERE duty_log_id = ${requireRowId(last.ROWID)} AND pinned = true ORDER BY CREATEDTIME ASC`);
          notes = pinned.map(r => ({ text: r.PostMessages.text, time: String(r.PostMessages.CREATEDTIME).slice(11, 16) }));
        }
        if (prev) {
          const names = await namesOf(zcql, [prev.guard_id]);
          from = { name: (names[String(prev.guard_id)] || {}).guard_name || 'Guard', shift: prev.shift_code, since: (prev.taken_over_at || '').slice(11, 16) };
        }
      }
      res.status(200).json({
        status: 'success',
        data: {
          name: me.guard_name, locked: false, status: log.status,
          inAt: (log.in_at || '').slice(11, 16), takenOverAt: (log.taken_over_at || '').slice(11, 16),
          handedOverAt: (log.handed_over_at || '').slice(11, 16),
          post: post.post_name, branch: [branch.branch_name, branch.area].filter(Boolean).join(' · '),
          supervisorPhone: branch.supervisor_phone || '',
          shift: shifts.find(s => s.code === log.shift_code) || { code: log.shift_code, start: '', end: '' },
          from, notes
        }
      });
    } catch (err) {
      fail(res, err);
    }
  });

  // F4: only the incoming guard presses it. The guard on duty before is handed over at once.
  app.post('/takeOver', async (req, res) => {
    try {
      const catalystApp = catalyst.initialize(req);
      const zcql = catalystApp.zcql();
      const me = await guardByToken(zcql, req.body.t);
      const log = await myLog(zcql, me.ROWID);
      if (!log) throw new Error('Your card IN is not there yet.');
      if (log.status !== 'waiting') throw new Error('You have already taken over.');
      const now = nowStamp();
      const table = catalystApp.datastore().table('DutyLog');
      const prevs = await onDutyAt(zcql, log.post_id, log.ROWID);
      for (const p of prevs) {
        await table.updateRow({ ROWID: p.ROWID, status: 'handed_over', handed_over_at: now });
      }
      await table.updateRow({ ROWID: log.ROWID, status: 'on_duty', taken_over_at: now });

      const names = await namesOf(zcql, prevs.map(p => p.guard_id));
      const prevName = prevs.length ? (names[String(prevs[0].guard_id)] || {}).guard_name : null;
      const time = now.slice(11, 16);
      await addMessage(catalystApp, {
        post_id: log.post_id, duty_log_id: log.ROWID, guard_id: me.ROWID, kind: 'system',
        text: me.guard_name + (prevName ? ' took over from ' + prevName : ' took over') + ' · ' + time
      });

      // "You can leave" to the guard going home. A push problem must not undo the take-over.
      const posts = await zcql.executeZCQLQuery(`SELECT post_name FROM Posts WHERE ROWID = ${requireRowId(log.post_id)}`);
      const postName = posts.length ? posts[0].Posts.post_name : 'your post';
      for (const p of prevs) {
        const g = names[String(p.guard_id)] || {};
        try {
          await sendPushToGuard(catalystApp, p.guard_id, {
            title: '👋 Handed over · ' + time,
            body: me.guard_name + ' took over ' + postName + '. You can leave.',
            url: g.guard_token ? 'index.html#guard/' + g.guard_token : 'index.html'
          });
        } catch (err) {
          console.error('Handover push failed:', err);
        }
      }
      res.status(200).json({ status: 'success', data: { takenOverAt: time, from: prevName } });
    } catch (err) {
      fail(res, err);
    }
  });

  // My log, only once I am on duty (timeline is read and written only by the guard on duty).
  async function onDutyLog(zcql, token) {
    const me = await guardByToken(zcql, token);
    const log = await myLog(zcql, me.ROWID);
    if (!log || log.status !== 'on_duty') throw new Error('Press Taken over first.');
    return { me, log };
  }

  // Screen 3: the post's latest notes (all shifts), oldest first. No auto-refresh: 🔄 button.
  app.get('/postTimeline', async (req, res) => {
    try {
      const catalystApp = catalyst.initialize(req);
      const zcql = catalystApp.zcql();
      const { me, log } = await onDutyLog(zcql, req.query.t);
      const rows = (await zcql.executeZCQLQuery(`SELECT ROWID, duty_log_id, guard_id, kind, text, pinned, CREATEDTIME FROM PostMessages WHERE post_id = ${requireRowId(log.post_id)} ORDER BY CREATEDTIME DESC LIMIT ${TIMELINE_LIMIT}`))
        .map(r => r.PostMessages).reverse();
      const names = await namesOf(zcql, rows.map(m => m.guard_id));
      res.status(200).json({
        status: 'success',
        data: rows.map(m => ({
          ROWID: m.ROWID, kind: m.kind, text: m.text, pinned: isTrue(m.pinned),
          mine: String(m.guard_id) === String(me.ROWID),
          // Only my own shift's notes can be pinned / unpinned.
          myShift: String(m.duty_log_id) === String(log.ROWID),
          author: (names[String(m.guard_id)] || {}).guard_name || '',
          date: String(m.CREATEDTIME).slice(0, 10), time: String(m.CREATEDTIME).slice(11, 16)
        }))
      });
    } catch (err) {
      fail(res, err);
    }
  });

  // F6: a text note on the timeline.
  app.post('/postMessage', async (req, res) => {
    try {
      const catalystApp = catalyst.initialize(req);
      const zcql = catalystApp.zcql();
      const { me, log } = await onDutyLog(zcql, req.body.t);
      const text = String(req.body.text || '').trim();
      if (!text) throw new Error('Write a note first.');
      if (text.length > MAX_TEXT) throw new Error('Note is too long (max ' + MAX_TEXT + ' letters).');
      const row = await addMessage(catalystApp, { post_id: log.post_id, duty_log_id: log.ROWID, guard_id: me.ROWID, kind: 'text', text });
      res.status(200).json({ status: 'success', data: { ROWID: row.ROWID, time: String(row.CREATEDTIME).slice(11, 16) } });
    } catch (err) {
      fail(res, err);
    }
  });

  // F10: pin / unpin one of my own notes of this shift for the next guard.
  app.post('/pinMessage', async (req, res) => {
    try {
      const catalystApp = catalyst.initialize(req);
      const zcql = catalystApp.zcql();
      const { log } = await onDutyLog(zcql, req.body.t);
      const rows = await zcql.executeZCQLQuery(`SELECT ROWID, duty_log_id, kind FROM PostMessages WHERE ROWID = ${requireRowId(req.body.rowid)}`);
      const m = rows.length ? rows[0].PostMessages : null;
      if (!m || String(m.duty_log_id) !== String(log.ROWID) || m.kind !== 'text') {
        throw new Error('You can pin only your own notes of this shift.');
      }
      const pinned = req.body.pinned === true;
      await catalystApp.datastore().table('PostMessages').updateRow({ ROWID: m.ROWID, pinned });
      res.status(200).json({ status: 'success', data: { pinned } });
    } catch (err) {
      fail(res, err);
    }
  });

  return { onPostIn };
};
