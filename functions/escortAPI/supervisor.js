"use strict"

/* ---------------- SUPERVISOR INBOX (screen 13) ---------------- */
// Every post of a branch like a WhatsApp Web chat list: alerts and empty posts on top, unread
// counts, and one post's timeline with a message box. The supervisor's name comes from the page
// for now (no login yet); with login it will come from the signed-in user.

const ACTIVE = ['waiting', 'on_duty', 'on_break', 'out'];
const GENERAL = 'G';

module.exports = function supervisorRoutes(app, h) {
  const { catalyst, fail, requireRowId, requireDate, getShifts, shiftDate, weekStartOf, nowStamp, hhmm, minutesBetween, cleanText, MAX_TEXT,
    namesOf, addMessage, timelineData, workView, sendPushToGuard, sendPushToRows, getVapidKeys } = h;

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

  function supName(value) {
    return cleanText(value, 'Your name', 100, true);
  }

  // Post list of one branch with status, open alerts, last message and unread count.
  // `seen` = { postId: "YYYY-MM-DD HH:MM:SS" } of what this supervisor has already read (kept in the browser).
  app.post('/supInbox', async (req, res) => {
    try {
      const catalystApp = catalyst.initialize(req);
      const zcql = catalystApp.zcql();
      const branch = requireRowId(req.body.branch);
      const seen = req.body.seen && typeof req.body.seen === 'object' ? req.body.seen : {};
      const posts = (await zcql.executeZCQLQuery(`SELECT ROWID, post_name FROM Posts WHERE branch_id = ${branch} AND post_type = 'POST' AND is_active = 'true' ORDER BY post_name ASC`)).map(r => r.Posts);
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
      const catalystApp = catalyst.initialize(req);
      const zcql = catalystApp.zcql();
      const postId = requireRowId(req.query.post);
      const name = req.query.name ? supName(req.query.name) : '';
      const posts = await zcql.executeZCQLQuery(`SELECT ROWID, post_name FROM Posts WHERE ROWID = ${postId}`);
      if (!posts.length) throw new Error('Post not found.');
      const logs = await activeLogs(zcql, [postId]);
      const guardRows = logs.length ? await zcql.executeZCQLQuery(`SELECT ROWID, guard_name, phone, guard_token FROM Guards WHERE ROWID IN (${idList(logs.map(l => l.guard_id))})`) : [];
      const guards = {};
      guardRows.forEach(r => { guards[String(r.Guards.ROWID)] = r.Guards; });
      const main = logs.find(l => l.shift_code !== GENERAL) || logs[0] || null;

      if (name) {
        const open = (await zcql.executeZCQLQuery(`SELECT ROWID, guard_id FROM Alerts WHERE post_id = ${postId} AND status = 'sent'`)).map(r => r.Alerts);
        const now = nowStamp();
        for (const a of open) {
          await catalystApp.datastore().table('Alerts').updateRow({ ROWID: a.ROWID, status: 'seen', seen_by: name + ' (Supervisor)', seen_at: now });
          const g = guards[String(a.guard_id)];
          if (g) {
            try {
              await sendPushToGuard(catalystApp, g.ROWID, { title: '👀 Alert seen · ' + hhmm(now), body: 'Seen by ' + name + ' (Supervisor).', url: 'index.html#guard/' + g.guard_token });
            } catch (err) {
              console.error('Alert seen push failed:', err);
            }
          }
        }
      }

      const safety = main ? await zcql.executeZCQLQuery(`SELECT name, phone FROM SafetyEntries WHERE post_id = ${postId} AND duty_date = '${main.duty_date}' AND shift_code = '${main.shift_code}' ORDER BY CREATEDTIME DESC LIMIT 1`) : [];
      const { messages } = await timelineData(req, catalystApp, zcql, postId, { supervisor: name || 'Supervisor' });
      res.status(200).json({
        status: 'success',
        data: {
          post: posts[0].Posts.post_name,
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
      const keys = await getVapidKeys(catalyst.initialize(req));
      res.status(200).json({ status: 'success', data: { vapidPublicKey: keys.publicKey } });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post('/supSubscribe', async (req, res) => {
    try {
      const catalystApp = catalyst.initialize(req);
      const zcql = catalystApp.zcql();
      const branch = requireRowId(req.body.branch);
      const name = supName(req.body.name);
      const sub = req.body.subscription;
      if (!sub || typeof sub.endpoint !== 'string' || !sub.endpoint.startsWith('https://') || !sub.keys) throw new Error('Invalid subscription');
      const device = ['android', 'iphone'].includes(req.body.device) ? req.body.device : 'other';
      const rows = (await zcql.executeZCQLQuery(`SELECT ROWID, subscription_json FROM SupervisorSubs WHERE branch_id = ${branch}`)).map(r => r.SupervisorSubs);
      const same = rows.find(r => { try { return JSON.parse(r.subscription_json).endpoint === sub.endpoint; } catch { return false; } });
      const table = catalystApp.datastore().table('SupervisorSubs');
      if (same) await table.updateRow({ ROWID: same.ROWID, sup_name: name });
      else await table.insertRow({ branch_id: branch, sup_name: name, subscription_json: JSON.stringify(sub), device });
      res.status(200).json({ status: 'success', data: { saved: true } });
    } catch (err) {
      fail(res, err);
    }
  });

  // Called by the guard routes. Never fails the guard's own action.
  async function notify(catalystApp, postId, title, body, urgent) {
    try {
      const zcql = catalystApp.zcql();
      const posts = await zcql.executeZCQLQuery(`SELECT post_name, branch_id FROM Posts WHERE ROWID = ${requireRowId(postId)}`);
      if (!posts.length || !posts[0].Posts.branch_id) return;
      const post = posts[0].Posts;
      const subs = (await zcql.executeZCQLQuery(`SELECT ROWID, subscription_json, device FROM SupervisorSubs WHERE branch_id = ${requireRowId(post.branch_id)}`)).map(r => r.SupervisorSubs);
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
      const catalystApp = catalyst.initialize(req);
      const zcql = catalystApp.zcql();
      const branch = requireRowId(req.query.branch);
      const shifts = await getShifts(zcql);
      const now = nowStamp();
      const code = shifts.some(s => s.code === req.query.shift) ? req.query.shift : runningShift(shifts, now);
      const shift = shifts.find(s => s.code === code) || { code, start: '', end: '' };
      const day = shiftDate();
      const startStamp = shift.start ? day + ' ' + shift.start : null;
      const started = startStamp && now >= startStamp;

      const posts = (await zcql.executeZCQLQuery(`SELECT ROWID, post_name FROM Posts WHERE branch_id = ${branch} AND post_type = 'POST' AND is_active = 'true' ORDER BY post_name ASC`)).map(r => r.Posts);
      if (!posts.length) return res.status(200).json({ status: 'success', data: { shift, shifts, date: day, posts: [], kpi: { total: 0, onDuty: 0, waiting: 0, notIn: 0 }, attention: [], works: [] } });
      const ids = idList(posts.map(p => p.ROWID));
      const [weekly, planned, logs, brks, openW, recentW] = await Promise.all([
        zcql.executeZCQLQuery(`SELECT guard_id, post_id FROM DutyChart WHERE week_start = '${weekStartOf(day)}' AND shift_code = '${code}' AND post_id IN (${ids})`).then(r => r.map(x => x.DutyChart)),
        zcql.executeZCQLQuery(`SELECT guard_id, post_id, shift_code FROM Schedule WHERE branch_id = ${branch} AND sched_date = '${day}' AND published = true`).then(r => r.map(x => x.Schedule)),
        activeLogs(zcql, posts.map(p => p.ROWID)).then(l => l.filter(x => x.shift_code === code)),
        zcql.executeZCQLQuery(`SELECT post_id, status, cover_guard_id, start_at FROM Breaks WHERE post_id IN (${ids}) AND ${statusIn(['accepted', 'alone'])}`).then(r => r.map(x => x.Breaks)),
        zcql.executeZCQLQuery(`SELECT * FROM WorkUpdates WHERE post_id IN (${ids}) AND finished_at IS NULL`).then(r => r.map(x => x.WorkUpdates)),
        zcql.executeZCQLQuery(`SELECT * FROM WorkUpdates WHERE post_id IN (${ids}) AND started_at >= '${day} 00:00' ORDER BY CREATEDTIME DESC LIMIT 6`).then(r => r.map(x => x.WorkUpdates))
      ]);
      // A published day schedule replaces the weekly chart for that day.
      const chart = planned.length ? planned.filter(p => p.shift_code === code) : weekly;
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
          state = 'not_in'; meta = 'Not IN · shift started ' + shift.start;
          if (minutesBetween(startStamp, now) >= LATE_IN_MIN) attention.push({ post: p.post_name, postId: id, text: guard + ' not IN · shift started ' + shift.start, level: 'red' });
        }
        return { ROWID: id, name: p.post_name, state, guard, meta };
      });
      openW.filter(w => w.permit_end && now > w.permit_end).forEach(w => {
        attention.push({ post: postName(w.post_id) + ' · Permit expired', postId: String(w.post_id), text: w.contractor + ' still working after ' + w.permit_to, level: 'red' });
      });
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
          shift, shifts, date: day, posts: cards, kpi, attention,
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

  async function branchPosts(zcql, branch) {
    return (await zcql.executeZCQLQuery(`SELECT ROWID, post_name FROM Posts WHERE branch_id = ${branch} AND post_type = 'POST' AND is_active = 'true' ORDER BY post_name ASC`)).map(r => r.Posts);
  }
  async function dayRows(zcql, branch, date) {
    return (await zcql.executeZCQLQuery(`SELECT ROWID, post_id, shift_code, guard_id, published FROM Schedule WHERE branch_id = ${branch} AND sched_date = '${date}'`)).map(r => r.Schedule);
  }
  const isOn = v => v === true || v === 'true';

  app.get('/schedule', async (req, res) => {
    try {
      const zcql = catalyst.initialize(req).zcql();
      const branch = requireRowId(req.query.branch);
      const date = requireDate(req.query.date);
      const [posts, shifts, rows, guards] = await Promise.all([
        branchPosts(zcql, branch), getShifts(zcql), dayRows(zcql, branch, date),
        zcql.executeZCQLQuery(`SELECT ROWID, id_number, guard_name FROM Guards WHERE branch_id = ${branch} AND is_active = 'true' ORDER BY guard_name ASC`).then(r => r.map(x => x.Guards))
      ]);
      res.status(200).json({
        status: 'success',
        data: {
          date, posts: posts.map(p => ({ ROWID: String(p.ROWID), name: p.post_name })),
          shifts: shifts.slice().sort((a, b) => SHIFT_ORDER.indexOf(a.code) - SHIFT_ORDER.indexOf(b.code)),
          slots: rows.map(r => ({ ROWID: String(r.ROWID), post: String(r.post_id), shift: r.shift_code, guard: String(r.guard_id), published: isOn(r.published) })),
          guards: guards.map(g => ({ ROWID: String(g.ROWID), name: g.guard_name, id: g.id_number }))
        }
      });
    } catch (err) {
      fail(res, err);
    }
  });

  // Put a guard in a slot (or empty it with guard = null). The guard leaves any other slot that day.
  app.post('/scheduleSet', async (req, res) => {
    try {
      const catalystApp = catalyst.initialize(req);
      const zcql = catalystApp.zcql();
      const branch = requireRowId(req.body.branch);
      const date = requireDate(req.body.date);
      const post = requireRowId(req.body.post);
      const shift = String(req.body.shift || '');
      if (!(await getShifts(zcql)).some(s => s.code === shift)) throw new Error('Pick a shift');
      const posts = await branchPosts(zcql, branch);
      if (!posts.some(p => String(p.ROWID) === String(post))) throw new Error('That post is not in this branch.');
      const rows = await dayRows(zcql, branch, date);
      const table = catalystApp.datastore().table('Schedule');
      const cell = rows.find(r => String(r.post_id) === String(post) && r.shift_code === shift);
      if (!req.body.guard) {
        if (cell) await table.deleteRow(cell.ROWID);
        return res.status(200).json({ status: 'success', data: { cleared: true } });
      }
      const guard = requireRowId(req.body.guard);
      const g = await zcql.executeZCQLQuery(`SELECT ROWID FROM Guards WHERE ROWID = ${guard} AND branch_id = ${branch} AND is_active = 'true'`);
      if (!g.length) throw new Error('That guard is not in this branch.');
      for (const r of rows) {
        if (String(r.guard_id) === String(guard) && (!cell || String(r.ROWID) !== String(cell.ROWID))) await table.deleteRow(r.ROWID);
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
      const catalystApp = catalyst.initialize(req);
      const zcql = catalystApp.zcql();
      const branch = requireRowId(req.body.branch);
      const date = requireDate(req.body.date);
      const d = new Date(date + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() - 1);
      const yesterday = d.toISOString().slice(0, 10);
      const posts = await branchPosts(zcql, branch);
      if (!posts.length) return res.status(200).json({ status: 'success', data: { copied: 0, from: 'nothing' } });
      let source = (await dayRows(zcql, branch, yesterday)).map(r => ({ post: String(r.post_id), shift: r.shift_code, guard: String(r.guard_id) }));
      let from = 'yesterday';
      if (!source.length) {
        from = 'weekly chart';
        source = (await zcql.executeZCQLQuery(`SELECT guard_id, post_id, shift_code FROM DutyChart WHERE week_start = '${weekStartOf(date)}' AND post_id IN (${idList(posts.map(p => p.ROWID))}) ORDER BY ROWID ASC`))
          .map(r => ({ post: String(r.DutyChart.post_id), shift: r.DutyChart.shift_code, guard: String(r.DutyChart.guard_id) }));
      }
      const rows = await dayRows(zcql, branch, date);
      const usedCells = new Set(rows.map(r => r.post_id + '|' + r.shift_code));
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
  app.post('/schedulePublish', async (req, res) => {
    try {
      const catalystApp = catalyst.initialize(req);
      const zcql = catalystApp.zcql();
      const branch = requireRowId(req.body.branch);
      const date = requireDate(req.body.date);
      const drafts = (await dayRows(zcql, branch, date)).filter(r => !isOn(r.published));
      const table = catalystApp.datastore().table('Schedule');
      for (const r of drafts) await table.updateRow({ ROWID: r.ROWID, published: true });
      res.status(200).json({ status: 'success', data: { published: drafts.length } });
    } catch (err) {
      fail(res, err);
    }
  });

  // F31: supervisor message to a post; the guards on duty there get a notification.
  app.post('/supMessage', async (req, res) => {
    try {
      const catalystApp = catalyst.initialize(req);
      const zcql = catalystApp.zcql();
      const postId = requireRowId(req.body.post);
      const name = supName(req.body.name);
      const text = cleanText(req.body.text, 'Message', MAX_TEXT, true);
      const posts = await zcql.executeZCQLQuery(`SELECT post_name FROM Posts WHERE ROWID = ${postId}`);
      if (!posts.length) throw new Error('Post not found.');
      const saved = await addMessage(catalystApp, { post_id: postId, kind: 'supervisor', author_name: name, text });
      const logs = (await activeLogs(zcql, [postId])).filter(l => l.status === 'on_duty' || l.status === 'on_break');
      const guardRows = logs.length ? await zcql.executeZCQLQuery(`SELECT ROWID, guard_token FROM Guards WHERE ROWID IN (${idList(logs.map(l => l.guard_id))})`) : [];
      for (const r of guardRows) {
        try {
          await sendPushToGuard(catalystApp, r.Guards.ROWID, { title: '💬 ' + name + ' (Supervisor)', body: text, url: 'index.html#guard/' + r.Guards.guard_token, urgent: true, tag: 'sup-' + postId });
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
