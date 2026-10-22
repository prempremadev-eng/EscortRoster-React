"use strict"

/* ---------------- SUPERVISOR INBOX (screen 13) ---------------- */
// Every post of a branch like a WhatsApp Web chat list: alerts and empty posts on top, unread
// counts, and one post's timeline with a message box. The supervisor's name comes from the login,
// and each screen shows only the branches (and, for an agency supervisor, the posts) of their area.

const ACTIVE = ['waiting', 'on_duty', 'on_break', 'out'];
const GENERAL = 'G';

const { escortDay, EXTRA } = require('./escortRoster.js');

module.exports = function supervisorRoutes(app, h) {
  const { catalyst, fail, requireRowId, requireDate, getShifts, shiftDate, weekStartOf, nowStamp, hhmm, minutesBetween, cleanText, MAX_TEXT,
    namesOf, addMessage, timelineData, workView, sendPushToGuard, sendPushToRows, getVapidKeys, auth } = h;

  const statusIn = list => '(' + list.map(s => `status = '${s}'`).join(' OR ') + ')';
  const idList = ids => [...new Set(ids.map(String))].map(requireRowId).join(', ');

  function days() {
    const today = shiftDate();
    const d = new Date(today + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - 1);
    return { today, yesterday: d.toISOString().slice(0, 10) };
  }

  // Guards at these posts now: today's rows, plus last night's shift C still running.
  async function activeLogs(zcql, postIds) {
    if (!postIds.length) return [];
    const { today, yesterday } = days();
    const rows = (await zcql.executeZCQLQuery(`SELECT * FROM DutyLog WHERE post_id IN (${idList(postIds)}) AND (duty_date = '${today}' OR duty_date = '${yesterday}') ORDER BY CREATEDTIME DESC`))
      .map(r => r.DutyLog);
    return rows.filter(l => ACTIVE.includes(l.status));
  }

  // "Name (Role)" as guards see it on alerts and messages.
  const supName = req => req.user.name;
  const supLabel = req => req.user.name + ' (' + auth.ROLE_NAME[req.user.role] + ')';

  // One post of my area, or an error.
  async function myPost(req, zcql, postId) {
    const rows = await zcql.executeZCQLQuery(`SELECT ROWID, post_name, branch_id, agency_id FROM Posts WHERE ROWID = ${requireRowId(postId)}`);
    if (!rows.length) throw new Error('Post not found.');
    return auth.requireRow(req, rows[0].Posts, 'post');
  }

  // Post list of one branch with status, open alerts, last message and unread count.
  // `seen` = { postId: "YYYY-MM-DD HH:MM:SS" } of what this supervisor has already read (kept in the browser).
  app.post('/supInbox', async (req, res) => {
    try {
      const catalystApp = catalyst.initialize(req, { scope: 'admin' });
      const zcql = catalystApp.zcql();
      const branch = auth.requireBranch(req, requireRowId(req.body.branch));
      const seen = req.body.seen && typeof req.body.seen === 'object' ? req.body.seen : {};
      const posts = await branchPosts(req, zcql, branch);
      if (!posts.length) return res.status(200).json({ status: 'success', data: [] });
      const ids = posts.map(p => p.ROWID);
      const { yesterday } = days();
      const [logs, alerts, brks, msgs] = await Promise.all([
        activeLogs(zcql, ids),
        zcql.executeZCQLQuery(`SELECT post_id FROM Alerts WHERE post_id IN (${idList(ids)}) AND status = 'sent'`).then(r => r.map(x => x.Alerts)),
        zcql.executeZCQLQuery(`SELECT post_id, status, type FROM Breaks WHERE post_id IN (${idList(ids)}) AND ${statusIn(['accepted', 'alone'])}`).then(r => r.map(x => x.Breaks)),
        zcql.executeZCQLQuery(`SELECT post_id, kind, text, author_name, guard_id, CREATEDTIME FROM PostMessages WHERE post_id IN (${idList(ids)}) AND CREATEDTIME >= '${yesterday} 00:00:00' ORDER BY CREATEDTIME DESC LIMIT 300`).then(r => r.map(x => x.PostMessages))
      ]);
      const names = await namesOf(zcql, logs.map(l => l.guard_id).concat(msgs.map(m => m.guard_id)));
      const nameOf = id => (names[String(id)] || {}).guard_name || '';

      const list = posts.map(p => {
        const id = String(p.ROWID);
        const here = logs.filter(l => String(l.post_id) === id);
        const main = here.find(l => l.shift_code !== GENERAL) || here[0] || null;
        const brk = brks.find(b => String(b.post_id) === id);
        const alertCount = alerts.filter(a => String(a.post_id) === id).length;
        let status = 'none';
        if (main) {
          if (main.status === 'on_duty') status = 'on_duty';
          else if (main.status === 'waiting') status = 'waiting';
          else if (main.status === 'out') status = 'empty';
          else if (main.status === 'on_break') status = brk && brk.status === 'accepted' ? 'break' : 'empty';
        }
        if (alertCount) status = 'alert';
        const postMsgs = msgs.filter(m => String(m.post_id) === id);
        const last = postMsgs[0];
        const read = String(seen[id] || '');
        return {
          ROWID: id, name: p.post_name, status, alerts: alertCount,
          guard: main ? nameOf(main.guard_id) : '', shift: main ? main.shift_code : '',
          last: last ? { text: last.kind === 'supervisor' ? 'You: ' + last.text : (last.text || { photo: 'Photo', video: 'Video', voice: 'Voice note', work: 'Work update', alert: 'Alert' }[last.kind] || ''), time: String(last.CREATEDTIME).slice(11, 16), stamp: String(last.CREATEDTIME).slice(0, 19) } : null,
          unread: postMsgs.filter(m => m.kind !== 'supervisor' && String(m.CREATEDTIME).slice(0, 19) > read).length
        };
      });
      const rank = { alert: 0, empty: 1, waiting: 2, break: 3, on_duty: 4, none: 5 };
      list.sort((a, b) => rank[a.status] - rank[b.status] || String(b.last ? b.last.stamp : '').localeCompare(String(a.last ? a.last.stamp : '')));
      res.status(200).json({ status: 'success', data: list });
    } catch (err) {
      fail(res, err);
    }
  });

  // One post: header (who is here, safety now) + its timeline. Opening it marks open alerts as
  // seen by this supervisor, and the guard is told.
  app.get('/supPost', async (req, res) => {
    try {
      const catalystApp = catalyst.initialize(req, { scope: 'admin' });
      const zcql = catalystApp.zcql();
      const postId = requireRowId(req.query.post);
      const post = await myPost(req, zcql, postId);
      const name = supName(req);
      const logs = await activeLogs(zcql, [postId]);
      const guardRows = logs.length ? await zcql.executeZCQLQuery(`SELECT ROWID, guard_name, phone, guard_token FROM Guards WHERE ROWID IN (${idList(logs.map(l => l.guard_id))})`) : [];
      const guards = {};
      guardRows.forEach(r => { guards[String(r.Guards.ROWID)] = r.Guards; });
      const main = logs.find(l => l.shift_code !== GENERAL) || logs[0] || null;

      {
        const open = (await zcql.executeZCQLQuery(`SELECT ROWID, guard_id FROM Alerts WHERE post_id = ${postId} AND status = 'sent'`)).map(r => r.Alerts);
        const now = nowStamp();
        for (const a of open) {
          await catalystApp.datastore().table('Alerts').updateRow({ ROWID: a.ROWID, status: 'seen', seen_by: supLabel(req), seen_at: now });
          const g = guards[String(a.guard_id)];
          if (g) {
            try {
              await sendPushToGuard(catalystApp, g.ROWID, { title: '👀 Alert seen · ' + hhmm(now), body: 'Seen by ' + supLabel(req) + '.', url: 'index.html#guard/' + g.guard_token });
            } catch (err) {
              console.error('Alert seen push failed:', err);
            }
          }
        }
      }

      const safety = main ? await zcql.executeZCQLQuery(`SELECT name, phone FROM SafetyEntries WHERE post_id = ${postId} AND duty_date = '${main.duty_date}' AND shift_code = '${main.shift_code}' ORDER BY CREATEDTIME DESC LIMIT 1`) : [];
      const { messages } = await timelineData(req, catalystApp, zcql, postId, { supervisor: name });
      res.status(200).json({
        status: 'success',
        data: {
          post: post.post_name,
          guards: logs.map(l => ({
            name: (guards[String(l.guard_id)] || {}).guard_name || 'Guard', phone: (guards[String(l.guard_id)] || {}).phone || '',
            shift: l.shift_code, status: l.status, took: hhmm(l.taken_over_at), main: l === main
          })),
          safety: safety.length ? safety[0].SafetyEntries.name : '',
          messages
        }
      });
    } catch (err) {
      fail(res, err);
    }
  });

  /* ---------- SUPERVISOR NOTIFICATIONS ---------- */
  // A supervisor's browser (laptop or phone) subscribes for one branch. Guard messages, alerts and
  // empty posts of that branch are pushed to it, and an open supervisor page refreshes itself on
  // them: no timer polling. Normal messages replace the post's last notification quietly;
  // alerts and empty posts buzz again.

  app.get('/supVapid', async (req, res) => {
    try {
      const keys = await getVapidKeys(catalyst.initialize(req, { scope: 'admin' }));
      res.status(200).json({ status: 'success', data: { vapidPublicKey: keys.publicKey } });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post('/supSubscribe', async (req, res) => {
    try {
      const catalystApp = catalyst.initialize(req, { scope: 'admin' });
      const zcql = catalystApp.zcql();
      const branch = auth.requireBranch(req, requireRowId(req.body.branch));
      const name = supName(req);
      const agency = req.scope.agency || null;
      const sub = req.body.subscription;
      if (!sub || typeof sub.endpoint !== 'string' || !sub.endpoint.startsWith('https://') || !sub.keys) throw new Error('Invalid subscription');
      const device = ['android', 'iphone'].includes(req.body.device) ? req.body.device : 'other';
      const rows = (await zcql.executeZCQLQuery(`SELECT ROWID, subscription_json FROM SupervisorSubs WHERE branch_id = ${branch}`)).map(r => r.SupervisorSubs);
      const same = rows.find(r => { try { return JSON.parse(r.subscription_json).endpoint === sub.endpoint; } catch { return false; } });
      const table = catalystApp.datastore().table('SupervisorSubs');
      if (same) await table.updateRow({ ROWID: same.ROWID, sup_name: name, agency_id: agency });
      else await table.insertRow({ branch_id: branch, agency_id: agency, sup_name: name, subscription_json: JSON.stringify(sub), device });
      res.status(200).json({ status: 'success', data: { saved: true } });
    } catch (err) {
      fail(res, err);
    }
  });

  // Called by the guard routes. Never fails the guard's own action.
  async function notify(catalystApp, postId, title, body, urgent) {
    try {
      const zcql = catalystApp.zcql();
      const posts = await zcql.executeZCQLQuery(`SELECT post_name, branch_id, agency_id FROM Posts WHERE ROWID = ${requireRowId(postId)}`);
      if (!posts.length || !posts[0].Posts.branch_id) return;
      const post = posts[0].Posts;
      // An agency supervisor hears only their agency's posts; branch-wide browsers hear all.
      const subs = (await zcql.executeZCQLQuery(`SELECT ROWID, subscription_json, device, agency_id FROM SupervisorSubs WHERE branch_id = ${requireRowId(post.branch_id)}`))
        .map(r => r.SupervisorSubs).filter(s => !s.agency_id || String(s.agency_id) === String(post.agency_id || ''));
      await sendPushToRows(catalystApp, 'SupervisorSubs', subs, {
        title: (urgent ? '🚨 ' : '') + post.post_name + ' · ' + title, body,
        url: 'index.html#supervisor/' + postId, urgent: !!urgent, tag: 'sup-' + postId, renotify: !!urgent
      });
    } catch (err) {
      console.error('Supervisor push failed:', err);
    }
  }

  /* ---------- LIVE BOARD (screen 10) ---------- */
  // One branch, one shift: every post with who should be there (Duty Chart) and what really
  // happened (DutyLog), plus what needs the supervisor now. About 7 reads per load; no timer.
  const LATE_IN_MIN = 15;
  const plusMin = (hm, n) => { const t = Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5)) + n; return String(Math.floor(t / 60) % 24).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };
  // Escort duty starts (notes/ESCORT-RULES.md): 6 to 5 at 18:00, 9 to 6 at 21:00.
  const ESCORT_START = { '6 to 5': '18:00', '9 to 6': '21:00' };
  const NO_TAKEOVER_MIN = 10;

  // The shift running now (the latest A / B / C that has started today); C before 06:00.
  function runningShift(shifts, now) {
    const hm = now.slice(11, 16);
    // The general shift (G) never hides the A / B / C shift running beside it.
    const started = shifts.filter(s => s.code !== GENERAL && s.start && s.start <= hm).sort((a, b) => b.start.localeCompare(a.start));
    return (started[0] || shifts.find(s => s.code === 'C') || shifts[0] || {}).code;
  }

  app.get('/supBoard', async (req, res) => {
    try {
      const catalystApp = catalyst.initialize(req, { scope: 'admin' });
      const zcql = catalystApp.zcql();
      const branch = auth.requireBranch(req, requireRowId(req.query.branch));
      const shifts = await getShifts(zcql);
      const now = nowStamp();
      const code = shifts.some(s => s.code === req.query.shift) ? req.query.shift : runningShift(shifts, now);
      const shift = shifts.find(s => s.code === code) || { code, start: '', end: '' };
      const day = shiftDate();
      const startStamp = shift.start ? day + ' ' + shift.start : null;
      const started = startStamp && now >= startStamp;

      const posts = await branchPosts(req, zcql, branch);
      if (!posts.length) return res.status(200).json({ status: 'success', data: { shift, shifts, date: day, posts: [], kpi: { total: 0, onDuty: 0, waiting: 0, notIn: 0 }, attention: [], works: [] } });
      const ids = idList(posts.map(p => p.ROWID));
      const [weekly, planned, logs, brks, openW, recentW] = await Promise.all([
        zcql.executeZCQLQuery(`SELECT guard_id, post_id FROM DutyChart WHERE week_start = '${weekStartOf(day)}' AND shift_code = '${code}' AND post_id IN (${ids})`).then(r => r.map(x => x.DutyChart)),
        zcql.executeZCQLQuery(`SELECT guard_id, post_id, shift_code FROM Schedule WHERE branch_id = ${branch} AND sched_date = '${day}' AND published = true`).then(r => r.map(x => x.Schedule)),
        // Today's logs, plus a guard from yesterday who is still at the post (no Card OUT / handover yet);
        // yesterday's finished duty (Card OUT) is not shown on today's board (Prem, 22 Oct).
        activeLogs(zcql, posts.map(p => p.ROWID)).then(l => l.filter(x => x.shift_code === code && (x.duty_date === day || ['on_duty', 'on_break'].includes(x.status)))),
        zcql.executeZCQLQuery(`SELECT post_id, status, cover_guard_id, start_at FROM Breaks WHERE post_id IN (${ids}) AND ${statusIn(['accepted', 'alone'])}`).then(r => r.map(x => x.Breaks)),
        zcql.executeZCQLQuery(`SELECT * FROM WorkUpdates WHERE post_id IN (${ids}) AND finished_at IS NULL`).then(r => r.map(x => x.WorkUpdates)),
        zcql.executeZCQLQuery(`SELECT * FROM WorkUpdates WHERE post_id IN (${ids}) AND started_at >= '${day} 00:00' ORDER BY CREATEDTIME DESC LIMIT 6`).then(r => r.map(x => x.WorkUpdates))
      ]);
      // A published day schedule replaces the weekly chart for that day.
      const chart = planned.length ? planned.filter(p => p.shift_code === code && posts.some(x => String(x.ROWID) === String(p.post_id))) : weekly;
      const names = await namesOf(zcql, chart.map(c => c.guard_id).concat(logs.map(l => l.guard_id), brks.map(b => b.cover_guard_id)));
      const nameOf = id => (names[String(id)] || {}).guard_name || 'Guard';
      const postName = id => (posts.find(p => String(p.ROWID) === String(id)) || {}).post_name || 'Post';

      const attention = [];
      const cards = posts.map(p => {
        const id = String(p.ROWID);
        const log = logs.find(l => String(l.post_id) === id);
        const planned = chart.filter(c => String(c.post_id) === id);
        const brk = brks.find(b => String(b.post_id) === id);
        let state = 'none';
        let guard = planned.length ? planned.map(c => nameOf(c.guard_id)).join(', ') : '';
        let meta = planned.length ? 'Scheduled' : 'No guard scheduled';
        if (log) {
          guard = nameOf(log.guard_id);
          if (log.status === 'on_duty') { state = 'on_duty'; meta = 'Took over ' + hhmm(log.taken_over_at); }
          else if (log.status === 'waiting') {
            const wait = Math.floor(minutesBetween(log.in_at, now));
            state = 'waiting'; meta = 'IN ' + hhmm(log.in_at) + ' · not taken over · ' + wait + ' min';
            if (wait >= NO_TAKEOVER_MIN) attention.push({ post: p.post_name, postId: id, text: guard + ' IN at ' + hhmm(log.in_at) + ' · no takeover for ' + wait + ' min', level: 'amber' });
          } else if (log.status === 'out') {
            state = 'empty'; meta = 'Card OUT · post empty';
            attention.push({ post: p.post_name + ' · Empty', postId: id, text: guard + ' card OUT, no one at the post', level: 'red' });
          } else if (log.status === 'on_break') {
            if (brk && brk.status === 'accepted') { state = 'break'; meta = 'On break · covered by ' + nameOf(brk.cover_guard_id); }
            else {
              state = 'empty'; meta = 'On break · no cover';
              attention.push({ post: p.post_name + ' · Empty', postId: id, text: guard + ' on break, no cover' + (brk ? ' · ' + hhmm(brk.start_at) : ''), level: 'red' });
            }
          }
        } else if (planned.length && started) {
          // First 15 min of the shift: "Due" (grey), then "Not IN" (red) and Needs attention.
          if (minutesBetween(startStamp, now) < LATE_IN_MIN) {
            state = 'due'; meta = 'Shift started ' + shift.start + ' · IN expected by ' + plusMin(shift.start, LATE_IN_MIN);
          } else {
            state = 'not_in'; meta = 'Not IN · shift started ' + shift.start;
            attention.push({ post: p.post_name, postId: id, text: guard + ' not IN · shift started ' + shift.start, level: 'red' });
          }
        }
        return { ROWID: id, name: p.post_name, state, guard, meta };
      });
      openW.filter(w => w.permit_end && now > w.permit_end).forEach(w => {
        attention.push({ post: postName(w.post_id) + ' · Permit expired', postId: String(w.post_id), text: w.contractor + ' still working after ' + w.permit_to, level: 'red' });
      });
      // Escort section (Shift B and C boards, weekdays): 6 to 5 starts 18:00 and 9 to 6 at 21:00, both inside
      // Shift B, and run on through C. Today's escort lists with IN / OUT and the trip running now.
      let escort = null;
      if (code === 'B' || code === 'C') {
        const rosterDay = await escortDay(catalystApp, day);
        if (rosterDay) {
          const list = rosterDay.rows.filter(r => r.onDuty);
          const gids = list.map(r => r.guardId);
          const eids = list.map(r => String(r.guard.escort_id)).filter(Boolean);
          const [punches, running] = await Promise.all([
            gids.length ? zcql.executeZCQLQuery(`SELECT guard_id, direction, punch_time FROM AccessLog WHERE duty_date = '${day}' AND guard_id IN (${idList(gids)}) ORDER BY CREATEDTIME ASC LIMIT 0, 300`).then(r => r.map(x => x.AccessLog)) : [],
            eids.length ? zcql.executeZCQLQuery(`SELECT escort_id, route_no, location, out_time FROM DutyRecords WHERE duty_date = '${day}' AND escort_id IN (${idList(eids)}) AND out_time != '' AND (in_time = '' OR in_time IS NULL) LIMIT 0, 300`).then(r => r.map(x => x.DutyRecords)) : []
          ]);
          const firstIn = {}, last = {};
          punches.forEach(x => { const g = String(x.guard_id); if (x.direction === 'IN' && !firstIn[g]) firstIn[g] = x.punch_time; last[g] = x; });
          const rows = list.map(r => {
            const g = r.guardId, trip = running.find(t => String(t.escort_id) === String(r.guard.escort_id));
            const out = last[g] && last[g].direction === 'OUT';
            const startAt = ESCORT_START[r.batch];
            let state = 'due', meta = 'Starts ' + startAt;
            if (out) { state = 'empty'; meta = 'Card OUT ' + last[g].punch_time; }
            else if (trip) { state = 'on_duty'; meta = 'On trip · Route ' + trip.route_no + (trip.location ? ' · ' + trip.location : '') + ' · since ' + trip.out_time; }
            else if (firstIn[g]) { state = 'on_duty'; meta = 'IN ' + firstIn[g]; }
            else if (now >= day + ' ' + plusMin(startAt, LATE_IN_MIN)) {
              state = 'not_in'; meta = 'Not IN · starts ' + startAt;
              attention.push({ post: 'Escort ' + r.batch + ' · S.No ' + r.seat, postId: '', text: nameOf(g) === 'Guard' ? r.guard.guard_name + ' not IN' : nameOf(g) + ' not IN', level: 'red' });
            }
            if (out) attention.push({ post: 'Escort ' + r.batch + ' · S.No ' + r.seat, postId: '', text: r.guard.guard_name + ' card OUT ' + last[g].punch_time, level: 'red' });
            return { seat: r.seat, batch: r.batch, name: r.guard.guard_name, state, meta };
          });
          escort = {
            rows,
            kpi: { total: rows.length, in: rows.filter(x => x.state === 'on_duty').length, onTrip: running.length, notIn: rows.filter(x => x.state === 'not_in').length }
          };
        }
      }
      attention.sort((a, b) => (a.level === b.level ? 0 : a.level === 'red' ? -1 : 1));
      const kpi = {
        total: cards.length,
        onDuty: cards.filter(c => c.state === 'on_duty' || c.state === 'break').length,
        waiting: cards.filter(c => c.state === 'waiting').length,
        notIn: cards.filter(c => c.state === 'not_in').length
      };
      res.status(200).json({
        status: 'success',
        data: {
          shift, shifts, date: day, posts: cards, kpi, attention, escort,
          works: recentW.map(w => ({ ...workView(w), post: postName(w.post_id), postId: String(w.post_id) }))
        }
      });
    } catch (err) {
      fail(res, err);
    }
  });

  /* ---------- SCHEDULE (screen 12) ---------- */
  // One day of one branch: posts × shifts, one guard per slot and one slot per guard per day.
  // Changes are drafts until "Publish to guards"; a published slot is what the guard's card IN uses
  // (otherwise the weekly Duty Chart). About 3 reads per load.
  const SHIFT_ORDER = ['A', 'G', 'B', 'C'];
  const SECTION_ORDER = ['PKL / Main', 'Hospital Block', 'MLCP'];
  // A post's shifts ("ABC", "G" …); empty = every shift.
  const postShifts = p => String((p && p.shift_codes) || '').toUpperCase();
  // "R" in the 4th ';' part of Posts.relief_guards: the post is there only on the shift its regular
  // works that day by the month roster (MLCP CCTV: one fixed person), so no empty slot on other shifts.
  // "R" + shifts (e.g. "RG") does that for those shifts only: Documents and Shift Incharge get a G row
  // only when their person is on G that day (Prem, 21 Oct). A Shift Incharge post with no regular list
  // counts the supervisors, less the regulars of the other incharge posts (MLCP Shift Incharge).
  const regularOnly = p => { const m = String(String((p && p.relief_guards) || '').split(';')[3] || '').match(/R([ABCG]*)/); return m ? (m[1] || 'ABCG') : ''; };
  // "W" in the same part: Mon–Fri only (Kidos School, Prem 21 Oct): no row on Sat / Sun.
  const weekdayOnly = p => String(String((p && p.relief_guards) || '').split(';')[3] || '').includes('W');
  const isWeekend = date => [0, 6].includes(new Date(date + 'T00:00:00Z').getUTCDay());
  // "F" in the same part: never leave it empty (filled from any free man right after its own list).
  const mustFill = p => String(String((p && p.relief_guards) || '').split(';')[3] || '').includes('F');
  const isIncharge = p => String(p.post_name || '').toLowerCase().endsWith('shift incharge');
  const listIds = p => String(p.regular_guards || '').split(',').map(x => x.trim()).filter(Boolean);
  const regularIds = (p, posts, supIds) => {
    if (listIds(p).length || !isIncharge(p)) return listIds(p);
    const others = new Set(posts.filter(x => x !== p && isIncharge(x)).flatMap(listIds));
    return supIds.filter(id => !others.has(id));
  };
  // The post's shifts that day: an R shift stays only if one of its people works it (or it already has a slot).
  const shiftsToday = (p, codeOf, people, filled) => {
    const only = regularOnly(p);
    if (!only) return postShifts(p);
    const on = new Set(people.map(id => codeOf[id]));
    return (postShifts(p) || 'ABCG').split('').filter(c => !only.includes(c) || on.has(c) || filled.includes(c)).join('');
  };
  const plusDays = (date, n) => { const d = new Date(date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

  // Posts of a branch in my area (an agency supervisor: only their agency's posts).
  async function branchPosts(req, zcql, branch) {
    const rows = (await zcql.executeZCQLQuery(`SELECT ROWID, post_name, extra_duty, section, sort_order, shift_codes, regular_guards, relief_guards, auto_fill FROM Posts WHERE branch_id = ${branch} AND post_type = 'POST' AND is_active = 'true'${auth.agencyWhere(req)} ORDER BY post_name ASC`)).map(r => r.Posts);
    // The order of the daily roster sheet: section, then the post's place in it.
    const sec = p => { const i = SECTION_ORDER.indexOf(p.section); return i < 0 ? 99 : i; };
    return rows.sort((a, b) => sec(a) - sec(b) || (Number(a.sort_order) || 999) - (Number(b.sort_order) || 999) || a.post_name.localeCompare(b.post_name));
  }
  // Slots of that day, only of the given posts.
  async function dayRows(zcql, branch, date, posts) {
    const ids = new Set(posts.map(p => String(p.ROWID)));
    return (await zcql.executeZCQLQuery(`SELECT ROWID, post_id, shift_code, guard_id, published FROM Schedule WHERE branch_id = ${branch} AND sched_date = '${date}'`))
      .map(r => r.Schedule).filter(r => ids.has(String(r.post_id)));
  }
  const isOn = v => v === true || v === 'true';

  app.get('/schedule', async (req, res) => {
    try {
      const catalystApp = catalyst.initialize(req, { scope: 'admin' });
      const zcql = catalystApp.zcql();
      const branch = auth.requireBranch(req, requireRowId(req.query.branch));
      const date = requireDate(req.query.date);
      const [posts, shifts, guards, roster] = await Promise.all([
        branchPosts(req, zcql, branch), getShifts(zcql),
        zcql.executeZCQLQuery(`SELECT ROWID, id_number, guard_name, area FROM Guards WHERE branch_id = ${branch} AND is_active = 'true'${auth.agencyWhere(req)} ORDER BY guard_name ASC LIMIT 0, 300`).then(r => r.map(x => x.Guards)),
        // The month roster's letter for this date (A / B / C / G / O / L), so the page offers the
        // guards of the picked shift first and keeps those on week off or leave apart.
        zcql.executeZCQLQuery(`SELECT guard_id, codes FROM MonthRoster WHERE branch_id = ${branch} AND roster_month = '${date.slice(0, 7)}' LIMIT 0, 300`).then(r => r.map(x => x.MonthRoster))
      ]);
      const dayIndex = Number(date.slice(8, 10)) - 1;
      const rosterOf = {};
      roster.forEach(r => { const c = String(r.codes || '')[dayIndex]; if (c && c !== '-') rosterOf[String(r.guard_id)] = c; });
      const rows = await dayRows(zcql, branch, date, posts);
      const supNames = posts.some(p => regularOnly(p) && isIncharge(p))
        ? (await zcql.executeZCQLQuery(`SELECT name FROM UserRoles WHERE role = 'supervisor' AND branch_id = ${branch} AND is_active = true`)).map(x => String(x.UserRoles.name || '').toLowerCase()) : [];
      const supIds = guards.filter(g => supNames.includes(String(g.guard_name).toLowerCase())).map(g => String(g.ROWID));
      const dayShifts = p => shiftsToday(p, rosterOf, regularIds(p, posts, supIds), rows.filter(r => String(r.post_id) === String(p.ROWID)).map(r => r.shift_code));
      const dayPosts = posts.filter(p => (!regularOnly(p) || dayShifts(p)) && !(weekdayOnly(p) && isWeekend(date) && !rows.some(r => String(r.post_id) === String(p.ROWID))));

      // Escorts. Mon–Fri: the week's 6-to-5 batch = escorts whose roster has the coming Saturday
      // AND Sunday off (18:00–20:30 at a support point, then escort cab till 05:00). The other
      // escorts on Shift C go 21:00–06:00. A support point is saved per guard per day.
      const dow = new Date(date + 'T00:00:00Z').getUTCDay();
      let batch = [];
      if (dow >= 1 && dow <= 5) {
        const sat = plusDays(date, 6 - dow), sun = plusDays(sat, 1);
        const codesFor = {};
        const months = [...new Set([sat.slice(0, 7), sun.slice(0, 7)])];
        for (const m of months) {
          const list = m === date.slice(0, 7) ? roster : (await zcql.executeZCQLQuery(`SELECT guard_id, codes FROM MonthRoster WHERE branch_id = ${branch} AND roster_month = '${m}' LIMIT 0, 300`)).map(x => x.MonthRoster);
          list.forEach(r => { (codesFor[m] = codesFor[m] || {})[String(r.guard_id)] = String(r.codes || ''); });
        }
        const codeOn = (id, d) => ((codesFor[d.slice(0, 7)] || {})[id] || '')[Number(d.slice(8, 10)) - 1];
        // Only those on C today (an escort on A / B / G works a post that day).
        batch = guards.filter(g => String(g.area || '').toLowerCase() === 'escort' && rosterOf[String(g.ROWID)] === 'C' && codeOn(String(g.ROWID), sat) === 'O' && codeOn(String(g.ROWID), sun) === 'O').map(g => String(g.ROWID));
      }
      const points = (await zcql.executeZCQLQuery(`SELECT guard_id, support_point FROM EscortDay WHERE branch_id = ${branch} AND sched_date = '${date}' LIMIT 0, 300`)).map(x => x.EscortDay);
      const pointOf = {};
      points.forEach(p => { pointOf[String(p.guard_id)] = p.support_point || ''; });
      const inSlot = new Set(rows.map(r => String(r.guard_id)));
      let night = guards.filter(g => String(g.area || '').toLowerCase() === 'escort' && rosterOf[String(g.ROWID)] === 'C' && !batch.includes(String(g.ROWID)) && !inSlot.has(String(g.ROWID))).map(g => String(g.ROWID));
      // Weekday with a Month Roster: both lists in roster order with today's seat numbers (escortRoster.js),
      // the same as the escort duty sheet. Otherwise S.No is the list order.
      // Sunday: no escort list on the sheet (Prem, 21 Oct); escorts take posts that day.
      if (dow === 0) { batch = []; night = []; }
      const seatOf = {}, extraOf = {};
      const rosterDay = await escortDay(catalystApp, date);
      if (rosterDay) {
        const today = rosterDay.rows.filter(r => r.onDuty && !inSlot.has(r.guardId));
        batch = today.filter(r => r.batch === '6 to 5').map(r => r.guardId);
        night = today.filter(r => r.batch === '9 to 6').map(r => r.guardId);
        today.forEach(r => { seatOf[r.guardId] = r.seat; });
        today.filter(r => r.extra).forEach(r => { extraOf[r.guardId] = true; });
      }
      const off = guards.filter(g => ['O', 'L'].includes(rosterOf[String(g.ROWID)])).map(g => ({ guard: String(g.ROWID), code: rosterOf[String(g.ROWID)] }));
      res.status(200).json({
        status: 'success',
        data: {
          date, posts: dayPosts.map(p => ({ ROWID: String(p.ROWID), name: p.post_name, extraDuty: isOn(p.extra_duty), section: p.section || 'Other posts', shifts: dayShifts(p) })),
          shifts: shifts.slice().sort((a, b) => SHIFT_ORDER.indexOf(a.code) - SHIFT_ORDER.indexOf(b.code)),
          slots: rows.map(r => ({ ROWID: String(r.ROWID), post: String(r.post_id), shift: r.shift_code, guard: String(r.guard_id), published: isOn(r.published) })),
          guards: guards.map(g => ({ ROWID: String(g.ROWID), name: g.guard_name, id: g.id_number, area: g.area || '', roster: rosterOf[String(g.ROWID)] || '' })),
          hasRoster: roster.length > 0,
          escort: { batch: batch.map((id, i) => ({ guard: id, point: pointOf[id] || '', seat: seatOf[id] || i + 1 })), night: night.map((id, i) => ({ guard: id, seat: seatOf[id] || i + 1, extra: !!extraOf[id] })), canAdd: !!rosterDay },
          off
        }
      });
    } catch (err) {
      fail(res, err);
    }
  });

  // Put a guard in a slot (or empty it with guard = null). The guard leaves any other slot that day.
  app.post('/scheduleSet', async (req, res) => {
    try {
      const catalystApp = catalyst.initialize(req, { scope: 'admin' });
      const zcql = catalystApp.zcql();
      const branch = auth.requireBranch(req, requireRowId(req.body.branch));
      const date = requireDate(req.body.date);
      const post = requireRowId(req.body.post);
      const shift = String(req.body.shift || '');
      if (!(await getShifts(zcql)).some(s => s.code === shift)) throw new Error('Pick a shift');
      const posts = await branchPosts(req, zcql, branch);
      const thePost = posts.find(p => String(p.ROWID) === String(post));
      if (!thePost) throw new Error('That post is not in your area.');
      if (postShifts(thePost) && !postShifts(thePost).includes(shift)) throw new Error(thePost.post_name + ' has no Shift ' + shift + '.');
      const rows = await dayRows(zcql, branch, date, posts);
      const table = catalystApp.datastore().table('Schedule');
      const cell = rows.find(r => String(r.post_id) === String(post) && r.shift_code === shift);
      if (!req.body.guard) {
        if (cell) await table.deleteRow(cell.ROWID);
        return res.status(200).json({ status: 'success', data: { cleared: true } });
      }
      const guard = requireRowId(req.body.guard);
      const g = await zcql.executeZCQLQuery(`SELECT ROWID, guard_name FROM Guards WHERE ROWID = ${guard} AND branch_id = ${branch} AND is_active = 'true'${auth.agencyWhere(req)}`);
      if (!g.length) throw new Error('That guard is not in your area.');
      // A second shift the same day is extra duty, allowed only when one of the two posts is an
      // extra duty post (VTitan: its regular guards are off at weekends and a volunteer covers).
      const isExtra = id => isOn((posts.find(p => String(p.ROWID) === String(id)) || {}).extra_duty);
      const other = rows.find(r => String(r.guard_id) === String(guard) && r.shift_code !== shift);
      if (other && !isExtra(post) && !isExtra(other.post_id)) {
        const otherName = (posts.find(p => String(p.ROWID) === String(other.post_id)) || {}).post_name || 'another post';
        throw new Error(g[0].Guards.guard_name + ' is already on Shift ' + other.shift_code + ' at ' + otherName + ' today. A second shift is allowed only at an extra duty post (e.g. VTitan).');
      }
      // A guard can do two shifts in a day (extra duty, e.g. A at one post and B at VTitan), but
      // only one post per shift: their other slot in this same shift is emptied.
      for (const r of rows) {
        if (String(r.guard_id) === String(guard) && r.shift_code === shift && (!cell || String(r.ROWID) !== String(cell.ROWID))) await table.deleteRow(r.ROWID);
      }
      if (cell) await table.updateRow({ ROWID: cell.ROWID, guard_id: guard, published: false });
      else await table.insertRow({ branch_id: branch, sched_date: date, post_id: post, shift_code: shift, guard_id: guard, published: false });
      res.status(200).json({ status: 'success', data: { saved: true } });
    } catch (err) {
      fail(res, err);
    }
  });

  // Fill empty slots from the day before; if that day has no schedule, from the weekly Duty Chart.
  app.post('/scheduleCopy', async (req, res) => {
    try {
      const catalystApp = catalyst.initialize(req, { scope: 'admin' });
      const zcql = catalystApp.zcql();
      const branch = auth.requireBranch(req, requireRowId(req.body.branch));
      const date = requireDate(req.body.date);
      const d = new Date(date + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() - 1);
      const yesterday = d.toISOString().slice(0, 10);
      const posts = await branchPosts(req, zcql, branch);
      if (!posts.length) return res.status(200).json({ status: 'success', data: { copied: 0, from: 'nothing' } });
      let source = (await dayRows(zcql, branch, yesterday, posts)).map(r => ({ post: String(r.post_id), shift: r.shift_code, guard: String(r.guard_id) }));
      let from = 'yesterday';
      if (!source.length) {
        from = 'weekly chart';
        source = (await zcql.executeZCQLQuery(`SELECT guard_id, post_id, shift_code FROM DutyChart WHERE week_start = '${weekStartOf(date)}' AND post_id IN (${idList(posts.map(p => p.ROWID))}) ORDER BY ROWID ASC`))
          .map(r => ({ post: String(r.DutyChart.post_id), shift: r.DutyChart.shift_code, guard: String(r.DutyChart.guard_id) }));
      }
      const rows = await dayRows(zcql, branch, date, posts);
      const usedCells = new Set(rows.map(r => r.post_id + '|' + r.shift_code));
      // Copying never makes extra duty: a guard already in the day is not copied again.
      const usedGuards = new Set(rows.map(r => String(r.guard_id)));
      const table = catalystApp.datastore().table('Schedule');
      let copied = 0;
      for (const s of source) {
        if (usedCells.has(s.post + '|' + s.shift) || usedGuards.has(s.guard)) continue;
        await table.insertRow({ branch_id: branch, sched_date: date, post_id: s.post, shift_code: s.shift, guard_id: s.guard, published: false });
        usedCells.add(s.post + '|' + s.shift);
        usedGuards.add(s.guard);
        copied++;
      }
      res.status(200).json({ status: 'success', data: { copied, from } });
    } catch (err) {
      fail(res, err);
    }
  });

  // F32: drafts of that day become the guards' duty. Notifications still come only at card IN.
  // ⚡ Auto fill: the fill rules, one after another, into empty slots only (as drafts), only at posts
  // with Auto fill switched on (Posts page). Rules are
  // added one at a time so each can be checked on an empty day (🧹 Clear day first).
  //   Every rule: escorts (Guards.area Escort) only on Sunday; Mon–Fri they do the night escort cab.
  //   Rule 1 · Shift Incharge: the supervisor whose month roster says that shift today; nobody → empty.
  //   Rule 2 · Regular guards: a post's regular guards (Posts.regular_guards), each on their month
  //            roster shift today, in the order of the sheet; off / none on that shift → empty.
  //   Rule 3 · Team relief: a slot still empty gets the first free guard of the post's relief list
  //            (Posts.relief_guards, most days at that post first) from the post's own team.
  //   Rule 4 · Outside team: still empty → the first free guard of that list from another team.
  //   Sat / Sun: Rule 3 runs for the non-rotation posts before Rule 5 (permanent posts get the few ladies first).
  //   Daily rotation: a post flagged "D" (4th ';' part of relief_guards) never gets yesterday's guard again.
  //   Rule 8 · Anyone free (last): an empty slot at a rotation post (or a daily rotation post: PKL / MLCP
  //            men only) gets any free guard on that shift.
  //   Weekend list: a post can keep a separate Sat/Sun list after ';' in Posts.relief_guards (used by
  //            Rules 3 and 4 on Sat/Sun instead of the relief list; Rule 5 skips that post if the list has none of its team).
  //   Rule 5 · Weekly rotation (runs before Rule 3, lady pool posts): same post as yesterday for the
  //            shift week; a new week goes to whoever was at that post least in the last 14 days.
  async function pages(zcql, sql, table) {
    const all = [];
    for (let off = 1; ; off += 300) {
      const rows = (await zcql.executeZCQLQuery(`${sql} LIMIT ${off}, 300`)).map(r => r[table]);
      all.push(...rows);
      if (rows.length < 300) return all;
    }
  }

  app.post('/scheduleAuto', async (req, res) => {
    try {
      const catalystApp = catalyst.initialize(req, { scope: 'admin' });
      const zcql = catalystApp.zcql();
      const branch = auth.requireBranch(req, requireRowId(req.body.branch));
      const date = requireDate(req.body.date);
      const [posts, guards, roster, sups] = await Promise.all([
        branchPosts(req, zcql, branch),
        pages(zcql, `SELECT ROWID, guard_name, area FROM Guards WHERE branch_id = ${branch} AND is_active = 'true'${auth.agencyWhere(req)} ORDER BY ROWID ASC`, 'Guards'),
        pages(zcql, `SELECT guard_id, codes FROM MonthRoster WHERE branch_id = ${branch} AND roster_month = '${date.slice(0, 7)}' ORDER BY ROWID ASC`, 'MonthRoster'),
        zcql.executeZCQLQuery(`SELECT name FROM UserRoles WHERE role = 'supervisor' AND branch_id = ${branch} AND is_active = true`).then(r => r.map(x => String(x.UserRoles.name || '').toLowerCase()))
      ]);
      if (!roster.length) throw new Error('No month roster for ' + date.slice(0, 7) + '. Upload it in Month roster first.');
      const rows = await dayRows(zcql, branch, date, posts);
      // Posts in their Posts-page order (sort_order), so the more important post of a group is filled
      // first when the same guards are regulars at several posts (e.g. Hospital G/F before the floors).
      // A digit in the 4th ';' part of relief_guards (e.g. ";;;1", ";;;2D") fills that post before all
      // others without moving it on the printed sheet (sort_order stays the guards' usual template order).
      const fillFirst = p => Number((String(String(p.relief_guards || '').split(';')[3] || '').match(/\d/) || [])[0]) || 99;
      const autoPosts = posts.filter(p => isOn(p.auto_fill))
        .sort((x, y) => fillFirst(x) - fillFirst(y) || (Number(x.sort_order) || 999) - (Number(y.sort_order) || 999) || String(x.post_name).localeCompare(String(y.post_name)));
      const day = Number(date.slice(8, 10)) - 1;
      const codeOf = {};
      roster.forEach(r => { const c = String(r.codes || '')[day]; if (c) codeOf[String(r.guard_id)] = c; });
      const supIds = guards.filter(g => sups.includes(String(g.guard_name).toLowerCase())).map(g => String(g.ROWID));
      const allows = (p, shift) => !(weekdayOnly(p) && isWeekend(date)) && (!postShifts(p) || postShifts(p).includes(shift)) && shiftsToday(p, codeOf, regularIds(p, posts, supIds), '').includes(shift);
      // Escorts: only those on C do the escort cab (Mon–Sat); an escort whose roster says A / B / G that
      // day works a post like anyone else (Prem, 21 Oct, as on the real sheets). Sunday: all take posts.
      const sunday = new Date(date + 'T00:00:00Z').getUTCDay() === 0;
      const escort = new Set(guards.filter(g => String(g.area || '').toLowerCase() === 'escort').map(g => String(g.ROWID)));
      const canPost = id => sunday || !escort.has(String(id)) || codeOf[String(id)] !== 'C';
      const taken = new Set(rows.map(r => r.post_id + '|' + r.shift_code));
      const busyGuard = new Set(rows.map(r => String(r.guard_id)));
      const inserts = [];
      const put = (post, shift, guard) => {
        taken.add(post.ROWID + '|' + shift);
        busyGuard.add(String(guard));
        inserts.push({ branch_id: branch, sched_date: date, post_id: post.ROWID, shift_code: shift, guard_id: guard, published: false });
      };
      const rules = [];

      // Rule 1 · Shift Incharge. More than one incharge post (e.g. "MLCP Shift Incharge" on G, Prem 21 Oct):
      // first each post takes a supervisor from its own regular list, then the main "Shift Incharge" first
      // takes any supervisor left on that shift.
      const incharges = autoPosts.filter(p => p.post_name.toLowerCase().endsWith('shift incharge'))
        .sort((x, y) => (y.post_name.toLowerCase() === 'shift incharge') - (x.post_name.toLowerCase() === 'shift incharge'));
      if (incharges.length) {
        const r1 = { no: 1, rule: 'Shift Incharge', filled: [], empty: [] };
        const supOn = (shift, only) => guards.find(g => sups.includes(String(g.guard_name).toLowerCase()) && codeOf[String(g.ROWID)] === shift && !busyGuard.has(String(g.ROWID)) && (!only || only.includes(String(g.ROWID))));
        for (const pass of ['own', 'any']) {
          for (const p of incharges) {
            const own = String(p.regular_guards || '').split(',').map(x => x.trim()).filter(Boolean);
            if (pass === 'own' && !own.length) continue;
            for (const shift of ['A', 'B', 'C', 'G'].filter(s => allows(p, s))) {
              if (taken.has(p.ROWID + '|' + shift)) continue;
              const sup = supOn(shift, pass === 'own' ? own : null);
              if (sup) { put(p, shift, sup.ROWID); r1.filled.push((incharges.length > 1 ? p.post_name + ' ' : '') + shift + ' ' + sup.guard_name); } else if (pass === 'any') r1.empty.push((incharges.length > 1 ? p.post_name + ' ' : '') + shift);
            }
          }
        }
        rules.push(r1);
      }

      // Daily rotation (hot / hard posts): a 4th ';' part of Posts.relief_guards with "D" means the same
      // guard never gets that post two days running (e.g. Lancor Vendor Entrance, in the sun).
      const dailyPosts = autoPosts.filter(p => String(String(p.relief_guards || '').split(';')[3] || '').includes('D'));
      const yesterday = new Date(Date.parse(date + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
      const wasThere = new Set(dailyPosts.length ? (await pages(zcql, `SELECT post_id, guard_id FROM Schedule WHERE branch_id = ${branch} AND sched_date = '${yesterday}' AND post_id IN (${dailyPosts.map(p => p.ROWID).join(', ')}) ORDER BY ROWID ASC`, 'Schedule')).map(h => h.post_id + '|' + h.guard_id) : []);
      const restDay = (p, id) => wasThere.has(p.ROWID + '|' + id);

      // Rule 2 · Regular guards
      const r2 = { no: 2, rule: 'Regular guards', filled: [], empty: [] };
      const nameOf = new Map(guards.map(g => [String(g.ROWID), g.guard_name]));
      const teamAt = new Map(guards.map(g => [String(g.ROWID), String(g.area || '').toLowerCase()]));
      for (const p of autoPosts) {
        const regular = String(p.regular_guards || '').split(',').map(x => x.trim()).filter(x => nameOf.has(x));
        if (!regular.length) continue;
        for (const shift of ['A', 'B', 'C', 'G'].filter(s => allows(p, s))) {
          if (taken.has(p.ROWID + '|' + shift)) continue;
          let g = regular.find(id => codeOf[id] === shift && !busyGuard.has(id) && canPost(id) && !restDay(p, id));
          // "F" (never empty, Prem 21 Oct: Lancor Car Parking, MLCP Basement-1): none of its list free →
          // any free PKL / MLCP man on that shift now, before the later posts take them (escorts on Sunday).
          if (!g && mustFill(p)) {
            const free = guards.map(x => String(x.ROWID)).filter(id => codeOf[id] === shift && !busyGuard.has(id) && canPost(id) && !restDay(p, id)
              && !sups.includes(String(nameOf.get(id)).toLowerCase()) && ['pkl', 'mlcp', 'escort'].includes(teamAt.get(id)));
            g = free.find(id => teamAt.get(id) !== 'escort') || free[0];
          }
          if (g) { put(p, shift, g); r2.filled.push(p.post_name + ' ' + shift + ' ' + nameOf.get(g)); } else r2.empty.push(p.post_name + ' ' + shift);
        }
      }
      rules.push(r2);

      // A post's team: the area most of its regular and relief guards come from (escorts aside).
      const areaOf = new Map(guards.map(g => [String(g.ROWID), String(g.area || '')]));
      // Posts.relief_guards = "relief list" or "relief list ; weekend list" or "relief list ; weekend list ;
      // lady shifts". The weekend list (if any) replaces the relief list on Saturday and Sunday; a weekend
      // list with no lady pool guard (men only) also makes the post skip Rule 5 that day. Lady shifts (e.g.
      // "B" at Kitchen-2) put the post in Rule 5 for those shifts only; its other shifts get no pool lady.
      const ids = s => String(s || '').split(',').map(x => x.trim()).filter(x => nameOf.has(x));
      const reliefOf = p => ids(String(p.relief_guards || '').split(';')[0]);
      const weekendOf = p => ids(String(p.relief_guards || '').split(';')[1]);
      const weekendDay = [0, 6].includes(new Date(date + 'T00:00:00Z').getUTCDay());
      const dayList = p => (weekendDay && weekendOf(p).length ? weekendOf(p) : reliefOf(p));
      const ladyShifts = p => String(String(p.relief_guards || '').split(';')[2] || '').replace(/[^ABCG]/g, '');
      const isLady = id => String(areaOf.get(id) || '').toLowerCase() === 'lady guards';
      const notForLady = (p, shift) => ladyShifts(p) && !ladyShifts(p).includes(shift);
      const rotShifts = p => ['A', 'B', 'C', 'G'].filter(s => allows(p, s) && !notForLady(p, s));
      const teamOf = p => {
        const n = {};
        [...String(p.regular_guards || '').split(','), ...reliefOf(p)].map(x => areaOf.get(x.trim())).filter(x => x && x.toLowerCase() !== 'escort').forEach(x => { n[x] = (n[x] || 0) + 1; });
        return Object.keys(n).sort((x, y) => n[y] - n[x])[0] || '';
      };
      // Rule 5 · Weekly rotation (lady pool posts: team Lady Guards, fewer regulars than shifts).
      //   a) Same as yesterday: whoever had this post + shift yesterday stays while her roster shift
      //      is the same (so one post for the whole shift week).
      //   b) New shift week: the free guard of the post's list who was at this post the fewest days
      //      in the last 14 days (then the longest ago, then list order).
      const rotPosts = autoPosts.filter(p => !(weekendDay && weekendOf(p).length && !weekendOf(p).some(isLady)) && (ladyShifts(p) ||
        (teamOf(p).toLowerCase() === 'lady guards' && String(p.regular_guards || '').split(',').filter(x => nameOf.has(x.trim())).length < ['A', 'B', 'C', 'G'].filter(s => allows(p, s)).length)));
      const relief = (no, title, sameTeam, list) => {
        const r = { no, rule: title, filled: [], empty: [] };
        for (const p of list) {
          const team = teamOf(p);
          const pool = dayList(p).filter(id => (areaOf.get(id) === team) === sameTeam);
          for (const shift of ['A', 'B', 'C', 'G'].filter(s => allows(p, s))) {
            if (taken.has(p.ROWID + '|' + shift)) continue;
            const g = pool.find(id => codeOf[id] === shift && !busyGuard.has(id) && canPost(id) && !(isLady(id) && notForLady(p, shift)) && !restDay(p, id));
            if (g) { put(p, shift, g); r.filled.push(p.post_name + ' ' + shift + ' ' + nameOf.get(g)); } else if (!sameTeam && dayList(p).length) r.empty.push(p.post_name + ' ' + shift);
          }
        }
        return r;
      };
      // Sat / Sun: ladies are few (weekly offs), so the permanent posts (MLCP / Medical Mine Reception)
      // take their team relief first, then Rule 5 shares what is left among the rotation posts.
      if (weekendDay) rules.push(relief(3, 'Team relief (weekend, before Rule 5)', true, autoPosts.filter(p => !rotPosts.includes(p))));
      if (rotPosts.length) {
        const r5 = { no: 5, rule: 'Weekly rotation', filled: [], empty: [] };
        const back = n => new Date(Date.parse(date + 'T00:00:00Z') - n * 86400000).toISOString().slice(0, 10);
        const hist = await pages(zcql, `SELECT sched_date, post_id, shift_code, guard_id FROM Schedule WHERE branch_id = ${branch} AND sched_date >= '${back(14)}' AND sched_date < '${date}' AND post_id IN (${rotPosts.map(p => p.ROWID).join(', ')}) ORDER BY ROWID ASC`, 'Schedule');
        const listOf = p => [...String(p.regular_guards || '').split(',').map(x => x.trim()), ...reliefOf(p)].filter(x => nameOf.has(x) && isLady(x));
        const free = (id, shift) => codeOf[id] === shift && !busyGuard.has(id) && canPost(id);
        for (const p of rotPosts) {
          for (const shift of rotShifts(p)) {
            if (taken.has(p.ROWID + '|' + shift)) continue;
            const y = hist.find(h => String(h.post_id) === String(p.ROWID) && h.shift_code === shift && h.sched_date === back(1));
            const g = y && String(y.guard_id);
            if (g && listOf(p).includes(g) && free(g, shift)) { put(p, shift, g); r5.filled.push(p.post_name + ' ' + shift + ' ' + nameOf.get(g) + ' (same as yesterday)'); }
          }
        }
        for (const p of rotPosts) {
          const mine = hist.filter(h => String(h.post_id) === String(p.ROWID));
          const days = id => mine.filter(h => String(h.guard_id) === id).length;
          const last = id => mine.filter(h => String(h.guard_id) === id).map(h => h.sched_date).sort().pop() || '';
          const list = reliefOf(p).filter(isLady);
          for (const shift of rotShifts(p)) {
            if (taken.has(p.ROWID + '|' + shift)) continue;
            const g = list.filter(id => free(id, shift)).sort((a, b) => days(a) - days(b) || last(a).localeCompare(last(b)))[0];
            if (g) { put(p, shift, g); r5.filled.push(p.post_name + ' ' + shift + ' ' + nameOf.get(g)); } else r5.empty.push(p.post_name + ' ' + shift);
          }
        }
        rules.push(r5);
      }

      // Rule 3 · Team relief: the post's relief list, same team only, most experienced first.
      // Rule 4 · Outside team: still empty → the rest of the relief list (other teams).
      for (const [no, title, sameTeam] of [[3, 'Team relief', true], [4, 'Outside team', false]]) rules.push(relief(no, title, sameTeam, autoPosts));

      // Rule 8 · Anyone free: a slot still empty gets any guard on that shift today who has no post yet
      // (own team first; never a supervisor, a lady pool guard, or an escort on Mon–Sat). Only rotation
      // posts (5+ guards in the relief list), so Kidos / Documents / CCTV stay as their own rules left them.
      // Daily rotation (D) posts too (Prem, 21 Oct: no empty slot while men sit free), but only PKL / MLCP
      // men there, so Hospital, Ninnakarai and Medical Mine people stay with their own group.
      // Sunday (Prem, 21 Oct): the escorts are free that day, so every other men's post gets Rule 8 too, with
      // Escort men after PKL / MLCP. Never at Shift Incharge, Documents / CCTV (R), Hospital, Ninnakarai or
      // the lady / Medical Mine posts.
      const sundayPost = x => sunday && !regularOnly(x) && !isIncharge(x) && String(x.section || '').toLowerCase() !== 'hospital block'
        && !['ninnakarai', 'lady guards', 'medical mine'].includes(teamOf(x).toLowerCase());
      // Every shift (Prem, 21 Oct: G first, then "free aana men empty post la podunga"): a man still free
      // goes to any empty men's post, never left idle.
      const menPost = x => !regularOnly(x) && !isIncharge(x) && String(x.section || '').toLowerCase() !== 'hospital block'
        && !['ninnakarai', 'lady guards', 'medical mine'].includes(teamOf(x).toLowerCase());
      const r8 = { no: 8, rule: 'Anyone free', filled: [], empty: [] };
      for (const p of autoPosts.filter(x => reliefOf(x).length >= 5 || dailyPosts.includes(x) || sundayPost(x) || menPost(x))) {
        const team = teamOf(p);
        const daily = reliefOf(p).length < 5;
        const isEscort = id => areaOf.get(id).toLowerCase() === 'escort';
        for (const shift of ['A', 'B', 'C', 'G'].filter(s => allows(p, s))) {
          if (taken.has(p.ROWID + '|' + shift)) continue;
          const g = guards.map(x => String(x.ROWID))
            .filter(id => codeOf[id] === shift && !busyGuard.has(id) && canPost(id) && !sups.includes(String(nameOf.get(id)).toLowerCase()) && areaOf.get(id).toLowerCase() !== 'lady guards' && !restDay(p, id))
            .filter(id => !daily || ['pkl', 'mlcp'].includes(areaOf.get(id).toLowerCase()) || isEscort(id))
            .filter(id => areaOf.get(id).toLowerCase() !== 'ninnakarai' || team.toLowerCase() === 'ninnakarai')
            .sort((a, b) => (areaOf.get(b) === team) - (areaOf.get(a) === team) || isEscort(a) - isEscort(b))[0];
          if (g) { put(p, shift, g); r8.filled.push(p.post_name + ' ' + shift + ' ' + nameOf.get(g)); } else r8.empty.push(p.post_name + ' ' + shift);
        }
      }
      rules.push(r8);

      const table = catalystApp.datastore().table('Schedule');
      for (let i = 0; i < inserts.length; i += 100) await table.insertRows(inserts.slice(i, i + 100));
      res.status(200).json({ status: 'success', data: { filled: inserts.length, rules } });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post('/schedulePublish', async (req, res) => {
    try {
      const catalystApp = catalyst.initialize(req, { scope: 'admin' });
      const zcql = catalystApp.zcql();
      const branch = auth.requireBranch(req, requireRowId(req.body.branch));
      const date = requireDate(req.body.date);
      const drafts = (await dayRows(zcql, branch, date, await branchPosts(req, zcql, branch))).filter(r => !isOn(r.published));
      const table = catalystApp.datastore().table('Schedule');
      for (const r of drafts) await table.updateRow({ ROWID: r.ROWID, published: true });
      res.status(200).json({ status: 'success', data: { published: drafts.length } });
    } catch (err) {
      fail(res, err);
    }
  });

  // 🧹 Empty a whole day (drafts and published) of the posts in my area, to start it again by hand
  // or to try one fill rule at a time. Escort support points are kept.
  app.post('/scheduleClear', async (req, res) => {
    try {
      const catalystApp = catalyst.initialize(req, { scope: 'admin' });
      const zcql = catalystApp.zcql();
      const branch = auth.requireBranch(req, requireRowId(req.body.branch));
      const date = requireDate(req.body.date);
      const ids = (await dayRows(zcql, branch, date, await branchPosts(req, zcql, branch))).map(r => r.ROWID);
      const table = catalystApp.datastore().table('Schedule');
      for (let i = 0; i < ids.length; i += 200) await table.deleteRows(ids.slice(i, i + 200));
      res.status(200).json({ status: 'success', data: { cleared: ids.length } });
    } catch (err) {
      fail(res, err);
    }
  });

  // 6-to-5 escort: where they support 18:00–20:30 today (changes every day). Empty = removed.
  app.post('/escortPoint', async (req, res) => {
    try {
      const catalystApp = catalyst.initialize(req, { scope: 'admin' });
      const zcql = catalystApp.zcql();
      const branch = auth.requireBranch(req, requireRowId(req.body.branch));
      const date = requireDate(req.body.date);
      const g = (await zcql.executeZCQLQuery(`SELECT ROWID, branch_id, agency_id FROM Guards WHERE ROWID = ${requireRowId(req.body.guard_id)}`))[0];
      const guard = auth.requireRow(req, g && g.Guards, 'guard');
      if (String(guard.branch_id) !== String(branch)) throw new Error('This guard is in another branch.');
      const point = cleanText(req.body.point || '', 'Support point', 100, false) || '';
      const table = catalystApp.datastore().table('EscortDay');
      const old = await zcql.executeZCQLQuery(`SELECT ROWID FROM EscortDay WHERE guard_id = ${guard.ROWID} AND sched_date = '${date}'`);
      if (old.length) await table.updateRow({ ROWID: old[0].EscortDay.ROWID, support_point: point, updated_by: req.user.name });
      else await table.insertRow({ sched_date: date, guard_id: guard.ROWID, support_point: point, branch_id: branch, updated_by: req.user.name });
      res.status(200).json({ status: 'success', data: { point } });
    } catch (err) {
      fail(res, err);
    }
  });

  // F31: supervisor message to a post; the guards on duty there get a notification.
  app.post('/supMessage', async (req, res) => {
    try {
      const catalystApp = catalyst.initialize(req, { scope: 'admin' });
      const zcql = catalystApp.zcql();
      const postId = requireRowId(req.body.post);
      await myPost(req, zcql, postId);
      const name = supName(req);
      const text = cleanText(req.body.text, 'Message', MAX_TEXT, true);
      const saved = await addMessage(catalystApp, { post_id: postId, kind: 'supervisor', author_name: name, text });
      const logs = (await activeLogs(zcql, [postId])).filter(l => l.status === 'on_duty' || l.status === 'on_break');
      const guardRows = logs.length ? await zcql.executeZCQLQuery(`SELECT ROWID, guard_token FROM Guards WHERE ROWID IN (${idList(logs.map(l => l.guard_id))})`) : [];
      for (const r of guardRows) {
        try {
          await sendPushToGuard(catalystApp, r.Guards.ROWID, { title: '💬 ' + supLabel(req), body: text, url: 'index.html#guard/' + r.Guards.guard_token, urgent: true, tag: 'sup-' + postId });
        } catch (err) {
          console.error('Supervisor message push failed:', err);
        }
      }
      res.status(200).json({ status: 'success', data: { ROWID: saved.ROWID, sentTo: guardRows.length } });
    } catch (err) {
      fail(res, err);
    }
  });

  return { notify };
};
