# Day summary: 28 Oct 2026 (Wednesday)

Time: 10:00 → about 18:25 (lunch 14:00). Branch: `post-handover`. Mode: build now, Prem tests every step in the app.
Main topics: schedule made by the supervisor himself (posts, order, guards), BSS set up as a test agency,
warnings before mistakes, guard tags, a tidier schedule page.

## What we did

| # | Work | Result |
|---|---|---|
| 1 | Recall quiz | 3 / 3 (121 slots = each post's shift codes, G too) |
| 2 | Copy from yesterday | Follows the month roster: a guard now off / on leave / on another shift is not copied |
| 3 | 300-row limit | Supervisor reads page through all rows (Estancia has IPF + ISI rosters) |
| 4 | Post order | "5 · Place on the sheet" (top / after a post) in the post form; ▲ ▼ tried and taken out (Prem) |
| 5 | Delete a post | 🗑️ only for a switched-off post that was never used; used posts stay off |
| 6 | ➕ Add post on the schedule | Make a post on the sheet itself, then tap + to put a guard |
| 7 | BSS test agency | 15 test guards, October roster Excel, 6 posts, 28 Oct sheet; full flow works |
| 8 | ⚠️ Roster mismatch | Sheet shows ⚠️ B / OFF / LEAVE when the roster changed after the guard was placed |
| 9 | Publish warning | Publish names the ⚠️ drafts and asks first |
| 10 | Day in numbers | Guards, on duty by shift, week off, leave, allotted, free, vacant, absent (card IN); tap for names |
| 11 | Month roster 🖨️ Print | A4 landscape, all days on one width |
| 12 | Guard tags | New column `Guards.tags` (Prem's OK): Lady, Document …; chips in roster and guard picker; 22 ISI lady guards tagged from the agency file |
| 13 | Who is signed in | Name and role under the menu button and as a chip on the schedule |
| 14 | Schedule toolbar | Copy + Publish outside, the rest in ⋯ More (Clear day in red, last) |
| 15 | Template / Upload | Explained (roster = when, schedule = where) and tested on BSS: works as expected |

## Errors and how they were found

| Error | Cause | Fix |
|---|---|---|
| Roster change did not move the guard on the sheet | By design (the sheet is the supervisor's choice) | ⚠️ on the sheet + publish warning |
| ▲ ▼ hidden for a supervisor | "All branches (1)" counted as all | Shown for one branch (later taken out) |
| "⭐ only (14)" for an ISI login | Counted every agency's incharges | Counts the guards on the page |
| Login not known on the page | Only initials "IS" | Name + role shown |

## Honest rating

| Area | Rating | Why |
|---|---|---|
| Concept | 9/10 | Asked the right questions: login on each page, roster vs schedule, who may change what |
| Debugging | 9/10 | Found the roster-change gap by testing it himself |
| Recall | 9/10 | Quiz 3 / 3 after a hint |
| Typing | 7/10 | Test posts and Excel edits by hand |
| Effort | 9/10 | Tested every feature the same day |
| Overall | 8.5/10 | Schedule is now something a supervisor can build alone |

## Next

1. Clean the test data (BSS test guards, test guards, test posts, one IPF roster change).
2. Manager demo script.
3. ISI daily schedule (empty slots), ISI rules from the ISI supervisor.
4. Roster upload warning before an Excel overwrites app changes.
