'use strict';

// Escort duty from the Month Roster (notes/ESCORT-RULES.md, E1–E10). For a weekday it gives:
//   6 to 5  = Escort-team guards whose coming Saturday AND Sunday are off (E1),
//   9 to 6  = the other Escort-team guards working C this week (E3),
// each list in Month Roster order (E2), turned 4 seats down per duty day (E5) from Day 0:
// the week's Monday (E6), or in a month's first week the first day the whole 6-to-5 list is on C (E7).
// Only those on C today do escort duty (E10); the others keep their seat number empty for the day (E9).
// S.No: 6 to 5 = 1 … n, then 9 to 6 carries on (n + 1 …).
// The duty sheet keys trips by Escorts ROWID, so each guard on duty gets an Escorts row the first
// time (linked by Guards.escort_id).

const ROTATION = 4;
// EscortDay.support_point of a guard the supervisor sent to escort for one day (any team): he goes
// to the end of 9 to 6, gets a seat, and his card IN / guard page work like any escort's.
const EXTRA = 'Extra 9 to 6';

const addDays = (date, n) => { const d = new Date(date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const weekday = date => new Date(date + 'T00:00:00Z').getUTCDay();
const isDutyDay = date => weekday(date) >= 1 && weekday(date) <= 5;

async function all(zcql, sql, table) {
  const rows = [];
  for (let off = 1; ; off += 300) {
    const page = (await zcql.executeZCQLQuery(`${sql} LIMIT ${off}, 300`)).map(r => r[table]);
    rows.push(...page);
    if (page.length < 300) return rows;
  }
}

// null on Saturday / Sunday or when the month has no roster with Escort-team guards (old sheet then).
async function escortDay(catalystApp, date) {
  if (!isDutyDay(date)) return null;
  const zcql = catalystApp.zcql();
  const monday = addDays(date, 1 - weekday(date));
  const sat = addDays(monday, 5), sun = addDays(monday, 6);
  const months = [...new Set([monday, date, sat, sun].map(d => d.slice(0, 7)))];
  const [guards, ...rosters] = await Promise.all([
    all(zcql, "SELECT ROWID, guard_name, id_number, phone, agency, escort_id FROM Guards WHERE is_active = 'true' AND area = 'Escort' ORDER BY ROWID ASC", 'Guards'),
    ...months.map(m => all(zcql, `SELECT ROWID, guard_id, codes FROM MonthRoster WHERE roster_month = '${m}' ORDER BY ROWID ASC`, 'MonthRoster'))
  ]);
  const codesOf = {};
  months.forEach((m, i) => { codesOf[m] = {}; rosters[i].forEach(r => { codesOf[m][String(r.guard_id)] = String(r.codes || ''); }); });
  const code = (id, d) => ((codesOf[d.slice(0, 7)] || {})[id] || '')[Number(d.slice(8, 10)) - 1] || '';

  // Roster order = upload order of this month's roster (the supervisor's Excel order).
  const byId = new Map(guards.map(g => [String(g.ROWID), g]));
  const thisMonth = rosters[months.indexOf(date.slice(0, 7))];
  const escorts = thisMonth.map(r => String(r.guard_id)).filter((id, i, a) => byId.has(id) && a.indexOf(id) === i);
  if (!escorts.length) return null;

  // E1: 6 to 5 = coming Saturday AND Sunday off. E1b (Prem, 25 Oct): when that Saturday or Sunday falls
  // in a month whose roster is not uploaded yet (last week of a month), the 6 to 5 list is the escorts with
  // the fewest 6-to-5 days so far this month, as many as last week's list, plus anyone tied at the end.
  const offBoth = mon => escorts.filter(id => code(id, addDays(mon, 5)) === 'O' && code(id, addDays(mon, 6)) === 'O');
  // The escorts' own roster for that month (another agency's roster for that month does not count).
  const hasRoster = d => escorts.some(id => (codesOf[d.slice(0, 7)] || {})[id]);
  let batch = offBoth(monday);
  if (!hasRoster(sat) || !hasRoster(sun)) batch = fewestNights(monday);

  function fewestNights(mon) {
    const first = date.slice(0, 8) + '01';
    const nights = {};
    escorts.forEach(id => { nights[id] = 0; });
    let lastSize = 0;
    for (let w = addDays(first, 1 - weekday(first)); w < mon; w = addDays(w, 7)) {
      const b = offBoth(w);
      let d0 = w;
      if (w < first) { d0 = first; for (let d = first; d <= addDays(w, 4); d = addDays(d, 1)) if (isDutyDay(d) && b.every(id => code(id, d) === 'C')) { d0 = d; break; } }
      for (let d = d0; d <= addDays(w, 4); d = addDays(d, 1)) if (isDutyDay(d)) b.forEach(id => { if (code(id, d) === 'C') nights[id]++; });
      lastSize = b.length;
    }
    const days = [0, 1, 2, 3, 4].map(i => addDays(mon, i));
    const onC = escorts.filter(id => days.some(d => code(id, d) === 'C'));
    const sorted = onC.slice().sort((a, b) => nights[a] - nights[b] || escorts.indexOf(a) - escorts.indexOf(b));
    const size = Math.min(sorted.length, lastSize || Math.round(onC.length / 4));
    if (!size) return [];
    const cut = nights[sorted[size - 1]];
    // Back in roster order (E2); ties at the end come too, so nobody equal is left out.
    return escorts.filter(id => sorted.indexOf(id) >= 0 && (sorted.indexOf(id) < size || nights[id] === cut));
  }
  // Day 0: Monday; a week that starts a new month begins on the first day the whole batch is on C.
  let day0 = monday;
  if (monday.slice(0, 7) !== date.slice(0, 7)) {
    const first = date.slice(0, 8) + '01';
    day0 = date;
    for (let d = first; d <= date; d = addDays(d, 1)) {
      if (isDutyDay(d) && batch.every(id => code(id, d) === 'C')) { day0 = d; break; }
    }
  }
  const friday = addDays(monday, 4);
  const weekDays = [];
  for (let d = day0; d <= friday; d = addDays(d, 1)) if (isDutyDay(d)) weekDays.push(d);
  const night = escorts.filter(id => !batch.includes(id) && weekDays.some(d => code(id, d) === 'C'));
  let turns = 0;
  for (let d = day0; d < date; d = addDays(d, 1)) if (isDutyDay(d)) turns++;

  // 9 to 6 numbers follow on after 6 to 5 (Prem, 21 Oct: like the sheet, 13, 14 …); each list turns on its own.
  const seatList = (ids, label, after) => ids.map((id, i) => ({
    guardId: id, guard: byId.get(id), batch: label, seat: after + ((i + ROTATION * turns) % ids.length) + 1,
    onDuty: code(id, date) === 'C', code: code(id, date)
  })).sort((a, b) => a.seat - b.seat);
  // 6 to 5 has as many rows as that week's Sat + Sun-off escorts (not a fixed 12, Prem 22 Oct: about 10 a
  // week with 40 escorts, 12 with 46–48), so 9 to 6 starts right after it.
  const rows = [...seatList(batch, '6 to 5', 0), ...seatList(night, '9 to 6', batch.length)];

  // Extra escorts for the day (Schedule page "→ Escort"), after the last 9 to 6 seat, in the order added.
  const extraIds = (await all(zcql, `SELECT guard_id FROM EscortDay WHERE sched_date = '${date}' AND support_point = '${EXTRA}' ORDER BY ROWID ASC`, 'EscortDay'))
    .map(x => String(x.guard_id)).filter((id, i, a) => a.indexOf(id) === i && !rows.some(r => r.guardId === id && r.onDuty));
  if (extraIds.length) {
    const extraGuards = await all(zcql, `SELECT ROWID, guard_name, id_number, phone, agency, escort_id FROM Guards WHERE ROWID IN (${extraIds.join(', ')}) ORDER BY ROWID ASC`, 'Guards');
    let last = Math.max(batch.length + night.length, ...rows.map(r => r.seat));
    extraIds.forEach(id => {
      const g = extraGuards.find(x => String(x.ROWID) === id);
      if (!g) return;
      const i = rows.findIndex(r => r.guardId === id);
      if (i >= 0) rows.splice(i, 1);
      rows.push({ guardId: id, guard: g, batch: '9 to 6', seat: ++last, onDuty: true, code: code(id, date), extra: true });
    });
  }

  // An Escorts row for everyone on duty today who has none yet.
  const missing = rows.filter(r => r.onDuty && !r.guard.escort_id);
  if (missing.length) {
    const escortsTable = catalystApp.datastore().table('Escorts');
    const guardsTable = catalystApp.datastore().table('Guards');
    for (const r of missing) {
      const made = await escortsTable.insertRow({
        escort_name: r.guard.guard_name, agency: r.guard.agency || '', mobile: r.guard.phone || '',
        id_no: r.guard.id_number || '', sort_order: 0, is_active: 'false'
      });
      await guardsTable.updateRow({ ROWID: r.guardId, escort_id: made.ROWID });
      r.guard.escort_id = made.ROWID;
    }
  }
  return { date, day0, turns, rows };
}

module.exports = { escortDay, isDutyDay, EXTRA };
