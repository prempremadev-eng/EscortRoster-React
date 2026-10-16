"use strict"

/* ---------------- BREAKS AND COVER (post guards) ---------------- */
// A guard going on break asks another guard on duty to cover the post; that guard must accept.
//   asked → accepted (go to the post / stay and watch both) → ended (I'm back)
//   asked → declined → ask someone else / cancel
//   "No one yet" → alone (the post is empty until the guard is back)
// Breaks has one row per break. Presence (post.js) records who stood where, minute by minute.

const TYPES = { tea: 'Tea', lunch: 'Lunch', restroom: 'Restroom', other: 'Other' };
const ACTIVE = ['asked', 'declined', 'accepted', 'alone'];

module.exports = function breakRoutes(app, h) {
  const { catalyst, fail, requireRowId, guardByToken, sendPushToGuard, shiftDate, nowStamp, hhmm, minutesBetween,
    myLog, namesOf, addMessage, openPresence, closePresence, onDutyLog } = h;

  const statusIn = list => '(' + list.map(s => `status = '${s}'`).join(' OR ') + ')';
  const label = type => TYPES[type] || 'Break';

  async function postNames(zcql, ids) {
    const list = [...new Set(ids.filter(Boolean).map(String))].map(requireRowId);
    if (!list.length) return {};
    const rows = await zcql.executeZCQLQuery(`SELECT ROWID, post_name, branch_id FROM Posts WHERE ROWID IN (${list.join(', ')})`);
    const map = {};
    rows.forEach(r => { map[String(r.Posts.ROWID)] = r.Posts; });
    return map;
  }

  async function guardsById(zcql, ids) {
    const list = [...new Set(ids.filter(Boolean).map(String))].map(requireRowId);
    if (!list.length) return {};
    const rows = await zcql.executeZCQLQuery(`SELECT ROWID, guard_name, phone, guard_token FROM Guards WHERE ROWID IN (${list.join(', ')})`);
    const map = {};
    rows.forEach(r => { map[String(r.Guards.ROWID)] = r.Guards; });
    return map;
  }

  async function myActiveBreak(zcql, guardId) {
    const rows = await zcql.executeZCQLQuery(`SELECT * FROM Breaks WHERE guard_id = ${requireRowId(guardId)} AND ${statusIn(ACTIVE)} ORDER BY CREATEDTIME DESC LIMIT 1`);
    return rows.length ? rows[0].Breaks : null;
  }

  async function breakById(zcql, rowid) {
    const rows = await zcql.executeZCQLQuery(`SELECT * FROM Breaks WHERE ROWID = ${requireRowId(rowid)}`);
    if (!rows.length) throw new Error('Break not found.');
    return rows[0].Breaks;
  }

  // Push never blocks the action itself.
  async function tell(catalystApp, guard, title, body) {
    if (!guard) return;
    try {
      await sendPushToGuard(catalystApp, guard.ROWID, { title, body, url: guard.guard_token ? 'index.html#guard/' + guard.guard_token : 'index.html' });
    } catch (err) {
      console.error('Break push failed:', err);
    }
  }

  // For the timeline: my own break, cover requests sent to me, and posts I am covering now.
  async function state(zcql, me, own, viewPostId) {
    const [mine, asCover] = await Promise.all([
      myActiveBreak(zcql, me.ROWID),
      zcql.executeZCQLQuery(`SELECT * FROM Breaks WHERE cover_guard_id = ${requireRowId(me.ROWID)} AND ${statusIn(['asked', 'accepted'])} ORDER BY CREATEDTIME ASC`).then(r => r.map(x => x.Breaks))
    ]);
    const all = [mine, ...asCover].filter(Boolean);
    const [guards, posts] = await Promise.all([
      guardsById(zcql, all.flatMap(b => [b.guard_id, b.cover_guard_id])),
      postNames(zcql, all.flatMap(b => [b.post_id, b.cover_post_id]).concat([own.post_id]))
    ]);
    const now = nowStamp();
    const nameOf = id => (guards[String(id)] || {}).guard_name || '';
    const postOf = id => (posts[String(id)] || {}).post_name || '';
    const view = b => ({
      ROWID: b.ROWID, type: b.type, typeLabel: label(b.type), status: b.status, mode: b.cover_mode || '',
      guard: nameOf(b.guard_id), guardPhone: (guards[String(b.guard_id)] || {}).phone || '',
      cover: nameOf(b.cover_guard_id), postId: String(b.post_id), post: postOf(b.post_id), coverPost: postOf(b.cover_post_id),
      asked: hhmm(b.asked_at), start: hhmm(b.start_at), pinged: hhmm(b.pinged_at),
      minutes: b.start_at ? Math.max(0, Math.floor(minutesBetween(b.start_at, now))) : 0
    });
    const covering = asCover.filter(b => b.status === 'accepted').map(view);
    return {
      ownPostId: String(own.post_id), ownPost: postOf(own.post_id),
      myBreak: mine ? view(mine) : null,
      coverRequests: asCover.filter(b => b.status === 'asked').map(view),
      covering,
      // The post on screen is someone else's (I am covering it): what the header shows.
      coveringHere: covering.find(b => b.postId === String(viewPostId)) || null,
      // I went to cover another post: my own post is empty until I come back.
      ownEmpty: covering.some(b => b.mode === 'go')
    };
  }

  // Guards on duty now in the same branch, for "Who is covering?".
  app.get('/coverCandidates', async (req, res) => {
    try {
      const catalystApp = catalyst.initialize(req);
      const zcql = catalystApp.zcql();
      const { me, own } = await onDutyLog(zcql, req.query.t);
      const logs = (await zcql.executeZCQLQuery(`SELECT guard_id, post_id FROM DutyLog WHERE duty_date = '${shiftDate()}' AND status = 'on_duty'`))
        .map(r => r.DutyLog).filter(l => String(l.guard_id) !== String(me.ROWID));
      const posts = await postNames(zcql, logs.map(l => l.post_id).concat([own.post_id]));
      const branch = (posts[String(own.post_id)] || {}).branch_id;
      const here = logs.filter(l => (posts[String(l.post_id)] || {}).branch_id === branch);
      const names = await namesOf(zcql, here.map(l => l.guard_id));
      const list = here.map(l => ({
        guardId: String(l.guard_id), name: (names[String(l.guard_id)] || {}).guard_name || 'Guard',
        post: (posts[String(l.post_id)] || {}).post_name || ''
      })).sort((a, b) => a.name.localeCompare(b.name));
      res.status(200).json({ status: 'success', data: list });
    } catch (err) {
      fail(res, err);
    }
  });

  // F21: start a break. With a cover guard → "asked" (he must accept). No one → "alone" at once.
  // Asking again while asked / declined = "Someone else".
  app.post('/startBreak', async (req, res) => {
    try {
      const catalystApp = catalyst.initialize(req);
      const zcql = catalystApp.zcql();
      const { me, own } = await onDutyLog(zcql, req.body.t);
      const type = String(req.body.type || '');
      if (!TYPES[type]) throw new Error('Pick a break type.');
      const current = await myActiveBreak(zcql, me.ROWID);
      if (current && (current.status === 'accepted' || current.status === 'alone')) throw new Error('You are already on break.');
      const table = catalystApp.datastore().table('Breaks');
      const now = nowStamp();
      const posts = await postNames(zcql, [own.post_id]);
      const postName = (posts[String(own.post_id)] || {}).post_name || 'your post';

      if (!req.body.cover_guard_id) {
        const row = { post_id: own.post_id, duty_log_id: own.ROWID, guard_id: me.ROWID, type, status: 'alone', cover_guard_id: null, cover_post_id: null, cover_mode: null, asked_at: now, start_at: now };
        const brk = current ? await table.updateRow({ ROWID: current.ROWID, ...row }) : await table.insertRow(row);
        await catalystApp.datastore().table('DutyLog').updateRow({ ROWID: own.ROWID, status: 'on_break' });
        await closePresence(catalystApp, zcql, own.post_id, me.ROWID, 'main');
        await addMessage(catalystApp, { post_id: own.post_id, duty_log_id: own.ROWID, guard_id: me.ROWID, kind: 'system_red', text: me.guard_name + ' on ' + label(type).toLowerCase() + ' break · no one covering · post empty · ' + hhmm(now) });
        return res.status(200).json({ status: 'success', data: { ROWID: brk.ROWID, status: 'alone' } });
      }

      // The cover guard must be on duty today at a post of the same branch.
      const coverId = requireRowId(req.body.cover_guard_id);
      if (String(coverId) === String(me.ROWID)) throw new Error('Pick another guard.');
      const coverLog = await myLog(zcql, coverId);
      if (!coverLog || coverLog.status !== 'on_duty') throw new Error('That guard is not on duty now.');
      const both = await postNames(zcql, [coverLog.post_id, own.post_id]);
      if ((both[String(coverLog.post_id)] || {}).branch_id !== (both[String(own.post_id)] || {}).branch_id) throw new Error('That guard is in another branch.');

      const row = { post_id: own.post_id, duty_log_id: own.ROWID, guard_id: me.ROWID, type, status: 'asked', cover_guard_id: coverId, cover_post_id: coverLog.post_id, cover_mode: null, asked_at: now };
      const brk = current ? await table.updateRow({ ROWID: current.ROWID, ...row }) : await table.insertRow(row);
      const guards = await guardsById(zcql, [coverId]);
      await tell(catalystApp, guards[String(coverId)], '☕ Cover request · ' + hhmm(now), me.guard_name + ' asked you to cover ' + postName + ' · ' + label(type) + ' break');
      res.status(200).json({ status: 'success', data: { ROWID: brk.ROWID, status: 'asked' } });
    } catch (err) {
      fail(res, err);
    }
  });

  // Not on break after all (still waiting for an answer, or nobody could come).
  app.post('/cancelBreak', async (req, res) => {
    try {
      const catalystApp = catalyst.initialize(req);
      const zcql = catalystApp.zcql();
      const { me } = await onDutyLog(zcql, req.body.t);
      const b = await myActiveBreak(zcql, me.ROWID);
      if (!b || (b.status !== 'asked' && b.status !== 'declined')) throw new Error('Nothing to cancel.');
      await catalystApp.datastore().table('Breaks').updateRow({ ROWID: b.ROWID, status: 'cancelled', end_at: nowStamp() });
      res.status(200).json({ status: 'success', data: { cancelled: true } });
    } catch (err) {
      fail(res, err);
    }
  });

  // F22 / F23 / F24: the cover guard answers: go (walks to that post), stay (watches both), no.
  app.post('/respondCover', async (req, res) => {
    try {
      const catalystApp = catalyst.initialize(req);
      const zcql = catalystApp.zcql();
      const { me, own } = await onDutyLog(zcql, req.body.t);
      const b = await breakById(zcql, req.body.rowid);
      if (String(b.cover_guard_id) !== String(me.ROWID) || b.status !== 'asked') throw new Error('This request is not open any more.');
      const answer = String(req.body.answer || '');
      if (!['go', 'stay', 'no'].includes(answer)) throw new Error('Pick an answer.');
      const now = nowStamp();
      const time = hhmm(now);
      const [guards, posts] = await Promise.all([guardsById(zcql, [b.guard_id]), postNames(zcql, [b.post_id, own.post_id])]);
      const breaker = guards[String(b.guard_id)];
      const breakPost = (posts[String(b.post_id)] || {}).post_name || 'the post';
      const myPost = (posts[String(own.post_id)] || {}).post_name || 'my post';
      const table = catalystApp.datastore().table('Breaks');

      if (answer === 'no') {
        await table.updateRow({ ROWID: b.ROWID, status: 'declined' });
        await tell(catalystApp, breaker, "Can't cover now", me.guard_name + " can't cover " + breakPost + ' now. Ask someone else.');
        return res.status(200).json({ status: 'success', data: { status: 'declined' } });
      }

      await table.updateRow({ ROWID: b.ROWID, status: 'accepted', cover_mode: answer, start_at: now, cover_post_id: own.post_id });
      await catalystApp.datastore().table('DutyLog').updateRow({ ROWID: b.duty_log_id, status: 'on_break' });
      await closePresence(catalystApp, zcql, b.post_id, b.guard_id, 'main');
      await openPresence(catalystApp, b.post_id, me.ROWID, own.ROWID, 'cover');
      const who = breaker ? breaker.guard_name : 'Guard';
      const type = label(b.type).toLowerCase();
      if (answer === 'go') {
        await closePresence(catalystApp, zcql, own.post_id, me.ROWID, 'main');
        await addMessage(catalystApp, { post_id: b.post_id, duty_log_id: own.ROWID, guard_id: me.ROWID, kind: 'system', text: me.guard_name + ' came to cover · ' + who + ' on ' + type + ' break · ' + time });
        await addMessage(catalystApp, { post_id: own.post_id, duty_log_id: own.ROWID, guard_id: me.ROWID, kind: 'system_red', text: me.guard_name + ' went to cover ' + breakPost + ' · post empty · ' + time });
      } else {
        await addMessage(catalystApp, { post_id: b.post_id, duty_log_id: own.ROWID, guard_id: me.ROWID, kind: 'system', text: who + ' on ' + type + ' break · covered by ' + me.guard_name + ' (' + myPost + ') · ' + time });
        await addMessage(catalystApp, { post_id: own.post_id, duty_log_id: own.ROWID, guard_id: me.ROWID, kind: 'system', text: me.guard_name + ' accepted cover for ' + breakPost + ' · ' + time });
      }
      await tell(catalystApp, breaker, '✅ ' + me.guard_name + ' is covering', me.guard_name + (answer === 'go' ? ' came to ' + breakPost : ' is watching ' + breakPost + ' from ' + myPost) + '. Your ' + type + ' break started ' + time + '.');
      res.status(200).json({ status: 'success', data: { status: 'accepted', postId: String(b.post_id) } });
    } catch (err) {
      fail(res, err);
    }
  });

  // F25: the cover guard asks the guard on break to come back.
  app.post('/pingBack', async (req, res) => {
    try {
      const catalystApp = catalyst.initialize(req);
      const zcql = catalystApp.zcql();
      const { me, own } = await onDutyLog(zcql, req.body.t);
      const b = await breakById(zcql, req.body.rowid);
      if (String(b.cover_guard_id) !== String(me.ROWID) || b.status !== 'accepted') throw new Error('You are not covering this break now.');
      const now = nowStamp();
      await catalystApp.datastore().table('Breaks').updateRow({ ROWID: b.ROWID, pinged_at: now });
      const [guards, posts] = await Promise.all([guardsById(zcql, [b.guard_id]), postNames(zcql, [b.post_id])]);
      const breaker = guards[String(b.guard_id)];
      const postName = (posts[String(b.post_id)] || {}).post_name || 'your post';
      await addMessage(catalystApp, { post_id: b.post_id, duty_log_id: own.ROWID, guard_id: me.ROWID, kind: 'system', text: me.guard_name + ' asked ' + (breaker ? breaker.guard_name : 'the guard') + ' to come back · ' + hhmm(now) });
      await tell(catalystApp, breaker, '🔔 Please come back', me.guard_name + ': please come back to ' + postName + '.');
      res.status(200).json({ status: 'success', data: { pinged: hhmm(now) } });
    } catch (err) {
      fail(res, err);
    }
  });

  // F26: the guard is back from break. The cover guard goes back to their own post.
  app.post('/backOnDuty', async (req, res) => {
    try {
      const catalystApp = catalyst.initialize(req);
      const zcql = catalystApp.zcql();
      const me = await guardByToken(zcql, req.body.t);
      const own = await myLog(zcql, me.ROWID);
      if (!own || own.status !== 'on_break') throw new Error('You are not on break.');
      const b = await myActiveBreak(zcql, me.ROWID);
      const now = nowStamp();
      const time = hhmm(now);
      if (b) await catalystApp.datastore().table('Breaks').updateRow({ ROWID: b.ROWID, status: 'ended', end_at: now });
      await catalystApp.datastore().table('DutyLog').updateRow({ ROWID: own.ROWID, status: 'on_duty' });
      await openPresence(catalystApp, own.post_id, me.ROWID, own.ROWID, 'main');
      await addMessage(catalystApp, { post_id: own.post_id, duty_log_id: own.ROWID, guard_id: me.ROWID, kind: 'system', text: me.guard_name + ' back on duty · ' + time });

      if (b && b.status === 'accepted' && b.cover_guard_id) {
        await closePresence(catalystApp, zcql, own.post_id, b.cover_guard_id, 'cover');
        const coverLog = await myLog(zcql, b.cover_guard_id);
        if (b.cover_mode === 'go' && coverLog && b.cover_post_id) {
          await openPresence(catalystApp, b.cover_post_id, b.cover_guard_id, coverLog.ROWID, 'main');
          const guards = await guardsById(zcql, [b.cover_guard_id]);
          await addMessage(catalystApp, { post_id: b.cover_post_id, duty_log_id: coverLog.ROWID, guard_id: b.cover_guard_id, kind: 'system', text: ((guards[String(b.cover_guard_id)] || {}).guard_name || 'Guard') + ' back at the post · ' + time });
        }
        const guards = await guardsById(zcql, [b.cover_guard_id]);
        await tell(catalystApp, guards[String(b.cover_guard_id)], '👋 ' + me.guard_name + ' is back', me.guard_name + ' is back on duty' + (b.cover_mode === 'go' ? '. You can go back to your post.' : '.'));
      }
      res.status(200).json({ status: 'success', data: { back: time } });
    } catch (err) {
      fail(res, err);
    }
  });

  // F27: the cover guard goes back to their own post before the other guard is back.
  // The post on break is now empty.
  app.post('/leaveCover', async (req, res) => {
    try {
      const catalystApp = catalyst.initialize(req);
      const zcql = catalystApp.zcql();
      const { me, own } = await onDutyLog(zcql, req.body.t);
      const b = await breakById(zcql, req.body.rowid);
      if (String(b.cover_guard_id) !== String(me.ROWID) || b.status !== 'accepted') throw new Error('You are not covering this break now.');
      const now = nowStamp();
      const time = hhmm(now);
      await catalystApp.datastore().table('Breaks').updateRow({ ROWID: b.ROWID, status: 'alone' });
      await closePresence(catalystApp, zcql, b.post_id, me.ROWID, 'cover');
      const [guards, posts] = await Promise.all([guardsById(zcql, [b.guard_id]), postNames(zcql, [b.post_id, own.post_id])]);
      const myPost = (posts[String(own.post_id)] || {}).post_name || 'my post';
      const breakPost = (posts[String(b.post_id)] || {}).post_name || 'the post';
      if (b.cover_mode === 'go') {
        await openPresence(catalystApp, own.post_id, me.ROWID, own.ROWID, 'main');
        await addMessage(catalystApp, { post_id: own.post_id, duty_log_id: own.ROWID, guard_id: me.ROWID, kind: 'system', text: me.guard_name + ' back at the post · ' + time });
      }
      await addMessage(catalystApp, { post_id: b.post_id, duty_log_id: own.ROWID, guard_id: me.ROWID, kind: 'system_red', text: me.guard_name + ' went back to ' + myPost + ' · post empty · ' + time });
      await tell(catalystApp, guards[String(b.guard_id)], '⚠️ ' + breakPost + ' is empty', me.guard_name + ' went back to ' + myPost + '. Please come back to ' + breakPost + '.');
      res.status(200).json({ status: 'success', data: { left: time } });
    } catch (err) {
      fail(res, err);
    }
  });

  return { state };
};
