# Day summary: 30 Oct 2026 (Friday)

Time: about 09:10 → 16:40 (no start / done said; from commits). Branch: `post-handover`.
Main topics: old project to Production for Cumbum, daily auto schedule, office relievers, new app name NightOwl, Slate plan.

## What we did

| # | Work | Result |
|---|---|---|
| 1 | Production checklist | `notes/PRODUCTION-CHECKLIST.md` |
| 2 | 📦 Move setup | Export in Development, import into an empty Production (new ROWIDs mapped) |
| 3 | Cumbum only | One branch exported; created in Production; roster uploaded |
| 4 | Post regulars & rules | ⚙️ section back in the post form (regular guards, "row only" rule) |
| 5 | Daily auto schedule | `Branches.auto_schedule`: regular guards to their roster shift, once a day (00:05 cron or when the day opens) |
| 6 | Reliever colour | A reliever on the sheet shows 🔁 on amber |
| 7 | Office adds a reliever | Schedule → 🔁 RELIEVERS → ➕ Add reliever, for a day and a shift |
| 8 | Crons | Late check + auto schedule set in Development, calling Production |
| 9 | New name | **NightOwl** 🦉 (no "guard / security" on the phone, for family privacy) |
| 10 | Slate plan | `notes/SLATE-MOVE-PLAN.md`: new NightOwl project with Slate hosting |

## Errors and how they were found

| Error | Cause | Fix |
|---|---|---|
| Office login not found | Email saved with a leading space | Prem fixed the row |
| A shift ended " 15:0" | Typed time | Changed to 15:00 |
| Cron create refused in Production | Not allowed by API | Crons in Development call the Production URL |
| Auto schedule needed every day by hand | No daily job | `auto_schedule` + 00:05 cron |

## Honest rating

| Area | Rating | Why |
|---|---|---|
| Concept | 9/10 | Understood Development vs Production and why data does not move by itself |
| Debugging | 8/10 | Spotted the empty A slot and the reliever colour need |
| Recall | 7/10 | Rules of the post form needed repeating |
| Typing | 8/10 | Console steps done carefully |
| Effort | 9/10 | Many console steps in one day |
| Overall | 8.5/10 | Cumbum was live in Production by evening |
