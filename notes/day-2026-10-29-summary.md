# Day summary: 29 Oct 2026 (Thursday)

Time: 09:29 → 02:37 next day (breaks not logged). Branch: `post-handover`. Mode: build now, Prem tests at the Cumbum gate.
Main topics: Cumbum QR attendance fixes from real guards, attendance page, IPF November roster from a PDF.

## What we did

| # | Work | Result |
|---|---|---|
| 1 | New Registration bug | A typed ID no longer blocks a first-time registration |
| 2 | Guards list | Photo column right after S.No |
| 3 | Eyes-closed check explained | Live person check: a photo cannot close its eyes |
| 4 | Blink failing for one guard | Beep + 3 eyes-closed shots, the first shut one counts |
| 5 | Check before the camera | ID, full name and phone (last 4) must match before any photo |
| 6 | Dark photo | "Too dark" stops before the eye check; white glow round the camera |
| 7 | Reliever after a guard is placed | OUT lock skips the photo once a reliever is added (wait pass) |
| 8 | Group name | "Cumbum ISI" (ISI works in more than one branch) |
| 9 | Duty page back button | ← no longer returns to IN / OUT; only a new scan opens it |
| 10 | Reliever after OUT | No team group button for a reliever who is OUT |
| 11 | Attendances page | Same headings as the agency report, all states / cities / branches / agencies, sticky columns, Excel |
| 12 | Absent rule | Absent only after shift start + 15 min; relievers not listed |
| 13 | Live board | Date picker; Shift C counts the escort team |
| 14 | IPF November roster | PDF → Excel, 4 incharges, escort team list, team per month (`MonthRoster.team`) |
| 15 | Serial number gaps | Fixed: autofill uses this month's team, not the old guard area |

## Errors and how they were found

| Error | Cause | Fix |
|---|---|---|
| "ID has no registered face here" on New Registration | Typed ID used as a face filter | Ignored for registration |
| Blink not seen (ratio about 1.0) | Guard closed eyes late, dim light | Beep + 3 shots, light check |
| Wrong phone still reached the camera | Checked only with the photo | `/qrRegCheck` before the camera |
| Page cut off | Table too wide | Full width + sticky columns |
| Absent before the shift began | No start-time rule | Start + 15 min |
| A guard missing from the roster reader | `/^VEN/` filter too wide | `/^VEN-/` |

## Honest rating

| Area | Rating | Why |
|---|---|---|
| Concept | 9/10 | Saw real gate problems (phone, light, back button) and asked for the right rule |
| Debugging | 9/10 | Tested on two phones, sent clear screenshots |
| Recall | 7/10 | No quiz today |
| Typing | 7/10 | Long messages typed fast, some spelling slips |
| Effort | 10/10 | Worked past 2 a.m. |
| Overall | 8.5/10 | QR attendance is now ready for real guards |
