# Day summary: 4 Nov 2026 (Wednesday)

Time: 07:31 → 03:20 (5 Nov). Branches: `post-handover` (old project), `slate` (NightOwl, `~/Desktop/NightOwl`).
Main topics: G shift fix, escort count, owl splash, trip popup redesign, Post Escort, site reports
(parking + employee strength) with reminders, ERT incident report, Production deploy.

## What we did

| # | Work | Result |
|---|---|---|
| 1 | G shift guard "still on duty" after card OUT | Fixed (take over checks status and day); deployed to Production |
| 2 | Overall strength | Escort team's C guards (Mon–Fri cab) now count in the C shift |
| 3 | Monthly roster format | Excel / CSV with team headings; PDF upload: not now |
| 4 | Owl splash | A drawn owl sits with its back to us, turns its head 180° to look at us (like the video), tilts, blinks twice; 6 s; launch screen blue |
| 5 | Attendance | Heading "Employee No" |
| 6 | Trip popup (escort sheet) | Laptop card / phone bottom sheet, light colours, bigger text, ⋮ menu (Edit / Delete), vehicle number auto-formats to `TN 22 AB 2344`, same grid time picker |
| 7 | 🚕 Post Escort | A post guard takes a "Post Escort" break (cover or post empty), fills his own Extra row of the escort sheet on the phone; In time per trip by the guard; office sheet + dashboard show "👮 Post guard" |
| 8 | 📋 Site reports | Post setup → report type (MLCP car, MLCP two wheeler, Lancor vendor: 11 · 15 · 23; employee strength: 23 · 03, Sat/Sun also 11 · 15). Guard form with − / +, totals counted, sent to post chat + team group; office page: day slots ✅🟡🔴, history, graph, Excel |
| 9 | Reminders | Cron at 3, 11, 15, 23 o'clock (:00 remind, :30 missed alert to guard + office) |
| 10 | Long reports in chat | New `long_text` column: the whole report in one bubble |
| 11 | 🚑 ERT incident report | Type, severity, place, time, persons, what happened, action taken; urgent office alert; ERT tab with open / closed + Excel; card on the Today page with ▾ hide |
| 12 | Group button | Hidden on report forms and while typing |
| 13 | Production | Data Store (20 added, 0 changed, 0 deleted) + escortAPI via Console, Slate prod, Prod reminder cron |

## Errors and how they were found

| Error | Cause | Fix |
|---|---|---|
| Owl: only the eyes moved | Face slid inside a flat head | Head is its own 3D layer (front + back), whole head turns |
| Blink not seen | Owl left before the blink | Owl stays 6 s, two slow blinks |
| Trip popup cut on the phone (Driver box half) | Cards shrank inside the scrolling body | Cards keep their height; two fields per row |
| Post Escort page looked broken on the phone | Wide office table on a small screen | One card per trip |
| Post Escort routes said "Please sign in" | New guard routes not in the no-login list | Added to the guard list |
| MLCP car report cut at "08A" in chat | Chat text column holds 255 letters | Summary in `text`, full report in new `long_text` |
| "No report is set for ERT Booth" | The check knew only parking / strength types | ERT allowed |
| ERT entry not on the laptop | Incident after midnight has the next date; office looked at the duty day | Office also reads the next morning |
| Production schema by MCP refused | Production schema only through a deployment | Console Create Deployment with Data Store |
| Deployment first selected everything | All boxes ticked by default | Only Data Store + Functions; checked the diff (0 deleted) |

## Honest rating

| Area | Rating | Why |
|---|---|---|
| Concept | 9/10 | Clear real-life needs: post guard on escort, report times, ERT |
| Debugging | 9/10 | Found the cut report, the hidden ERT entry and the Group button problem by testing on the phone |
| Recall | 9/10 | Remembered: no Job Scheduling tick, check the diff before deploying |
| Typing | 7/10 | Short messages, some spelling slips |
| Effort | 10/10 | 07:31 to 03:20 |
| Overall | 9/10 | Big day: three new features live in Production |

## Next

1. Production Post setup: set the report type on MLCP, Lancor, North Plaza, Apricot, MLCP reception, ERT Booth.
2. Check the first reminder runs (Job Scheduling → report_remind → Execution history); switch off report_remind_dev after testing.
3. Test Post Escort fully once (break → trip → I'm back → office sheet + dashboard).
4. Monthly attendance format (waiting for the template); ERT format from the agency if they have one.
5. Voice → English text (Sarvam) for chat and ERT: discussed, not built.
6. Still open: one CCTV guard's roster, extra staff list, daily IPF Auto fill, export JSON delete, real alert receiver for Cumbum.
