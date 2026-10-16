"use strict"

/* ---------------- SUPERVISOR INBOX (screen 13) ---------------- */
// Every post of a branch like a WhatsApp Web chat list: alerts and empty posts on top, unread
// counts, and one post's timeline with a message box. The supervisor's name comes from the page
// for now (no login yet); with login it will come from the signed-in user.

const ACTIVE = ['waiting', 'on_duty', 'on_break', 'out'];
const GENERAL = 'G';

module.exports = function supervisorRoutes(app, h) {
  const { catalyst, fail, requireRowId, getShifts, shiftDate, weekStartOf, nowStamp, hhmm, minutesBetween, cleanText, MAX_TEXT,
    namesOf, addMessage, timelineData, workView, sendPushToGuard } = h;

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
      const [chart, logs, brks, openW, recentW] = await Promise.all([
        zcql.executeZCQLQuery(`SELECT guard_id, post_id FROM DutyChart WHERE week_start = '${weekStartOf(day)}' AND shift_code = '${code}' AND post_id IN (${ids})`).then(r => r.map(x => x.DutyChart)),
        activeLogs(zcql, posts.map(p => p.ROWID)).then(l => l.filter(x => x.shift_code === code)),
        zcql.executeZCQLQuery(`SELECT post_id, status, cover_guard_id, start_at FROM Breaks WHERE post_id IN (${ids}) AND ${statusIn(['accepted', 'alone'])}`).then(r => r.map(x => x.Breaks)),
        zcql.executeZCQLQuery(`SELECT * FROM WorkUpdates WHERE post_id IN (${ids}) AND finished_at IS NULL`).then(r => r.map(x => x.WorkUpdates)),
        zcql.executeZCQLQuery(`SELECT * FROM WorkUpdates WHERE post_id IN (${ids}) AND started_at >= '${day} 00:00' ORDER BY CREATEDTIME DESC LIMIT 6`).then(r => r.map(x => x.WorkUpdates))
      ]);
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
};
