"use strict"

/* ---------------- SITE REPORTS (parking + employee strength, Prem 5 Nov) ---------------- */
// The counts the guards used to type in the WhatsApp group at fixed times, now a form per post:
//   parking reports (MLCP car, MLCP two wheeler, Lancor vendor)  11:00 · 15:00 · 23:00 every day
//   employee strength (North Plaza, Apricot, MLCP reception)     23:00 · 03:00 (Sat / Sun also 11:00 · 15:00)
// A post sends one kind (Posts.report_type, set on Post setup like Vehicle entry). One row per post,
// date and slot in ShiftReports; sending the slot again replaces it. The 03:00 slot belongs to the
// night before (shiftDate turns at 04:00). Totals are counted here, not typed.

const PARKING_SLOTS = ['11:00', '15:00', '23:00'];
const MLCP_FLOORS = ['T "A"', 'T', '12A', '12th', '11A', '11th', '10A', '10th', '09A', '09th', '08A', '08th', '07A', '07th',
  '06A', '06th', '05A', '05th', '04A', '04th', '03A', '03rd', '02A', '02nd', '01A'];

// sections: [title, [[key, label, tag]]]; totals: [label, tag] (sum of the fields with that tag);
// the first total is the headline number (ShiftReports.total).
const TYPES = {
  mlcp_car: {
    label: 'MLCP Car Parking', icon: '🚗', slots: () => PARKING_SLOTS,
    sections: [
      ['Floors', MLCP_FLOORS.map((f, i) => ['f' + i, f + ' floor', 'floor'])],
      ['Outside', [['outer', 'Outer side parking', 'outer']]]
    ],
    totals: [['Total cars', ['floor', 'outer']], ['Floor cars', ['floor']]]
  },
  mlcp_two: {
    label: 'MLCP Two Wheeler Parking', icon: '🛵', slots: () => PARKING_SLOTS,
    sections: ['Basement 01', 'Basement 02'].map((b, i) => [b, [['b' + i + 'bike', 'Emp bikes', 'bike'], ['b' + i + 'cycle', 'Emp cycles', 'cycle'], ['b' + i + 'halt', 'Halt bikes', 'halt']]]),
    totals: [['Total bikes', ['bike']], ['Total emp cycles', ['cycle']], ['Total halt bikes', ['halt']]]
  },
  lancor: {
    label: 'Lancor Vendor Bike & Car Parking', icon: '🚙', slots: () => PARKING_SLOTS,
    sections: [
      ['Parking (cars)', [['p1', 'Parking 01', 'car'], ['p2', 'Parking 02', 'car']]],
      ['Ground parking', [['ecar', 'EMP cars', 'car'], ['ebike', 'EMP bikes', 'bike'], ['vcar', 'Vendor car', 'car'], ['vauto', 'Vendor auto', 'auto'], ['vbike', 'Vendor bikes', 'bike'], ['vcycle', 'Vendor cycle', 'cycle']]]
    ],
    totals: [['Total cars', ['car']], ['Total bikes', ['bike']]]
  },
  emp_strength: {
    label: 'Employee Strength', icon: '👥',
    // Weekdays only the night; Saturday / Sunday the day too (Prem, 5 Nov).
    slots: date => { const d = new Date(date + 'T00:00:00Z').getUTCDay(); return d === 0 || d === 6 ? ['11:00', '15:00', '23:00', '03:00'] : ['23:00', '03:00']; },
    // Prem, 5 Nov: "Male = 01, Female = 05, below Total = 10".
    sections: [['Employees', [['male', 'Male', 'emp'], ['female', 'Female', 'emp']]]],
    totals: [['Total', ['emp']]],
    texts: [['safety', 'Safety officer']]
  }
};
const LATE_MIN = 30;

module.exports = function siteReportRoutes(app, h) {
  const { catalyst, selectAll, requireRowId, requireDate, fail, nowStamp, hhmm, cleanText, onDutyLog, shiftDate, auth, addMessage,
    sendPushToGuard, getSetting, notifySupervisors, postToGroup } = h;

  const typeOf = key => TYPES[String(key || '')] || null;
  const form = t => ({ label: t.label, icon: t.icon, sections: t.sections.map(([title, fields]) => ({ title, fields: fields.map(([k, label, tag]) => ({ k, label, tag })) })), totals: t.totals.map(([label, tags]) => ({ label, tags })), texts: (t.texts || []).map(([k, label]) => ({ k, label })) });

  function totalsOf(t, values) {
    const tagOf = {};
    t.sections.forEach(([, fields]) => fields.forEach(([k, , tag]) => { tagOf[k] = tag; }));
    return t.totals.map(([label, tags]) => [label, Object.keys(values).reduce((n, k) => n + (tags.includes(tagOf[k]) ? values[k] : 0), 0)]);
  }

  // Minutes from the report date's 00:00 (03:00 is the next morning).
  const slotMin = slot => { const [hh, mm] = slot.split(':').map(Number); return (hh < 4 ? 24 + hh : hh) * 60 + mm; };
  function nowMinOn(date) {
    const [d, t] = nowStamp().split(' ');
    const days = Math.round((Date.parse(d + 'T00:00:00Z') - Date.parse(date + 'T00:00:00Z')) / 86400000);
    const [hh, mm] = t.split(':').map(Number);
    return days * 1440 + hh * 60 + mm;
  }
  function slotState(date, slot, row) {
    const due = slotMin(slot);
    if (row) return slotMin(row.sent_time || slot) > due + LATE_MIN ? 'late' : 'sent';
    const now = nowMinOn(date);
    return now > due + LATE_MIN ? 'missed' : now >= due - 60 ? 'due' : 'later';
  }

  // The WhatsApp style message (what the group used to get), posted on the post chat and the team group.
  // Prem, 5 Nov: in order, "Male emp = 01" (two digits at least), totals under a line.
  const two = n => String(n).padStart(2, '0');
  const niceDate = d => { const [y, m, dd] = d.split('-'); return dd + '-' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m - 1] + '-' + y; };
  function message(t, post, date, slot, values, texts, remarks, by) {
    const lines = [t.icon + ' ' + t.label.toUpperCase() + ' REPORT', '📍 ' + post, '📅 ' + niceDate(date) + ' · ⏰ ' + slot, '━━━━━━━━━━━━'];
    t.sections.forEach(([title, fields]) => {
      if (t.sections.length > 1) lines.push('▸ ' + title.toUpperCase());
      fields.forEach(([k, label]) => lines.push(label + ' = ' + two(values[k] || 0)));
      if (t.sections.length > 1) lines.push('');
    });
    if (lines[lines.length - 1] === '') lines.pop();
    lines.push('━━━━━━━━━━━━');
    totalsOf(t, values).forEach(([label, n]) => lines.push('🔢 ' + label + ' = ' + two(n)));
    (t.texts || []).forEach(([k, label]) => { if (texts[k]) lines.push('🦺 ' + label + ': ' + texts[k]); });
    lines.push('', '✅ ' + (remarks || 'All area rounds checked, everything normal.'), '', '👤 By ' + by);
    return lines.join('\n');
  }

  // Chat text: PostMessages / GroupMessages keep 255 letters (Prem, 5 Nov: the MLCP car report was cut
  // at "08A"). A short report goes in full; a long one as a summary with the totals, full report on the
  // Site reports page (and 📋 Copy on the guard's phone gives the full WhatsApp text).
  function chatText(full, t, post, date, slot, values, texts, remarks, by) {
    if (full.length <= 250) return full;
    const lines = [t.icon + ' ' + t.label.toUpperCase() + ' REPORT', '📍 ' + post + ' · ' + niceDate(date).slice(0, 6) + ' · ⏰ ' + slot,
      ...totalsOf(t, values).map(([label, n]) => '🔢 ' + label + ' = ' + two(n)),
      ...(t.texts || []).filter(([k]) => texts[k]).map(([k, label]) => '🦺 ' + label + ': ' + texts[k]),
      '✅ ' + (remarks || 'All normal'), '👤 ' + by, '📋 Full: Site reports'];
    let out = lines.join('\n');
    return out.length <= 255 ? out : out.slice(0, 252) + '…';
  }

  /* ---------- guard (post page → 📋 Report) ---------- */

  async function postRow(zcql, postId) {
    const rows = await zcql.executeZCQLQuery(`SELECT ROWID, post_name, branch_id, agency_id, report_type FROM Posts WHERE ROWID = ${requireRowId(postId)}`);
    if (!rows.length) throw new Error('Post not found.');
    const p = rows[0].Posts;
    if (!typeOf(p.report_type)) throw new Error('No report is set for ' + p.post_name + '.');
    return p;
  }

  async function dayRows(zcql, where, date) {
    return selectAll(zcql, 'ShiftReports', `SELECT * FROM ShiftReports WHERE ${where} AND report_date = '${date}' ORDER BY CREATEDTIME ASC`);
  }

  app.get('/siteReportForm', async (req, res) => {
    try {
      const zcql = catalyst.initialize(req, { scope: 'admin' }).zcql();
      const { me, log } = await onDutyLog(zcql, req.query.t, req.query.post, true);
      const post = await postRow(zcql, log.post_id);
      const t = typeOf(post.report_type);
      const date = shiftDate();
      const rows = await dayRows(zcql, `post_id = ${requireRowId(post.ROWID)}`, date);
      const slots = t.slots(date).map(slot => {
        const r = rows.filter(x => x.slot === slot).pop();
        return { slot, state: slotState(date, slot, r), sent: r ? { by: r.guard_name, time: r.sent_time, total: r.total, values: JSON.parse(r.values_json || '{}'), remarks: r.remarks || '' } : null };
      });
      // The slot to fill: the first one due or missed and not sent, else the next one.
      const pick = (slots.find(s => !s.sent && (s.state === 'due' || s.state === 'missed')) || slots.find(s => !s.sent) || slots[slots.length - 1]).slot;
      res.status(200).json({ status: 'success', data: { post: post.post_name, type: post.report_type, form: form(t), date, slots, pick, guard: me.guard_name } });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post('/siteReportSend', async (req, res) => {
    try {
      const catalystApp = catalyst.initialize(req, { scope: 'admin' });
      const zcql = catalystApp.zcql();
      const b = req.body || {};
      const { me, log } = await onDutyLog(zcql, b.t, b.post, true);
      const post = await postRow(zcql, log.post_id);
      const t = typeOf(post.report_type);
      const date = shiftDate();
      const slot = String(b.slot || '');
      if (!t.slots(date).includes(slot)) throw new Error('Pick the report time.');
      const values = {};
      t.sections.forEach(([, fields]) => fields.forEach(([k, label]) => {
        const n = Number(String((b.values || {})[k] ?? '').trim() || 0);
        if (!Number.isInteger(n) || n < 0 || n > 100000) throw new Error(label + ': type a number.');
        values[k] = n;
      }));
      const texts = {};
      (t.texts || []).forEach(([k, label]) => { texts[k] = cleanText((b.texts || {})[k], label, 100, false) || ''; });
      const remarks = cleanText(b.remarks, 'Remarks', 1000, false) || '';
      const totals = totalsOf(t, values);
      const now = nowStamp();
      const row = {
        report_date: date, slot, report_type: post.report_type, post_id: post.ROWID, branch_id: post.branch_id, agency_id: post.agency_id,
        guard_id: me.ROWID, guard_name: me.guard_name, values_json: JSON.stringify({ ...values, ...texts }), total: totals[0][1], remarks, sent_time: hhmm(now)
      };
      const table = catalystApp.datastore().table('ShiftReports');
      const old = (await dayRows(zcql, `post_id = ${requireRowId(post.ROWID)} AND slot = '${slot}'`, date)).pop();
      const saved = old ? await table.updateRow({ ROWID: old.ROWID, ...row }) : await table.insertRow(row);
      const text = message(t, post.post_name, date, slot, values, texts, remarks, me.guard_name);
      const short = chatText((old ? '(updated) ' : '') + text, t, post.post_name, date, slot, values, texts, remarks, me.guard_name);
      try {
        await addMessage(catalystApp, { post_id: post.ROWID, duty_log_id: log.ROWID, guard_id: me.ROWID, kind: 'text', text: short });
      } catch (err) {
        console.error('Report chat message failed:', err);
      }
      try {
        await postToGroup(catalystApp, me, short);
      } catch (err) {
        console.error('Report group message failed:', err);
      }
      res.status(200).json({ status: 'success', data: { ROWID: saved.ROWID, text, totals } });
    } catch (err) {
      fail(res, err);
    }
  });

  /* ---------- office (📋 Site reports page) ---------- */

  // One day: every report post of the area with its slots (sent / late / missed / due / later).
  // With from + to: the sent reports of that range (history, Excel).
  app.get('/siteReports', async (req, res) => {
    try {
      const zcql = catalyst.initialize(req, { scope: 'admin' }).zcql();
      const branches = (await auth.branchList(zcql)).filter(b => b.is_active === 'true' && auth.branchOk(req, b.ROWID));
      const branchName = {};
      branches.forEach(b => { branchName[String(b.ROWID)] = b.branch_name; });
      const ids = branches.map(b => requireRowId(b.ROWID));
      const posts = ids.length ? auth.inArea(req, await selectAll(zcql, 'Posts', `SELECT ROWID, post_name, branch_id, agency_id, report_type, is_active FROM Posts WHERE branch_id IN (${ids.join(', ')}) ORDER BY post_name ASC`))
        .filter(p => typeOf(p.report_type) && p.is_active !== 'false') : [];
      const postIds = posts.map(p => requireRowId(p.ROWID));
      const types = {};
      Object.keys(TYPES).forEach(k => { types[k] = form(TYPES[k]); });
      const from = requireDate(req.query.from || req.query.date || shiftDate());
      const to = requireDate(req.query.to || from);
      const rows = postIds.length
        ? await selectAll(zcql, 'ShiftReports', `SELECT * FROM ShiftReports WHERE post_id IN (${postIds.join(', ')}) AND report_date >= '${from}' AND report_date <= '${to}' ORDER BY CREATEDTIME ASC`)
        : [];
      const view = r => ({ ROWID: r.ROWID, date: r.report_date, slot: r.slot, post: String(r.post_id), by: r.guard_name, time: r.sent_time, total: r.total, values: JSON.parse(r.values_json || '{}'), remarks: r.remarks || '', totals: typeOf(r.report_type) ? totalsOf(typeOf(r.report_type), JSON.parse(r.values_json || '{}')) : [] });
      const list = posts.map(p => {
        const t = typeOf(p.report_type);
        const mine = rows.filter(r => String(r.post_id) === String(p.ROWID));
        return {
          id: String(p.ROWID), name: p.post_name, branch: branchName[String(p.branch_id)] || '', type: p.report_type,
          // Day view: the slots of `from` with their state.
          slots: t.slots(from).map(slot => {
            const r = mine.filter(x => x.report_date === from && x.slot === slot).pop();
            return { slot, state: slotState(from, slot, r), report: r ? view(r) : null };
          })
        };
      });
      res.status(200).json({ status: 'success', data: { from, to, today: shiftDate(), types, posts: list, reports: rows.map(view) } });
    } catch (err) {
      fail(res, err);
    }
  });

  /* ---------- reminders (Job Scheduling cron, Prem 5 Nov) ---------- */
  // Cron "0,30 3,11,15,23 * * *" calls /siteReportRemind?key=<Settings qr_cron_key>.
  //   at the report time (:00–:10)  → the guard on duty at each report post that has not sent it: 📋 push
  //   30 min later (:30–:40)        → still not sent: the guard again (urgent) and the office (missed)
  app.get('/siteReportRemind', async (req, res) => {
    try {
      const catalystApp = catalyst.initialize(req, { scope: 'admin' });
      const zcql = catalystApp.zcql();
      const key = await getSetting(zcql, 'qr_cron_key');
      if (!key || !key.setting_value || String(req.query.key || '') !== key.setting_value) throw new Error('Not allowed.');
      const date = shiftDate();
      const now = nowMinOn(date);
      const posts = (await selectAll(zcql, 'Posts', "SELECT ROWID, post_name, report_type, is_active FROM Posts WHERE report_type IS NOT NULL ORDER BY ROWID ASC"))
        .filter(p => typeOf(p.report_type) && p.is_active !== 'false');
      const told = [];
      for (const p of posts) {
        const t = typeOf(p.report_type);
        for (const slot of t.slots(date)) {
          const since = now - slotMin(slot);
          const missed = since >= LATE_MIN && since < LATE_MIN + 10;
          if (!(since >= 0 && since < 10) && !missed) continue;
          const done = await dayRows(zcql, `post_id = ${requireRowId(p.ROWID)} AND slot = '${slot}'`, date);
          if (done.length) continue;
          // Guards on this post now (today's or last night's duty still running).
          const logs = (await zcql.executeZCQLQuery(`SELECT guard_id FROM DutyLog WHERE post_id = ${requireRowId(p.ROWID)} AND (status = 'on_duty' OR status = 'on_break') ORDER BY CREATEDTIME DESC LIMIT 5`)).map(r => r.DutyLog);
          for (const l of logs) {
            try {
              const g = (await zcql.executeZCQLQuery(`SELECT ROWID, guard_token FROM Guards WHERE ROWID = ${requireRowId(l.guard_id)}`))[0];
              await sendPushToGuard(catalystApp, l.guard_id, {
                title: (missed ? '🔴 ' : '📋 ') + slot + ' ' + t.label + ' report' + (missed ? ' not sent' : ''),
                body: missed ? 'Send it now: + → Site report.' : 'Report time. Open your post page: + → Site report.',
                url: g && g.Guards.guard_token ? 'index.html#guard/' + g.Guards.guard_token : 'index.html',
                urgent: missed, tag: 'report-' + p.ROWID + '-' + slot
              });
            } catch (err) {
              console.error('Report reminder push failed:', err);
            }
          }
          if (missed) await notifySupervisors(catalystApp, p.ROWID, '🔴 Report missed', p.post_name + ' · ' + slot + ' ' + t.label + ' not sent', true);
          told.push({ post: p.post_name, slot, missed, guards: logs.length });
        }
      }
      res.status(200).json({ status: 'success', data: { date, told } });
    } catch (err) {
      fail(res, err);
    }
  });

  return { TYPES };
};

module.exports.TYPE_KEYS = Object.keys(TYPES);
