# Day summary: 26 Oct 2026 (Monday)

Time: 10:37 → 22:28. Branch: `post-handover`. App name is now **GuardDesk**.
Main topics: app name, admin home fixes, escort Desktop view, ISI fresh start (guards, posts), learning mode back on.

## What we did

| # | Work | Result |
|---|---|---|
| 1 | App name | GuardDesk (tab, home screen, login, notifications); escort sheet keeps its own name |
| 2 | Escort sheet on a phone | 🖥️ Desktop view / 📱 Phone view toggle (guard sheet: on the Seat line) |
| 3 | 👥 Group button | Moved into the escort bar and the post ⋮ menu (no more floating over rows) |
| 4 | Admin home | KPI boxes open the guard list (present / absent / leave / week off); roster fallback per branch + agency |
| 5 | Device lock | Discussed and agreed; saved as pending (one phone per guard link, on/off switch, Reset phone) |
| 6 | ISI fresh start | Dummy ISI guards, roster, posts deleted |
| 7 | ISI guards | Prem created 10 by hand; 131 more from the agency's July duty statement (141 total, 7 shift incharges ⭐) |
| 8 | ISI posts | Prem created 10 by hand; 32 more from the agency's day schedule photo (42 total) |
| 9 | Guard form for a shift incharge | No agency picking; branch fixed; "Team / area (optional)" |
| 10 | Guard names | Unique per agency (not app-wide); ID and card unique everywhere |
| 11 | Roster upload | Matches any ID / card format (not only P12345) |
| 12 | Learning | From the Month Roster upload onwards, Prem learns the code (Lesson 1 given) |

## Errors and how they were found

| Error | Cause | Fix |
|---|---|---|
| Strength allotted too low for ISI | Fallback checked "branch has a schedule", IPF's schedule hid ISI | Check per branch + agency |
| "Already has this name" across agencies | Name check was app-wide (and showed another agency's guard) | Per agency |
| Desktop view button not found | It was only on the office escort page | Also on the guard's escort sheet |

## Honest rating

| Area | Rating | Why |
|---|---|---|
| Concept | 9/10 | Saw that teams rotate monthly and that agencies must not mix |
| Debugging | 8/10 | Compared the schedule page with Home and found the 16 vs 18 reason |
| Recall | — | Lesson 1 guesses still open |
| Typing | 7/10 | 10 guards and 10 posts created by hand |
| Effort | 9/10 | Long day, steady |
| Overall | 8.5/10 | ISI is ready for its October roster |

## Next

1. Lesson 1 answers (codes[25]), then Lesson 2: `readRoster`.
2. ISI October roster (shift from the day photo, week off from the July statement) → upload → schedule → publish.
3. Pending: device lock, monthly teams from the roster, profile photo, Build 4–7.
