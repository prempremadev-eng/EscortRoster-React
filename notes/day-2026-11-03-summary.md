# Day summary: 3 Nov 2026 (Tuesday)

Time: 10:16 → 00:22 (4 Nov). Branches: `post-handover` (old project), `slate` (NightOwl, `~/Desktop/NightOwl`).
Main topics: chat polish, office pin/delete, page fixes for phones, Cumbum G shift 8–5, old Cumbum QR off,
IPF brought into NightOwl Dev, monthly teams, Cumbum schedule in boxes, Production deploy.

## What we did

| # | Work | Result |
|---|---|---|
| 1 | Git push + day notes (29 Oct, 30 Oct, 2 Nov) | Checked: no data in the public repo |
| 2 | Chats | WhatsApp-size photos, NightOwl wallpaper (softer), bolder text, Enter = new line, 📤 Share in every chat |
| 3 | Office chat | 📌 Pin for all shifts (7 days, shows at take over) and 🗑 Delete own message |
| 4 | Attendance | Phone: Date + Name stay, rest scrolls; day/month/year, approval columns, Added Time, ID removed; IN Time → **Work Hours** |
| 5 | Admin → Users, Guards | Name (and Photo) stay while the rest scrolls; guard count per branch · agency |
| 6 | Cumbum G shift | 09–18 → **08–17** (data + alert crons, no deploy needed) |
| 7 | Old app | Old Cumbum crons paused, old Dev office notifications removed, Cumbum branch off in old Production |
| 8 | 📦 Import | "Add a branch" mode: reuses state / city / shifts / agency, tick the agencies to bring |
| 9 | IPF → NightOwl Dev | Estancia branch, IPF guards, posts, incharges imported; 1 guard added, 3 switched off |
| 10 | Nov roster | Uploaded; checked against the agency PDF for every area: all match |
| 11 | Monthly teams | Medical Mine, Ninnakarai, **North Plaza** (lady guards' team, was "Lady Guards"), Kido School come from the roster headings; current month also updates the guard's Area |
| 12 | Lady guards list | 👩 button on Month roster: Gender Female or North Plaza team (17 people) |
| 13 | Schedule page | ▾/▸ on every part + Show all / Hide all; Copy + Publish moved into ⋯ More; gaps between tables |
| 14 | Cumbum schedule | One DUTY table (A · G · B · C going down), Gate now beside it, all parts in equal boxes, two per row |
| 15 | Production | Serverless deploy (old pending one aborted first) + Slate prod deploy + push |

## Errors and how they were found

| Error | Cause | Fix |
|---|---|---|
| Slate prod deploy: "Too many arguments" | A question typed after the command on the same `!` line | Command alone on its line |
| Import screen had no agency tick boxes | Browser showed the old page (cache) | Ctrl+Shift+R before using a new screen |
| Two guards saved in the wrong team | Roster uploaded on the old cached page | Fixed in the data; Ctrl+Shift+R after every deploy |
| Day summary box ran into the next box | Fixed-pixel column widths | Wide columns share the box width |
| Create Deployment refused ("migration in progress") | Yesterday's deployment stuck at Diff_Completed | Abort it, then create a new one |
| Deploy from my side sent an old build once | Wrong build log path, build never ran | Rebuilt and redeployed |

## Honest rating

| Area | Rating | Why |
|---|---|---|
| Concept | 9/10 | Explained the monthly team rotation clearly; asked for tidy boxes for the manager |
| Debugging | 8/10 | Spotted the missing tick boxes and the hidden Kido School team quickly |
| Recall | 8/10 | Remembered: Dev first, then Production; no Job Scheduling tick |
| Typing | 7/10 | One command + question on the same line |
| Effort | 10/10 | 10:16 to past midnight |
| Overall | 9/10 | IPF is in NightOwl Dev; Cumbum page looks ready for the manager |

## Next

1. IPF Auto fill check (Dev): 3 Nov 148 of 149, B shift incharge empty.
2. IPF into Production: import (same file, IPF only), guard fixes, roster v2, Gender for the 17, schedule.
3. Pending from IPF: one CCTV guard's roster; who are CO / PC / V Titan / Sup Vaithy.
4. Delete the export JSON from Downloads after the Production import.
5. Remind: the real alert receiver for Cumbum is still missing.
