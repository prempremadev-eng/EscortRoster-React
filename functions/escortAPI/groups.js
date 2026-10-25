'use strict';

/* ---------------- AGENCY GROUP ("IPF Schedule", Prem 26 Oct) ---------------- */
// One group chat per branch + agency: every active guard of that agency (IN, OUT or off) and the office
// (shift incharge, admins). Everyone can send text, photo, video, voice and reply. The office tells the
// whole team at once ("tomorrow uniform check"); guards answer there.
// The guard opens it with his link even when not on duty; the office with its login.
// GroupMessages: branch_id, agency_id, guard_id (empty = office), author_name ("Name · Role" for the office),
// kind (text / photo / video / voice), text, media_key, media_source, duration, reply_to_id.

const LIMIT = 100;

module.exports = function groupRoutes(app, h) {
  const { catalyst, fail, requireRowId, guardByToken, sendPushToRows, nowStamp, cleanText, MAX_TEXT, auth,
    express, crypto, MEDIA, MEDIA_BUCKET, MEDIA_SOURCES, MAX_VIDEO_SECONDS, MAX_VOICE_SECONDS, mediaLabel, mediaLinks, namesOf } = h;

  async function agencyName(zcql, agencyId) {
    const rows = await zcql.executeZCQLQuery(`SELECT agency_name FROM Agencies WHERE ROWID = ${requireRowId(agencyId)}`);
    return rows.length ? rows[0].Agencies.agency_name : 'Team';
  }

  // Who is asking: a guard by his link, or the office by login (a shift incharge only for his agency).
  async function whoIs(req, zcql) {
    const q = { ...req.query, ...(req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body) ? req.body : {}) };
    if (q.t) {
      const me = await guardByToken(zcql, q.t);
      if (!me.branch_id || !me.agency_id) throw new Error('Your branch or agency is not set. Ask your supervisor.');
      return { guard: me, branch: String(me.branch_id), agency: String(me.agency_id), name: me.guard_name };
    }
    if (!req.user) throw new Error('Please sign in.');
    const branch = String(auth.requireBranch(req, requireRowId(q.branch)));
    const agency = String(req.scope.agency || requireRowId(q.agency || '') );
    return { guard: null, branch, agency, name: (req.user.name + ' · ' + auth.ROLE_NAME[req.user.role]).slice(0, 100) };
  }

  const view = (m, names, links, byId, who) => {
    const author = r => (r.guard_id ? (names[String(r.guard_id)] || {}).guard_name || 'Guard' : r.author_name || 'Office');
    const q = m.reply_to_id ? byId[String(m.reply_to_id)] : null;
    return {
      ROWID: String(m.ROWID), kind: m.kind || 'text', text: m.text || '', author: author(m), office: !m.guard_id,
      mine: who.guard ? String(m.guard_id) === String(who.guard.ROWID) : !m.guard_id && m.author_name === who.name,
      date: String(m.CREATEDTIME).slice(0, 10), time: String(m.CREATEDTIME).slice(11, 16),
      reply: q ? { id: String(q.ROWID), author: author(q), text: q.text || mediaLabel(q.kind) } : null,
      media: m.media_key ? { url: links[m.media_key] || '', source: m.media_source || '', duration: parseInt(m.duration, 10) || 0 } : null
    };
  };

  async function chat(req, zcql, who) {
    const rows = (await zcql.executeZCQLQuery(`SELECT * FROM GroupMessages WHERE branch_id = ${who.branch} AND agency_id = ${who.agency} ORDER BY CREATEDTIME DESC LIMIT ${LIMIT}`))
      .map(r => r.GroupMessages).reverse();
    const [names, links, agName] = await Promise.all([
      namesOf(zcql, rows.map(m => m.guard_id).filter(Boolean)),
      mediaLinks(req, rows.filter(m => m.media_key).map(m => m.media_key)),
      agencyName(zcql, who.agency)
    ]);
    const byId = {};
    rows.forEach(m => { byId[String(m.ROWID)] = m; });
    return { title: agName + ' Schedule', messages: rows.map(m => view(m, names, links, byId, who)) };
  }

  async function replyOf(zcql, who, rowid) {
    if (!rowid) return {};
    const rows = await zcql.executeZCQLQuery(`SELECT ROWID, branch_id, agency_id FROM GroupMessages WHERE ROWID = ${requireRowId(rowid)}`);
    const r = rows.length ? rows[0].GroupMessages : null;
    if (!r || String(r.branch_id) !== who.branch || String(r.agency_id) !== who.agency) throw new Error('That message is not in this group.');
    return { reply_to_id: r.ROWID };
  }

  // Office → every phone of the team's guards; guard → the office browsers of that branch and agency.
  async function tell(catalystApp, zcql, who, body) {
    try {
      const title = '👥 ' + await agencyName(zcql, who.agency) + ' Schedule';
      const text = (who.guard ? who.guard.guard_name : who.name.split(' · ')[0]) + ': ' + body;
      if (who.guard) {
        const subs = (await zcql.executeZCQLQuery(`SELECT ROWID, subscription_json, device, agency_id FROM SupervisorSubs WHERE branch_id = ${who.branch}`))
          .map(r => r.SupervisorSubs).filter(s => !s.agency_id || String(s.agency_id) === who.agency);
        await sendPushToRows(catalystApp, 'SupervisorSubs', subs, { title, body: text, url: 'index.html#supervisor/group', tag: 'group-' + who.agency });
        return;
      }
      const team = (await zcql.executeZCQLQuery(`SELECT ROWID FROM Guards WHERE branch_id = ${who.branch} AND agency_id = ${who.agency} AND is_active = 'true' LIMIT 0, 300`)).map(r => String(r.Guards.ROWID));
      if (!team.length) return;
      const subs = (await zcql.executeZCQLQuery(`SELECT ROWID, subscription_json, device FROM PushSubscriptions WHERE guard_id IN (${team.join(', ')}) LIMIT 0, 300`)).map(r => r.PushSubscriptions);
      // The guard's own phone turns "#group" into his group page (main.jsx keeps his link).
      await sendPushToRows(catalystApp, 'PushSubscriptions', subs, { title, body: text, url: 'index.html#group', tag: 'group-' + who.agency });
    } catch (err) {
      console.error('Group push failed:', err);
    }
  }

  async function save(catalystApp, who, row) {
    return catalystApp.datastore().table('GroupMessages').insertRow({
      branch_id: who.branch, agency_id: who.agency, guard_id: who.guard ? who.guard.ROWID : null,
      author_name: who.guard ? '' : who.name, ...row
    });
  }

  for (const path of ['/groupChat', '/supGroup']) {
    app.get(path, async (req, res) => {
      try {
        const catalystApp = catalyst.initialize(req, { scope: 'admin' });
        const zcql = catalystApp.zcql();
        const who = await whoIs(req, zcql);
        res.status(200).json({ status: 'success', data: await chat(req, zcql, who) });
      } catch (err) {
        fail(res, err);
      }
    });
  }

  for (const path of ['/groupSend', '/supGroupSend']) {
    app.post(path, async (req, res) => {
      try {
        const catalystApp = catalyst.initialize(req, { scope: 'admin' });
        const zcql = catalystApp.zcql();
        const who = await whoIs(req, zcql);
        const text = cleanText(req.body.text, 'Message', MAX_TEXT, true);
        const saved = await save(catalystApp, who, { kind: 'text', text, ...(await replyOf(zcql, who, req.body.reply_to)) });
        await tell(catalystApp, zcql, who, text);
        res.status(200).json({ status: 'success', data: { ROWID: saved.ROWID } });
      } catch (err) {
        fail(res, err);
      }
    });
  }

  for (const path of ['/groupMedia', '/supGroupMedia']) {
    app.post(path, express.raw({ type: () => true, limit: '26mb' }), async (req, res) => {
      try {
        const catalystApp = catalyst.initialize(req, { scope: 'admin' });
        const zcql = catalystApp.zcql();
        const who = await whoIs(req, zcql);
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
        const key = 'group/' + who.branch + '-' + who.agency + '/' + nowStamp().slice(0, 10) + '/' + crypto.randomBytes(8).toString('hex') + '.' + ext;
        await catalystApp.stratus().bucket(MEDIA_BUCKET).putObject(key, body, { contentType: type });
        const saved = await save(catalystApp, who, { kind, text: '', media_key: key, media_source: source, duration, ...(await replyOf(zcql, who, req.query.reply_to)) });
        await tell(catalystApp, zcql, who, mediaLabel(kind));
        res.status(200).json({ status: 'success', data: { ROWID: saved.ROWID } });
      } catch (err) {
        fail(res, err);
      }
    });
  }
};
