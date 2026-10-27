# Day summary: 27 Oct 2026 (Tuesday)

Time: 09:17 → 00:21. Branch: `post-handover`. Mode: build now (Claude builds, Prem tests in the app).
Main topics: menu and icon, Today as the first page, ISI October roster from the agency's own file,
✎ Fill month, roster order (`sort_no`), upload tests.

## What we did

| # | Work | Result |
|---|---|---|
| 1 | App icon | Shield ✔ kept, orange background, old blue shield colour |
| 2 | Menu | Daily: Schedule, Today, Chats + one **More** (folds open Escort, Vehicles, Report, History, Setup); no 1 2 3 numbers; line icons on colour tiles |
| 3 | First page | Every office login opens on **Today**; green **● Live** button inside Today (Live left the menu) |
| 4 | Branch name | Spelling fixed to Estancia (data only) |
| 5 | Guard post page | Full post name on two lines; On duty pill moved under it |
| 6 | Phone bar | Orange under the chat box removed (manifest background white) |
| 7 | ISI schedule 27 Oct | Found why 28 slots were empty: 13 week offs, 7 people not in the app, 8 post shifts not in the photo |
| 8 | ISI October roster | Agency's own file: reader now takes IDs without leading 0, "OFF", and rows with a wrong ID; 6 new guards created, 1 ID fixed, 11 guards not in the file made inactive |
| 9 | Shift incharges | Not in the agency file; G-shift incharge fixed G (Sunday off), the other 6 rotate A/B/C weekly with one General cover |
| 10 | ✎ Fill month | New: week off + one shift per week, or copy another guard; tap a preview day to change one day |
| 11 | Box tap | Saves at once; green ring shows it was saved |
| 12 | List order | New column `MonthRoster.sort_no` (Prem's OK): the file's order; new guards at the end |
| 13 | Tests by Prem | Unknown person → "Not found"; after creating the guard → found (130); re-upload = no change |
| 14 | Guard IDs | 024187 and 24187 now count as the same ID (no duplicate by a missing 0) |

## Errors and how they were found

| Error | Cause | Fix |
|---|---|---|
| Real names in a commit / comments | I used guard names as examples | Blocked before push; made-up examples instead |
| Roster list out of file order | Catalyst ROWIDs are not in insert order | `sort_no` column |
| Two rows with one ID in the agency file | Typing mistakes in the file | Name decides when it names another guard |
| Orange under the chat box | Manifest background colour | White |

## Honest rating

| Area | Rating | Why |
|---|---|---|
| Concept | 9/10 | Understood "no guard → no roster → no post" and why upload overwrites taps |
| Debugging | 8/10 | Spotted the wrong order and the missing incharges from the screen |
| Recall | 7/10 | Guessed 130 found / VACANT not found correctly |
| Typing | 7/10 | Test file and test guards made by hand |
| Effort | 9/10 | Very long day |
| Overall | 8.5/10 | ISI October roster is ready and the supervisor flow is clear |

## Next

1. Make the two test guards inactive.
2. ISI daily schedule (28 Oct) from the new roster; ISI post rules from the ISI supervisor.
3. Maybe: warning before an upload overwrites changes made in the app.
4. Pending: device lock, monthly teams, profile photo, Build 4–7, sales demo.
