// Seat rotation for the server (push message "Seat 5").
// COPY of computeDisplayRows() in frontend/src/utils.js: change both together,
// or the notification and the duty sheet will show different seats.

const ROTATION = 4;

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

function computeDisplayRows(baseRows, rotation, startVal, dutyVal) {
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

// Day of week of a YYYY-MM-DD string (0 = Sunday).
const dayOf = dateStr => new Date(dateStr + 'T00:00:00').getDay();

module.exports = { ROTATION, computeDisplayRows, dayOf };
