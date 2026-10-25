"use strict"

/* ---------------- POST HANDOVER (guard at a gate / lobby, not escort) ---------------- */
// The WhatsApp group of a post, in the app:
//   card IN → DutyLog row "waiting" → guard meets the old guard → "Taken over"
//   → old guard "handed_over", new guard "on_duty" → notes on the post's timeline.
// DutyChart = the plan for the week. DutyLog = what really happened, one row per guard per duty day.
// PostMessages = the post's notebook; a note pinned by one guard is read by the next guard.
// Kept in its own file so the escort code stays as it is; it uses the helpers of index.js.

const express = require('express');
const crypto = require('crypto');

const MAX_TEXT = 255;
// General shift (09:00–18:00): no handover chain. Start duty / End duty never touch the
// A / B / C guard of the post, and an A / B / C take over never ends a general duty.
const GENERAL = 'G';

// Photos, videos and voice notes live in Stratus (object storage), one folder per post and day.
// The bucket is private: the timeline hands out links that work for one hour.
const MEDIA_BUCKET = 'escortcardaccess-media';
const MEDIA_LINK_SECONDS = 3600;
const MEDIA = {
  photo: { max: 8 * 1024 * 1024, types: { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } },
  video: { max: 25 * 1024 * 1024, types: { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' } },
  voice: { max: 5 * 1024 * 1024, types: { 'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/aac': 'aac' } }
};
const MEDIA_SOURCES = ['camera', 'gallery', 'mic'];
const MAX_VIDEO_SECONDS = 30;
const MAX_VOICE_SECONDS = 180;
const TIMELINE_LIMIT = 100;
// ROWIDs are not given out in time order, so lists are sorted by time (CREATEDTIME / *_at).

module.exports = function postRoutes(app, h) {
  const { catalyst, selectAll, requireRowId, requireDate, fail, guardByToken, sendPushToGuard, sendPushToRows, getVapidKeys,
    getShifts, shiftDate, weekStartOf, IST_OFFSET_MIN, auth, getSetting, dutyOf, istNow } = h;

  // "2026-10-16 05:58" in India time. Date and time together, because Shift C runs past midnight.
  function nowStamp() {
    return new Date(Date.now() + IST_OFFSET_MIN * 60000).toISOString().slice(0, 16).replace('T', ' ');
  }

  const isTrue = v => v === true || v === 'true';

  // The guard's DutyLog row for the running duty day, or null (no card IN yet).
  // Shift C (21:00–06:00) is still running after 04:00, when the duty day has already turned:
  // yesterday's row counts while it is not handed over.
  const ACTIVE_LOG = ['waiting', 'on_duty', 'on_break', 'out'];
  async function myLog(zcql, guardId, todayOnly) {
    const today = shiftDate();
    const d = new Date(today + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - 1);
    const yesterday = d.toISOString().slice(0, 10);
    const rows = (await zcql.executeZCQLQuery(`SELECT * FROM DutyLog WHERE guard_id = ${requireRowId(guardId)} AND (duty_date = '${today}' OR duty_date = '${yesterday}') ORDER BY CREATEDTIME DESC`)).map(r => r.DutyLog);
    return rows.find(l => l.duty_date === today) || (todayOnly ? null : rows.find(l => ACTIVE_LOG.includes(l.status))) || null;
  }

  // Who is on duty (or on break, or card OUT without a handover) at this post now (other than me):
  // the guard I take over from.
  async function onDutyAt(zcql, postId, myLogId) {
    const rows = await zcql.executeZCQLQuery(`SELECT * FROM DutyLog WHERE post_id = ${requireRowId(postId)} AND (status = 'on_duty' OR status = 'on_break' OR status = 'out') ORDER BY taken_over_at DESC`);
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

  // Presence = who stood at a post from when to when (main guard or a cover during a break).
  // "Who was here at 01:20?" in History reads these rows.
  function openPresence(catalystApp, postId, guardId, logId, kind) {
    return catalystApp.datastore().table('Presence').insertRow({
      post_id: postId, guard_id: guardId, duty_log_id: logId, kind, from_at: nowStamp()
    });
  }

  async function closePresence(catalystApp, zcql, postId, guardId, kind) {
    const rows = await zcql.executeZCQLQuery(`SELECT ROWID FROM Presence WHERE post_id = ${requireRowId(postId)} AND guard_id = ${requireRowId(guardId)}${kind ? ` AND kind = '${kind}'` : ''} AND to_at IS NULL`);
    const now = nowStamp();
    for (const r of rows) await catalystApp.datastore().table('Presence').updateRow({ ROWID: r.Presence.ROWID, to_at: now });
  }

  // F1: called on a card IN of a guard whose chart row is a POST.
  // Makes their DutyLog row (waiting) unless today's row is already there.
  // inAt: the card IN time when the row is made later than the swipe (see lateStart).
  async function onPostIn(catalystApp, guard, duty, inAt) {
    const zcql = catalystApp.zcql();
    // Today's row only: an old row left open yesterday must not swallow today's duty.
    const existing = await myLog(zcql, guard.ROWID, true);
    if (existing && existing.status === 'out') await backIn(catalystApp, zcql, guard, existing);
    if (existing) return { log: existing, created: false };
    const log = await catalystApp.datastore().table('DutyLog').insertRow({
      guard_id: guard.ROWID, post_id: duty.post.ROWID, shift_code: duty.shift.code,
      duty_date: shiftDate(), status: 'waiting', in_at: inAt || nowStamp()
    });
    return { log, created: true };
  }

  // Card IN came before the supervisor published the day's schedule: the swipe found no post, so
  // no DutyLog row was made. When the page opens later and the last swipe of the duty day is still
  // IN and a post is published now, the row is made here (with the card IN time), so the guard
  // does not walk back to the card reader (Prem, 23 Oct).
  async function lateStart(catalystApp, zcql, guard) {
    const rows = await zcql.executeZCQLQuery(`SELECT direction, CREATEDTIME FROM AccessLog WHERE guard_id = ${requireRowId(guard.ROWID)} AND duty_date = '${istNow().dutyDate}' ORDER BY CREATEDTIME DESC LIMIT 1`);
    const last = rows.length ? rows[0].AccessLog : null;
    if (!last || last.direction !== 'IN') return null;
    const day = shiftDate();
    const duty = await dutyOf(zcql, guard.ROWID, weekStartOf(day), day);
    if (!duty || duty.post.post_type !== 'POST') return null;
    return (await onPostIn(catalystApp, guard, duty, String(last.CREATEDTIME).slice(0, 16))).log;
  }

  // OUT / IN again notice to the guard's own phone; an open page refreshes itself on it.
  async function tellGuard(catalystApp, guard, title, body) {
    try {
      await sendPushToGuard(catalystApp, guard.ROWID, { title, body, url: guard.guard_token ? 'index.html#guard/' + guard.guard_token : 'index.html' });
    } catch (err) {
      console.error('OUT / IN push failed:', err);
    }
  }

  // Card OUT: the guard left the site. Their page is locked and the post is empty until they
  // come back (card IN again) or the next guard takes over.
  async function onPostOut(catalystApp, guard) {
    const zcql = catalystApp.zcql();
    const log = await myLog(zcql, guard.ROWID);
    if (!log || !['waiting', 'on_duty', 'on_break'].includes(log.status)) return;
    await catalystApp.datastore().table('DutyLog').updateRow({ ROWID: log.ROWID, status: 'out' });
    await tellGuard(catalystApp, guard, '🚪 Card OUT · ' + hhmm(nowStamp()), 'Your duty page is closed till your card is IN again.');
    if (log.status === 'waiting') return;
    await closePresence(catalystApp, zcql, log.post_id, guard.ROWID, 'main');
    await addMessage(catalystApp, { post_id: log.post_id, duty_log_id: log.ROWID, guard_id: guard.ROWID, kind: 'system_red', text: guard.guard_name + ' card OUT · post empty · ' + hhmm(nowStamp()) });
    await sup.notify(catalystApp, log.post_id, 'Post empty', guard.guard_name + ' card OUT · ' + hhmm(nowStamp()), true);
  }

  // Card IN again the same duty day: back to where they were.
  async function backIn(catalystApp, zcql, guard, log) {
    const started = !!log.taken_over_at;
    await catalystApp.datastore().table('DutyLog').updateRow({ ROWID: log.ROWID, status: started ? 'on_duty' : 'waiting' });
    log.status = started ? 'on_duty' : 'waiting';
    await tellGuard(catalystApp, guard, '✅ Card IN again · ' + hhmm(nowStamp()), 'Your duty page is open again.');
    if (!started) return;
    await openPresence(catalystApp, log.post_id, guard.ROWID, log.ROWID, 'main');
    await addMessage(catalystApp, { post_id: log.post_id, duty_log_id: log.ROWID, guard_id: guard.ROWID, kind: 'system', text: guard.guard_name + ' card IN again · ' + hhmm(nowStamp()) });
  }

  // Screens 1 and 2: my post, my shift, who I take over from, and their pinned notes.
  app.get('/postDuty', async (req, res) => {
    try {
      const catalystApp = catalyst.initialize(req, { scope: 'admin' });
      const zcql = catalystApp.zcql();
      const me = await guardByToken(zcql, req.query.t);
      const log = (await myLog(zcql, me.ROWID)) || (await lateStart(catalystApp, zcql, me));
      if (!log) {
        return res.status(200).json({ status: 'success', data: { name: me.guard_name, locked: true } });
      }
      // Last swipe was OUT (after this duty's IN): the page shows only that.
      const last = await zcql.executeZCQLQuery(`SELECT direction, punch_time, CREATEDTIME FROM AccessLog WHERE guard_id = ${requireRowId(me.ROWID)} ORDER BY CREATEDTIME DESC LIMIT 1`);
      const swipe = last.length ? last[0].AccessLog : null;
      if (log.status === 'out' || (swipe && swipe.direction === 'OUT' && String(swipe.CREATEDTIME).slice(0, 16) >= String(log.in_at || ''))) {
        return res.status(200).json({ status: 'success', data: { name: me.guard_name, locked: true, out: true, outAt: swipe ? swipe.punch_time : '' } });
      }
      const [posts, shifts, others] = await Promise.all([
        zcql.executeZCQLQuery(`SELECT ROWID, post_name, branch_id, vehicle_entry FROM Posts WHERE ROWID = ${requireRowId(log.post_id)}`),
        getShifts(zcql),
        log.status === 'waiting' ? onDutyAt(zcql, log.post_id, log.ROWID) : Promise.resolve([])
      ]);
      const post = posts.length ? posts[0].Posts : { post_name: 'Post', branch_id: null };
      const branches = post.branch_id
        ? await zcql.executeZCQLQuery(`SELECT branch_name, area, supervisor_phone FROM Branches WHERE ROWID = ${requireRowId(post.branch_id)}`)
        : [];
      const branch = branches.length ? branches[0].Branches : {};

      // Handover notes: what was pinned at this post for the next guard since the guard I take
      // over from started (a general-shift guard's notes count too); last 24 hours if nobody.
      let from = null;
      let notes = [];
      let works = [];
      let atPost = [];
      const general = log.shift_code === GENERAL;
      if (log.status === 'waiting') {
        works = (await openWorks(zcql, log.post_id)).map(workView);
        // Yesterday's row of the same guard is not "someone else"; a general guard is never taken over from.
        const here = others.filter(o => String(o.guard_id) !== String(me.ROWID));
        const prev = general ? null : here.find(o => o.shift_code !== GENERAL) || null;
        const lastLogs = prev ? [prev] : (await zcql.executeZCQLQuery(`SELECT * FROM DutyLog WHERE post_id = ${requireRowId(log.post_id)} AND status = 'handed_over' ORDER BY handed_over_at DESC LIMIT 1`)).map(r => r.DutyLog);
        const last = lastLogs[0];
        const dayAgo = new Date(Date.now() + IST_OFFSET_MIN * 60000 - 86400000).toISOString().slice(0, 16).replace('T', ' ');
        const since = general || !last || !last.taken_over_at ? dayAgo : last.taken_over_at;
        const pinned = await zcql.executeZCQLQuery(`SELECT ROWID, guard_id, text, CREATEDTIME FROM PostMessages WHERE post_id = ${requireRowId(log.post_id)} AND pinned = true AND CREATEDTIME >= '${since}:00' ORDER BY CREATEDTIME ASC`);
        const names = await namesOf(zcql, here.map(o => o.guard_id).concat(pinned.map(r => r.PostMessages.guard_id)));
        const nameOf = id => (names[String(id)] || {}).guard_name || 'Guard';
        notes = pinned.map(r => ({ text: r.PostMessages.text, time: String(r.PostMessages.CREATEDTIME).slice(11, 16), by: nameOf(r.PostMessages.guard_id) }));
        if (prev) from = { name: nameOf(prev.guard_id), shift: prev.shift_code, since: (prev.taken_over_at || '').slice(11, 16) };
        // General shift: who is already standing here (no handover with them).
        if (general) atPost = here.map(o => ({ name: nameOf(o.guard_id), shift: o.shift_code, since: (o.taken_over_at || '').slice(11, 16), onBreak: o.status === 'on_break' }));
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
          from, notes, works, general, atPost, vehicleEntry: isTrue(post.vehicle_entry)
        }
      });
    } catch (err) {
      fail(res, err);
    }
  });

  // F4: only the incoming guard presses it. The guard on duty before is handed over at once.
  app.post('/takeOver', async (req, res) => {
    try {
      const catalystApp = catalyst.initialize(req, { scope: 'admin' });
      const zcql = catalystApp.zcql();
      const me = await guardByToken(zcql, req.body.t);
      const log = await myLog(zcql, me.ROWID);
      if (!log) throw new Error('Your card IN is not there yet.');
      if (log.status !== 'waiting') throw new Error('You have already taken over.');
      if (log.shift_code === GENERAL) throw new Error('General shift: press Start duty.');
      const now = nowStamp();
      const table = catalystApp.datastore().table('DutyLog');
      const onPost = await onDutyAt(zcql, log.post_id, log.ROWID);
      const prevs = onPost.filter(p => p.shift_code !== GENERAL);
      const generalHere = onPost.filter(p => p.shift_code === GENERAL);
      for (const p of prevs) {
        await table.updateRow({ ROWID: p.ROWID, status: 'handed_over', handed_over_at: now });
        await closePresence(catalystApp, zcql, log.post_id, p.guard_id, null);
      }
      await table.updateRow({ ROWID: log.ROWID, status: 'on_duty', taken_over_at: now });
      await openPresence(catalystApp, log.post_id, me.ROWID, log.ROWID, 'main');

      // Every older row still on duty at this post is closed; only another guard is named and told.
      const others = prevs.filter(p => String(p.guard_id) !== String(me.ROWID));
      const names = await namesOf(zcql, others.map(p => p.guard_id));
      const prevName = others.length ? (names[String(others[0].guard_id)] || {}).guard_name : null;
      const time = now.slice(11, 16);
      const gNames = generalHere.length ? await namesOf(zcql, generalHere.map(p => p.guard_id)) : {};
      const stillHere = generalHere.map(p => (gNames[String(p.guard_id)] || {}).guard_name).filter(Boolean);
      await addMessage(catalystApp, {
        post_id: log.post_id, duty_log_id: log.ROWID, guard_id: me.ROWID, kind: 'system',
        text: me.guard_name + (prevName ? ' took over from ' + prevName : ' took over') + ' · ' + time + (stillHere.length ? ' · ' + stillHere.join(', ') + ' still on duty' : '')
      });

      // "You can leave" to the guard going home. A push problem must not undo the take-over.
      const posts = await zcql.executeZCQLQuery(`SELECT post_name FROM Posts WHERE ROWID = ${requireRowId(log.post_id)}`);
      const postName = posts.length ? posts[0].Posts.post_name : 'your post';
      for (const p of others) {
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

  // F5: general shift guard starts duty; nobody is handed over.
  app.post('/startGeneral', async (req, res) => {
    try {
      const catalystApp = catalyst.initialize(req, { scope: 'admin' });
      const zcql = catalystApp.zcql();
      const me = await guardByToken(zcql, req.body.t);
      const log = await myLog(zcql, me.ROWID);
      if (!log) throw new Error('Your card IN is not there yet.');
      if (log.shift_code !== GENERAL) throw new Error('Only for the general shift.');
      if (log.status !== 'waiting') throw new Error('Your duty has already started.');
      const now = nowStamp();
      await catalystApp.datastore().table('DutyLog').updateRow({ ROWID: log.ROWID, status: 'on_duty', taken_over_at: now });
      await openPresence(catalystApp, log.post_id, me.ROWID, log.ROWID, 'main');
      await addMessage(catalystApp, { post_id: log.post_id, duty_log_id: log.ROWID, guard_id: me.ROWID, kind: 'system', text: me.guard_name + ' started general duty · ' + hhmm(now) });
      res.status(200).json({ status: 'success', data: { started: hhmm(now) } });
    } catch (err) {
      fail(res, err);
    }
  });

  // F28: general shift guard ends duty. An optional note is pinned for the guard staying.
  app.post('/endGeneral', async (req, res) => {
    try {
      const catalystApp = catalyst.initialize(req, { scope: 'admin' });
      const zcql = catalystApp.zcql();
      const me = await guardByToken(zcql, req.body.t);
      const log = await myLog(zcql, me.ROWID);
      if (!log || log.shift_code !== GENERAL || log.status !== 'on_duty') throw new Error('Your general duty is not running.');
      const note = cleanText(req.body.note, 'Note', MAX_TEXT, false);
      if (note) await addMessage(catalystApp, { post_id: log.post_id, duty_log_id: log.ROWID, guard_id: me.ROWID, kind: 'text', text: note, pinned: true });
      const now = nowStamp();
      await catalystApp.datastore().table('DutyLog').updateRow({ ROWID: log.ROWID, status: 'handed_over', handed_over_at: now });
      await closePresence(catalystApp, zcql, log.post_id, me.ROWID, null);
      await addMessage(catalystApp, { post_id: log.post_id, duty_log_id: log.ROWID, guard_id: me.ROWID, kind: 'system', text: me.guard_name + ' ended general duty · ' + hhmm(now) });
      res.status(200).json({ status: 'success', data: { ended: hhmm(now) } });
    } catch (err) {
      fail(res, err);
    }
  });

  // My log, only once I am on duty (timeline is read and written only by the guard on duty).
  // `postId` = another post I am covering during that guard's break: I read and write there,
  // with my own duty log (so it is known whose shift wrote it). `allowBreak` = reading is fine
  // while I am on break.
  async function onDutyLog(zcql, token, postId, allowBreak) {
    const me = await guardByToken(zcql, token);
    const own = await myLog(zcql, me.ROWID);
    const ok = own && (own.status === 'on_duty' || (allowBreak && own.status === 'on_break'));
    if (!ok) {
      throw new Error(own && own.status === 'out' ? 'You are card OUT. Your page opens after card IN.'
        : own && own.status === 'on_break' ? "You are on break. Press I'm back first." : 'Press Taken over first.');
    }
    if (!postId || String(postId) === String(own.post_id)) return { me, log: own, own, covering: null };
    const rows = await zcql.executeZCQLQuery(`SELECT * FROM Breaks WHERE cover_guard_id = ${requireRowId(me.ROWID)} AND post_id = ${requireRowId(postId)} AND status = 'accepted'`);
    if (!rows.length) throw new Error('You are not covering that post now.');
    return { me, log: { ...own, post_id: String(postId) }, own, covering: rows[0].Breaks };
  }

  // The post a read-only screen looks at: the guard's (by his link), or, for an office login without a
  // link, any post of its area with that post's running duty (or today with no shift).
  async function viewLog(req, zcql) {
    if (req.query.t || !req.user) return onDutyLog(zcql, req.query.t, req.query.post, true);
    const postId = requireRowId(req.query.post);
    const rows = await zcql.executeZCQLQuery(`SELECT ROWID, branch_id, agency_id FROM Posts WHERE ROWID = ${postId}`);
    if (!rows.length) throw new Error('Post not found.');
    auth.requireRow(req, rows[0].Posts, 'post');
    const run = await zcql.executeZCQLQuery(`SELECT * FROM DutyLog WHERE post_id = ${postId} AND (status = 'on_duty' OR status = 'on_break' OR status = 'waiting') ORDER BY CREATEDTIME DESC LIMIT 1`);
    return { log: run.length ? run[0].DutyLog : { ROWID: null, post_id: String(postId), duty_date: shiftDate(), shift_code: '' } };
  }

  // ---------- small helpers for the timeline ----------

  // A message from the office (25 Oct): typed (kind supervisor), or a photo / video / voice / work with no
  // guard and the sender's "Name · Role" in author_name. Used by the timeline and the guard's "seen".
  const office = m => m.kind === 'supervisor' || (!m.guard_id && !!m.author_name);

  const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  const PHONE_RE = /^[0-9+ -]{6,20}$/;
  const hhmm = stamp => String(stamp || '').slice(11, 16);

  function cleanText(value, label, max, required) {
    const text = String(value || '').trim();
    if (required && !text) throw new Error(label + ' is needed.');
    if (text.length > max) throw new Error(label + ' is too long (max ' + max + ' letters).');
    return text;
  }

  // Minutes from stamp a to stamp b ("2026-10-16 05:58").
  const minutesBetween = (a, b) => (Date.parse(b.replace(' ', 'T') + ':00Z') - Date.parse(a.replace(' ', 'T') + ':00Z')) / 60000;

  // A permit 22:00 → 06:00 ends the next morning.
  function permitEnd(from, to) {
    const now = nowStamp();
    const d = new Date(now.slice(0, 10) + 'T00:00:00Z');
    if (to <= from) d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10) + ' ' + to;
  }

  function workView(w) {
    const now = nowStamp();
    return {
      ROWID: w.ROWID, contractor: w.contractor, persons: parseInt(w.persons, 10) || 0, description: w.description || '',
      from: w.permit_from || '', to: w.permit_to || '', started: hhmm(w.started_at), finished: hhmm(w.finished_at),
      expired: !w.finished_at && !!w.permit_end && now > w.permit_end
    };
  }

  // Work still going on at a post (no "Work finished" yet).
  async function openWorks(zcql, postId) {
    return (await zcql.executeZCQLQuery(`SELECT * FROM WorkUpdates WHERE post_id = ${requireRowId(postId)} AND finished_at IS NULL ORDER BY CREATEDTIME ASC`)).map(r => r.WorkUpdates);
  }

  // F15 without a cron (saves runs and reads): when the timeline is opened, a permit that has
  // run out gets its red system message once.
  async function notePermitsExpired(catalystApp, log, works) {
    const now = nowStamp();
    for (const w of works) {
      if (w.permit_end && now > w.permit_end && !isTrue(w.expired_noted)) {
        await catalystApp.datastore().table('WorkUpdates').updateRow({ ROWID: w.ROWID, expired_noted: true });
        await addMessage(catalystApp, {
          post_id: log.post_id, duty_log_id: log.ROWID, kind: 'system_red', ref_id: w.ROWID,
          text: 'Permit expired · ' + w.permit_to + ' · ' + w.contractor + ' still working'
        });
        w.expired_noted = true;
      }
    }
  }

  async function rowsByIds(zcql, table, ids) {
    const list = [...new Set(ids.filter(Boolean).map(String))].map(requireRowId);
    if (!list.length) return {};
    const rows = await zcql.executeZCQLQuery(`SELECT * FROM ${table} WHERE ROWID IN (${list.join(', ')})`);
    const map = {};
    rows.forEach(r => { map[String(r[table].ROWID)] = r[table]; });
    return map;
  }

  const mediaLabel = kind => ({ photo: 'Photo', video: 'Video', voice: 'Voice note' }[kind] || '');

  // One-hour download links for the photos / videos / voice notes on screen. Making a link needs
  // the admin scope. A missing object only loses its own link, not the whole timeline.
  async function mediaLinks(req, keys) {
    const links = {};
    if (!keys.length) return links;
    const bucket = catalyst.initialize(req, { scope: 'admin' }).stratus().bucket(MEDIA_BUCKET);
    await Promise.all([...new Set(keys)].map(async key => {
      try {
        const r = await bucket.generatePreSignedUrl(key, 'GET', { expiryIn: String(MEDIA_LINK_SECONDS) });
        links[key] = r.signature;
      } catch (err) {
        console.error('Media link failed:', key, err.message || err);
      }
    }));
    return links;
  }

  // The post's latest notes (all shifts), oldest first, with work cards, alerts and media links.
  // Used by the guard on duty (viewer.guardId / viewer.logId) and by the supervisor (viewer.supervisor).
  async function timelineData(req, catalystApp, zcql, postId, viewer) {
    const open = await openWorks(zcql, postId);
    await notePermitsExpired(catalystApp, { post_id: postId, ROWID: viewer.logId || null }, open);

    const rows = (await zcql.executeZCQLQuery(`SELECT ROWID, duty_log_id, guard_id, kind, text, pinned, reply_to_id, ref_id, forwarded, media_key, media_source, duration, author_name, seen_by, seen_at, CREATEDTIME FROM PostMessages WHERE post_id = ${requireRowId(postId)} ORDER BY CREATEDTIME DESC LIMIT ${TIMELINE_LIMIT}`))
      .map(r => r.PostMessages).reverse();
    const [names, works, alerts, links] = await Promise.all([
      namesOf(zcql, rows.map(m => m.guard_id)),
      rowsByIds(zcql, 'WorkUpdates', rows.filter(m => m.kind === 'work').map(m => m.ref_id)),
      rowsByIds(zcql, 'Alerts', rows.filter(m => m.kind === 'alert').map(m => m.ref_id)),
      mediaLinks(req, rows.filter(m => m.media_key).map(m => m.media_key))
    ]);
    const byId = {};
    rows.forEach(m => { byId[String(m.ROWID)] = m; });
    const authorOf = m => (office(m) ? m.author_name || 'Supervisor' : (names[String(m.guard_id)] || {}).guard_name || '');
    const now = nowStamp();

    const messages = rows.map(m => {
      const q = m.reply_to_id ? byId[String(m.reply_to_id)] : null;
      const a = m.kind === 'alert' ? alerts[String(m.ref_id)] : null;
      const w = m.kind === 'work' ? works[String(m.ref_id)] : null;
      return {
        ROWID: m.ROWID, kind: m.kind, text: m.text, pinned: isTrue(m.pinned), forwarded: isTrue(m.forwarded),
        mine: viewer.supervisor ? office(m) : String(m.guard_id) === String(viewer.guardId), office: office(m),
        // Only the guard's own shift's notes can be pinned / unpinned.
        myShift: !viewer.supervisor && String(m.duty_log_id) === String(viewer.logId),
        author: authorOf(m), seenBy: m.seen_by || '', seen: hhmm(m.seen_at),
        stamp: String(m.CREATEDTIME).slice(0, 19),
        date: String(m.CREATEDTIME).slice(0, 10), time: String(m.CREATEDTIME).slice(11, 16),
        reply: q ? { id: String(q.ROWID), author: authorOf(q), text: q.kind === 'work' ? 'Work update · ' + q.text : q.text || mediaLabel(q.kind) } : null,
        media: m.media_key ? { url: links[m.media_key] || '', source: m.media_source || '', duration: parseInt(m.duration, 10) || 0 } : null,
        work: w ? workView(w) : null,
        alert: a ? {
          ROWID: a.ROWID, status: a.status, sent: hhmm(a.sent_at), seenBy: a.seen_by || '', seen: hhmm(a.seen_at),
          cancelled: hhmm(a.cancelled_at), waitMin: a.status === 'sent' && a.sent_at ? Math.floor(minutesBetween(a.sent_at, now)) : 0
        } : null
      };
    });
    return { messages, open, rows };
  }

  // Screen 3 for the guard. No auto-refresh: 🔄 button, push and coming back to the app.
  app.get('/postTimeline', async (req, res) => {
    try {
      const catalystApp = catalyst.initialize(req, { scope: 'admin' });
      const zcql = catalystApp.zcql();
      const { me, log, own } = await onDutyLog(zcql, req.query.t, req.query.post, true);
      const { messages, open, rows } = await timelineData(req, catalystApp, zcql, log.post_id, { guardId: me.ROWID, logId: log.ROWID });

      // F31: supervisor messages are now seen by this guard.
      const unseen = rows.filter(m => office(m) && !m.seen_by);
      if (unseen.length) {
        const now = nowStamp();
        for (const m of unseen) await catalystApp.datastore().table('PostMessages').updateRow({ ROWID: m.ROWID, seen_by: me.guard_name, seen_at: now });
      }

      const [breakState, others] = await Promise.all([breaks.state(zcql, me, own, log.post_id), onDutyAt(zcql, log.post_id, own.ROWID)]);
      // Other guards on duty at this post now (general shift guard sees who stays after him).
      const otherNames = await namesOf(zcql, others.map(o => o.guard_id));
      const atPost = others.filter(o => String(o.guard_id) !== String(me.ROWID))
        .map(o => ({ name: (otherNames[String(o.guard_id)] || {}).guard_name || 'Guard', shift: o.shift_code }));
      res.status(200).json({ status: 'success', data: { messages, openWorks: open.map(workView), atPost, ...breakState } });
    } catch (err) {
      fail(res, err);
    }
  });

  // F6 / F12: a text note on the timeline, or a reply to one message (OK / Noted / Done / text).
  app.post('/postMessage', async (req, res) => {
    try {
      const catalystApp = catalyst.initialize(req, { scope: 'admin' });
      const zcql = catalystApp.zcql();
      const { me, log } = await onDutyLog(zcql, req.body.t, req.body.post);
      const text = cleanText(req.body.text, 'Note', MAX_TEXT, true);
      const row = { post_id: log.post_id, duty_log_id: log.ROWID, guard_id: me.ROWID, kind: 'text', text };
      if (req.body.reply_to) {
        const q = await zcql.executeZCQLQuery(`SELECT ROWID FROM PostMessages WHERE ROWID = ${requireRowId(req.body.reply_to)} AND post_id = ${requireRowId(log.post_id)}`);
        if (!q.length) throw new Error('That message is not on this post.');
        row.reply_to_id = req.body.reply_to;
      }
      const saved = await addMessage(catalystApp, row);
      await sup.notify(catalystApp, log.post_id, me.guard_name, text, false);
      res.status(200).json({ status: 'success', data: { ROWID: saved.ROWID, time: String(saved.CREATEDTIME).slice(11, 16) } });
    } catch (err) {
      fail(res, err);
    }
  });

  // F7 / F8 / F9: photo, video or voice note. The phone sends the file itself as the request
  // body (made small on the phone first); details come in the query string.
  app.post('/uploadMedia', express.raw({ type: () => true, limit: '26mb' }), async (req, res) => {
    try {
      const catalystApp = catalyst.initialize(req, { scope: 'admin' });
      const zcql = catalystApp.zcql();
      const { me, log } = await onDutyLog(zcql, req.query.t, req.query.post);
      const kind = String(req.query.kind || '');
      const rule = MEDIA[kind];
      if (!rule) throw new Error('Unknown media type.');
      const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      const ext = rule.types[type];
      if (!ext) throw new Error('This file type is not allowed (' + (type || 'unknown') + ').');
      const body = req.body;
      if (!Buffer.isBuffer(body) || !body.length) throw new Error('The file is empty.');
      if (body.length > rule.max) throw new Error('File is too big (max ' + Math.round(rule.max / 1048576) + ' MB).');
      const source = String(req.query.source || '');
      if (!MEDIA_SOURCES.includes(source)) throw new Error('Unknown media source.');
      const duration = Math.max(0, Math.round(Number(req.query.duration) || 0));
      if (kind === 'video' && duration > MAX_VIDEO_SECONDS + 1) throw new Error('Video must be ' + MAX_VIDEO_SECONDS + ' seconds or less.');
      if (kind === 'voice' && duration > MAX_VOICE_SECONDS + 1) throw new Error('Voice note is too long.');

      const key = 'post/' + log.post_id + '/' + log.duty_date + '/' + crypto.randomBytes(8).toString('hex') + '.' + ext;
      const bucket = catalyst.initialize(req, { scope: 'admin' }).stratus().bucket(MEDIA_BUCKET);
      await bucket.putObject(key, body, { contentType: type });
      const row = { post_id: log.post_id, duty_log_id: log.ROWID, guard_id: me.ROWID, kind, text: '', media_key: key, media_source: source, duration };
      if (req.query.reply_to) row.reply_to_id = requireRowId(req.query.reply_to);
      const saved = await addMessage(catalystApp, row);
      await sup.notify(catalystApp, log.post_id, me.guard_name, mediaLabel(kind) + (source === 'gallery' ? ' (from gallery)' : ''), false);
      res.status(200).json({ status: 'success', data: { ROWID: saved.ROWID } });
    } catch (err) {
      fail(res, err);
    }
  });

  // One text message of this post (for pin / send to supervisor).
  async function postTextMessage(zcql, log, rowid) {
    const rows = await zcql.executeZCQLQuery(`SELECT ROWID, duty_log_id, post_id, kind FROM PostMessages WHERE ROWID = ${requireRowId(rowid)}`);
    const m = rows.length ? rows[0].PostMessages : null;
    if (!m || String(m.post_id) !== String(log.post_id)) throw new Error('That message is not on this post.');
    return m;
  }

  // F10: pin / unpin one of my own notes of this shift for the next guard.
  app.post('/pinMessage', async (req, res) => {
    try {
      const catalystApp = catalyst.initialize(req, { scope: 'admin' });
      const zcql = catalystApp.zcql();
      const { log } = await onDutyLog(zcql, req.body.t, req.body.post);
      const m = await postTextMessage(zcql, log, req.body.rowid);
      if (String(m.duty_log_id) !== String(log.ROWID) || m.kind !== 'text') {
        throw new Error('You can pin only your own notes of this shift.');
      }
      const pinned = req.body.pinned === true;
      await catalystApp.datastore().table('PostMessages').updateRow({ ROWID: m.ROWID, pinned });
      res.status(200).json({ status: 'success', data: { pinned } });
    } catch (err) {
      fail(res, err);
    }
  });

  // F11: mark a message for the supervisor. It shows in the supervisor inbox (built later).
  app.post('/forwardMessage', async (req, res) => {
    try {
      const catalystApp = catalyst.initialize(req, { scope: 'admin' });
      const zcql = catalystApp.zcql();
      const { me, log } = await onDutyLog(zcql, req.body.t, req.body.post);
      const m = await postTextMessage(zcql, log, req.body.rowid);
      await catalystApp.datastore().table('PostMessages').updateRow({ ROWID: m.ROWID, forwarded: true });
      const full = await zcql.executeZCQLQuery(`SELECT text, kind FROM PostMessages WHERE ROWID = ${requireRowId(m.ROWID)}`);
      const fwd = full.length ? full[0].PostMessages : {};
      await sup.notify(catalystApp, log.post_id, me.guard_name + ' sent you', fwd.text || mediaLabel(fwd.kind), true);
      res.status(200).json({ status: 'success', data: { forwarded: true } });
    } catch (err) {
      fail(res, err);
    }
  });

  // F13: a contractor's work at the post; shows as a card "In progress" until Work finished.
  app.post('/addWork', async (req, res) => {
    try {
      const catalystApp = catalyst.initialize(req, { scope: 'admin' });
      const zcql = catalystApp.zcql();
      const { me, log } = await onDutyLog(zcql, req.body.t, req.body.post);
      const b = req.body;
      const contractor = cleanText(b.contractor, 'Contractor', 100, true);
      const description = cleanText(b.description, 'What work', MAX_TEXT, false);
      const from = String(b.permit_from || '');
      const to = String(b.permit_to || '');
      if (!TIME_RE.test(from) || !TIME_RE.test(to)) throw new Error('Pick the permit time From and To.');
      const persons = parseInt(b.persons, 10);
      if (!(persons >= 1 && persons <= 500)) throw new Error('Number of persons must be 1 or more.');
      if (permitEnd(from, to) <= nowStamp()) throw new Error('This permit time is already over (ends ' + to + '). Check From and To.');
      const work = await catalystApp.datastore().table('WorkUpdates').insertRow({
        post_id: log.post_id, duty_log_id: log.ROWID, guard_id: me.ROWID, contractor, persons, description,
        permit_from: from, permit_to: to, permit_end: permitEnd(from, to), started_at: nowStamp(), expired_noted: false
      });
      await addMessage(catalystApp, { post_id: log.post_id, duty_log_id: log.ROWID, guard_id: me.ROWID, kind: 'work', ref_id: work.ROWID, text: contractor });
      await sup.notify(catalystApp, log.post_id, me.guard_name, 'Work update: ' + contractor + ' · ' + persons + ' persons · permit ' + from + '–' + to, false);
      res.status(200).json({ status: 'success', data: workView(work) });
    } catch (err) {
      fail(res, err);
    }
  });

  // F14: any guard on duty at the post can close a work.
  app.post('/finishWork', async (req, res) => {
    try {
      const catalystApp = catalyst.initialize(req, { scope: 'admin' });
      const zcql = catalystApp.zcql();
      const { me, log } = await onDutyLog(zcql, req.body.t, req.body.post);
      const rows = await zcql.executeZCQLQuery(`SELECT * FROM WorkUpdates WHERE ROWID = ${requireRowId(req.body.rowid)}`);
      const w = rows.length ? rows[0].WorkUpdates : null;
      if (!w || String(w.post_id) !== String(log.post_id)) throw new Error('That work is not at this post.');
      if (w.finished_at) throw new Error('This work is already finished.');
      const now = nowStamp();
      await catalystApp.datastore().table('WorkUpdates').updateRow({ ROWID: w.ROWID, finished_at: now, finished_by: me.ROWID });
      await addMessage(catalystApp, {
        post_id: log.post_id, duty_log_id: log.ROWID, guard_id: me.ROWID, kind: 'system', ref_id: w.ROWID,
        text: w.contractor + ' work finished · ' + hhmm(now)
      });
      res.status(200).json({ status: 'success', data: { finished: hhmm(now) } });
    } catch (err) {
      fail(res, err);
    }
  });

  // F16: "Safety today": one row per shift (A, G, B, C), the latest name added for that shift.
  // Rows are only added, never changed, so the history stays.
  const SHIFT_ORDER = ['A', 'G', 'B', 'C'];
  app.get('/safety', async (req, res) => {
    try {
      const catalystApp = catalyst.initialize(req, { scope: 'admin' });
      const zcql = catalystApp.zcql();
      const { log } = await viewLog(req, zcql);
      const [shifts, rows] = await Promise.all([
        getShifts(zcql),
        zcql.executeZCQLQuery(`SELECT shift_code, name, phone, CREATEDTIME FROM SafetyEntries WHERE post_id = ${requireRowId(log.post_id)} AND duty_date = '${log.duty_date}' ORDER BY CREATEDTIME ASC`)
      ]);
      const latest = {};
      rows.forEach(r => { latest[r.SafetyEntries.shift_code] = r.SafetyEntries; });
      const list = shifts
        .slice().sort((a, b) => SHIFT_ORDER.indexOf(a.code) - SHIFT_ORDER.indexOf(b.code))
        .map(sh => {
          const e = latest[sh.code];
          return { ...sh, now: sh.code === log.shift_code, entry: e ? { name: e.name, phone: e.phone || '', time: hhmm(e.CREATEDTIME) } : null };
        });
      res.status(200).json({ status: 'success', data: { date: log.duty_date, shifts: list } });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post('/addSafety', async (req, res) => {
    try {
      const catalystApp = catalyst.initialize(req, { scope: 'admin' });
      const zcql = catalystApp.zcql();
      const { me, log } = await onDutyLog(zcql, req.body.t, req.body.post);
      const shifts = await getShifts(zcql);
      const code = String(req.body.shift_code || '').toUpperCase();
      if (!shifts.some(s => s.code === code)) throw new Error('Pick a shift');
      const name = cleanText(req.body.name, 'Name', 100, true);
      const phone = cleanText(req.body.phone, 'Phone', 20, false);
      if (phone && !PHONE_RE.test(phone)) throw new Error('Phone number looks wrong.');
      await catalystApp.datastore().table('SafetyEntries').insertRow({
        post_id: log.post_id, duty_date: log.duty_date, shift_code: code, name, phone, guard_id: me.ROWID
      });
      res.status(200).json({ status: 'success', data: { saved: true } });
    } catch (err) {
      fail(res, err);
    }
  });

  // F17: urgent problem → red card on the timeline. The supervisor side (seen / reply / escalation
  // to the next supervisor) comes with the supervisor inbox; the guard sees "Not seen yet" after 5 min.
  app.post('/sendAlert', async (req, res) => {
    try {
      const catalystApp = catalyst.initialize(req, { scope: 'admin' });
      const zcql = catalystApp.zcql();
      const { me, log } = await onDutyLog(zcql, req.body.t, req.body.post);
      const text = cleanText(req.body.text, 'Alert message', MAX_TEXT, true);
      const alert = await catalystApp.datastore().table('Alerts').insertRow({
        post_id: log.post_id, duty_log_id: log.ROWID, guard_id: me.ROWID, status: 'sent', sent_at: nowStamp()
      });
      await addMessage(catalystApp, { post_id: log.post_id, duty_log_id: log.ROWID, guard_id: me.ROWID, kind: 'alert', ref_id: alert.ROWID, text });
      await sup.notify(catalystApp, log.post_id, 'Alert from ' + me.guard_name, text, true);
      res.status(200).json({ status: 'success', data: { ROWID: alert.ROWID } });
    } catch (err) {
      fail(res, err);
    }
  });

  // F20: the guard cancels the alert (problem solved). Name and time are saved, no reason asked.
  app.post('/cancelAlert', async (req, res) => {
    try {
      const catalystApp = catalyst.initialize(req, { scope: 'admin' });
      const zcql = catalystApp.zcql();
      const { me, log } = await onDutyLog(zcql, req.body.t, req.body.post);
      const rows = await zcql.executeZCQLQuery(`SELECT ROWID, post_id, status FROM Alerts WHERE ROWID = ${requireRowId(req.body.rowid)}`);
      const a = rows.length ? rows[0].Alerts : null;
      if (!a || String(a.post_id) !== String(log.post_id)) throw new Error('That alert is not on this post.');
      if (a.status === 'cancelled') throw new Error('Already cancelled.');
      const now = nowStamp();
      await catalystApp.datastore().table('Alerts').updateRow({ ROWID: a.ROWID, status: 'cancelled', cancelled_at: now, cancelled_by: me.ROWID });
      await addMessage(catalystApp, {
        post_id: log.post_id, duty_log_id: log.ROWID, guard_id: me.ROWID, kind: 'system', ref_id: a.ROWID,
        text: 'Alert cancelled by ' + me.guard_name + ' · ' + hhmm(now)
      });
      res.status(200).json({ status: 'success', data: { cancelled: hhmm(now) } });
    } catch (err) {
      fail(res, err);
    }
  });

  // Breaks and cover (breaks.js) use the same helpers.
  const breaks = require('./breaks.js')(app, {
    catalyst, fail, requireRowId, guardByToken, sendPushToGuard, shiftDate, nowStamp, hhmm, minutesBetween,
    myLog, namesOf, addMessage, openPresence, closePresence, onDutyLog,
    notifySupervisors: (...args) => sup.notify(...args)
  });

  // Post history (history.js): read only.
  require('./history.js')(app, {
    catalyst, fail, requireRowId, requireDate, getShifts, nowStamp, hhmm, minutesBetween, isTrue,
    namesOf, onDutyLog, viewLog, workView, mediaLinks, mediaLabel
  });

  // Vehicle entry (vehicles.js): posts with vehicle entry on.
  require('./vehicles.js')(app, {
    catalyst, selectAll, requireRowId, requireDate, fail, nowStamp, hhmm, cleanText, isTrue, onDutyLog, shiftDate, auth, getSetting
  });

  // Supervisor inbox (supervisor.js).
  const sup = require('./supervisor.js')(app, {
    catalyst, fail, requireRowId, requireDate, getShifts, shiftDate, weekStartOf, nowStamp, hhmm, minutesBetween, cleanText, isTrue, MAX_TEXT,
    namesOf, addMessage, timelineData, workView, sendPushToGuard, sendPushToRows, getVapidKeys, auth,
    express, crypto, MEDIA, MEDIA_BUCKET, MEDIA_SOURCES, MAX_VIDEO_SECONDS, MAX_VOICE_SECONDS, mediaLabel, TIME_RE, permitEnd
  });

  return { onPostIn, onPostOut };
};
