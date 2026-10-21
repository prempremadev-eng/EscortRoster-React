
export const PAGE_SIZE = 15;
export const PICKUP_ROWS = 10;
export const PICKUP_ROUTES = 2;

// Night duty runs from evening to next morning (e.g. Fri 21:00 → Sat 08:00).
// Until this hour the app still opens the PREVIOUS day's sheet.
export const SHIFT_END_HOUR = 8;

// Date of the duty that is running now, as YYYY-MM-DD in local time
// (not UTC — toISOString() gives yesterday's date before 5:30 AM in India).
// Exception: on Sunday morning stay on Sunday — Saturday is leave, so no night duty is running
// and the Sunday pickup sheet must open.
export function dutyDayStr() {
  const d = new Date();
  if (d.getHours() < SHIFT_END_HOUR && d.getDay() !== 0) d.setDate(d.getDate() - 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// Sort key for HH:MM inside one night shift: 00:15 comes after 23:40.
export function shiftMinutes(time) {
  const [h, m] = String(time || '').split(':').map(n => parseInt(n) || 0);
  return (h < SHIFT_END_HOUR ? h + 24 : h) * 60 + m;
}

function dayOf(dateStr) {
  if (!dateStr) return -1;
  return new Date(dateStr + 'T00:00:00').getDay();
}
export const isSunday = d => dayOf(d) === 0;
export const isMonday = d => dayOf(d) === 1;
export const isSaturday = d => dayOf(d) === 6;

// Same date look as the Schedule page: "Wed 21 Oct" on screen, "21-10-2026 · Wednesday" on the sheet.
export const shortDate = dateStr => dateStr ? new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '';
export const sheetDate = dateStr => dateStr ? dateStr.split('-').reverse().join('-') + ' · ' + new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long' }) : '';
export function plusDay(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function formatLongDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

// Fixed: 4 Route columns, and every duty day each escort moves 4 seats down.
// (Was an editable box; one stray tap re-ordered every seat, so it is locked.)
export const ROTATION = 4;

// Duty days from start to duty date. Saturday (leave) and Sunday (pickup) don't
// count, so Friday → Monday moves the seats once, not three times.
function dutyDaysBetween(start, duty) {
  const sign = duty < start ? -1 : 1;
  const d = new Date(sign > 0 ? start : duty);
  const end = sign > 0 ? duty : start;
  let count = 0;
  while (d < end) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return sign * count;
}

// Seat rotation: first 10 escorts rotate among themselves, the rest rotate in a second group.
export function computeDisplayRows(baseRows, rotation, startVal, dutyVal) {
  if (!startVal || !dutyVal || baseRows.length === 0) return baseRows.slice();
  const start = new Date(startVal + 'T00:00:00');
  const duty = new Date(dutyVal + 'T00:00:00');
  if (isNaN(start.getTime()) || isNaN(duty.getTime())) return baseRows.slice();
  const daysDiff = dutyDaysBetween(start, duty);
  const g1Size = Math.min(10, baseRows.length);
  const group1 = baseRows.slice(0, g1Size);
  const group2 = baseRows.slice(g1Size);
  const g2Size = group2.length;
  const shift1 = g1Size > 0 ? (((rotation * daysDiff) % g1Size) + g1Size) % g1Size : 0;
  const shift2 = g2Size > 0 ? (((rotation * daysDiff) % g2Size) + g2Size) % g2Size : 0;
  const displayed1 = new Array(g1Size);
  for (let i = 0; i < g1Size; i++) displayed1[(i + shift1) % g1Size] = group1[i];
  const displayed2 = new Array(g2Size);
  for (let i = 0; i < g2Size; i++) displayed2[(i + shift2) % g2Size] = group2[i];
  return displayed1.concat(displayed2);
}

export function routeStatusClass(out, inn) {
  if (out && inn) return 'route-complete';
  if (out) return 'route-pending';
  return '';
}

// Route N is editable only after route N-1 has both Out and In.
export function routeLocks(routes, idx) {
  const rec = routes[idx] || {};
  let enabled = true;
  if (idx > 0) {
    const prev = routes[idx - 1] || {};
    enabled = !!((prev.out || '').trim() && (prev.in || '').trim());
  }
  const hasLoc = !!(rec.loc || '').trim();
  const hasOut = !!(rec.out || '').trim();
  return {
    locDisabled: !enabled,
    outDisabled: !enabled || !hasLoc,
    inDisabled: !enabled || !hasLoc || !hasOut
  };
}

export const escortFromDb = e => ({
  ROWID: e.ROWID,
  name: e.escort_name || '',
  agency: e.agency || '',
  mobile: e.mobile || '',
  id: e.id_no || '',
  // Month Roster days: today's seat and list (6 to 5 / 9 to 6), already in seat order.
  seat: e.seat ? Number(e.seat) : null,
  batch: e.batch || ''
});

export const routeFromDb = rec => ({
  ROWID: rec.ROWID,
  loc: rec.location || '',
  out: rec.out_time || '',
  in: rec.in_time || '',
  vehicle: rec.vehicle_no || '',
  driver: rec.driver_name || ''
});

export const stopFromDb = s => ({
  ROWID: s.ROWID,
  emp: s.emp_id || '',
  loc: s.location || '',
  type: s.trip_type || '',
  time: s.stop_time || ''
});

// TripStops rows for a day, grouped by the trip (DutyRecords ROWID) they belong to.
export function groupStops(rows) {
  const map = {};
  rows.forEach(s => {
    const key = String(s.duty_record_id);
    (map[key] = map[key] || []).push(stopFromDb(s));
  });
  return map;
}

// A trip's paperwork is complete when the cab is noted and at least one employee is logged.
// (Every stop is saved with all four fields, so stop rows are never half filled.)
export function isTripComplete(rec, stops) {
  return !!((rec.vehicle || '').trim() && (rec.driver || '').trim() && stops.length > 0);
}

export function nowTime() {
  const d = new Date();
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

export const blankPickup = () => ({ name: '', agency: '', mobile: '', id: '', remarks: '', loc: '', out: '', in: '' });

// Reads the first sheet of an .xlsx/.xls/.csv file into escort rows.
export async function readEscortFile(file) {
  // SheetJS is big, so it is only downloaded when someone actually uploads a file.
  const XLSX = await import('xlsx');
  const data = new Uint8Array(await file.arrayBuffer());
  const wb = XLSX.read(data, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  return json.map(row => {
    const get = keys => {
      for (const k of keys) {
        const found = Object.keys(row).find(rk => rk.toLowerCase().replace(/[^a-z]/g, '') === k);
        if (found) return String(row[found]);
      }
      return '';
    };
    return {
      name: get(['nameofescort', 'name', 'escortname']),
      agency: get(['agency']),
      mobile: get(['mobileno', 'mobile', 'phone']),
      id: get(['idno', 'id']),
      remarks: get(['remarks'])
    };
  }).filter(r => r.name || r.agency || r.mobile || r.id);
}
