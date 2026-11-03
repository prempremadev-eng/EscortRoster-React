# Day summary: 2 Nov 2026 (Monday)

Time: 05:25 → 23:54 (lunch 14:01, break about 19:09). Branches: `post-handover` (old project), `slate` (NightOwl, `~/Desktop/NightOwl`).
Main topics: new NightOwl project on Slate, Cumbum moved to NightOwl Production, shift time rules, swap with office OK,
profile photos, first real guard on the new app at night.

## What we did

| # | Work | Result |
|---|---|---|
| 1 | NightOwl project | Tables, function, Slate app, embedded login, cross-domain token (raw token, no CORS headers in code) |
| 2 | Cumbum in NightOwl Dev | Move setup import, Nov roster, auto schedule; post form labels in Tamil, made short |
| 3 | 2 posts or 1? | One post (Cumbum Gate, A B C G, G only on roster days) is right for one gate |
| 4 | Chats | One post chat for everyone on the post; one team group per branch + agency |
| 5 | Relief guards vs ➕ Add reliever | Relief list = known backups (empty for Cumbum); outside reliever = added that day |
| 6 | 🗑 Remove photo | Guards → edit: remove a test face, the guard registers again |
| 7 | After IN | Duty page opens by itself; no way back to IN / OUT without a new scan |
| 8 | Reliever OUT lock | A reliever also waits for the next shift; office **Allow OUT** for relievers |
| 9 | Shift time rules | IN from 40 min before the start, till 10 min after the end; OUT only after the end |
| 10 | 🔄 Swap | Guard asks at the gate (start −40 to start +15), office ✅ OK / ✕ No on Gate now, IN at the ask time, duty page opens, both guards told (Tamil), 2 asks at most |
| 11 | Attendance | New column `Schedule.swap_note`, **Swap** column in amber |
| 12 | Alerts | At shift start: guard not IN + office; 10 min after the end: guard still IN + office (Tamil) |
| 13 | Chat camera | One 📷 button with Photo / Video inside (post chat and team group) |
| 14 | Profile photos | `Guards.profile_key`, `UserRoles.profile_key`; separate from the face photo; tap to view, ⋮ to change, Camera / Gallery |
| 15 | Mobile schedule | Whole page scrolls on a phone (sheet was hidden) |
| 16 | Keys | Plate scan + voice keys copied to NightOwl (values never shown) |
| 17 | NightOwl Production | Deploy, env variables, auth domain, user, super admin, Cumbum import, roster, cron key, 3 crons |
| 18 | First real use | Night (C) guard registered and went IN at 22:04, 20 m from the gate |
| 19 | Late fix | C guard can add the A reliever before 06:00 (OUT screen opens, OUT waits) |

## Errors and how they were found

| Error | Cause | Fix |
|---|---|---|
| "Please sign in" on 🔄 Ask office | Route not in the guard list | Added to guard routes |
| Swap ask showed only after refresh | Gate now loaded once | Reloads on a push and when shown again |
| Office pressed No by mistake | No second chance | Ask again (2 asks at most) |
| Guard had to scan again after OK | Design | IN at the ask time, duty page opens itself |
| Photos would go to the old bucket | Production env variables empty | MEDIA_BUCKET + APP_URL set in the console |
| Add Domain greyed out in Production | Set in Development, then deployed | Domain added in Dev, CloudScale deploy |
| "Invalid domain" | `https://` typed | Domain name only |
| C guard could not add a reliever before 06:00 | New OUT time rule threw early | Screen opens, only OUT waits |
| Build killed (exit 137) twice | Laptop memory | Ran the build alone, then deployed |

## Honest rating

| Area | Rating | Why |
|---|---|---|
| Concept | 10/10 | Designed swap with office OK, time windows and photo separation himself |
| Debugging | 9/10 | Every bug found by real testing at the gate |
| Recall | 8/10 | Remembered the cron and Job Scheduling rule during deploys |
| Typing | 8/10 | Console fields typed right (one `https://` slip) |
| Effort | 10/10 | 05:25 to midnight, go-live done |
| Overall | 9.5/10 | Cumbum is running on NightOwl Production |

## Next

1. Switch off the old app's Cumbum QR.
2. Fourth guard's New Registration on Production.
3. Manager demo on Development.
4. Remind: real alert receiver (alerts still go to Prem).
