# 📅 Day summary: 2026-10-15 (Thursday)

**Time:** 15:47 → 00:08 (16 Oct), ~8 h 20 min span (breaks not logged)

## ✅ What we did

| # | Work |
|---|---|
| 1 | **Posts** + **Shifts** + weekly **Duty Chart** (Copy last week), duty_type / post_name removed from Guards |
| 2 | Notification tap opens the right page on Android + laptop (service worker tells the open tab where to go) |
| 3 | Test notification tap now opens the guard's duty page (was the setup page) |
| 4 | Understood: our 7 tables, push = VAPID + sw.js + subscribe + web-push, the 8 steps from Simulator IN to 🔔 |
| 5 | Learned: **webhook** (concept, not a company), long polling, **Gallagher** options (REST API / cloud / bridge PC) |
| 6 | Found: admin pages have **no login** (must fix before live) |
| 7 | Read the **guard app build prompt** (37 screens) → planned phases |
| 8 | **Post handover phase 1** on new branch `post-handover`: DutyLog + PostMessages, Card IN → Take over → timeline → pin. Tested on the phone ✅ |

## 🐞 Problems today

| Problem | Fix |
|---|---|
| Tapping the notification opened the setup page | It was the **test** notification → its link changed |
| No notification after IN | IN came **before** phone setup / it was a **second** IN |
| IN pressed for Murugan instead of Test Guard | Check the dropdown |
| DELETE blocked for me | Prem deleted one row with ZCQL `WHERE ROWID = …` |
| Timeline order wrong | ROWIDs are not in time order → sort by CREATEDTIME |
| PREM had no DutyLog | Chart changed after the first IN → any IN now makes a missing DutyLog |
| varchar 1000 became 255 | Catalyst cap, no error |

## 📊 Honest rating

| Area | Score | Why |
|---|---|---|
| Concept | 8/10 | Very good questions: cost, webhook, Gallagher, "where is the dashboard, is it safe?" |
| Debugging | 5/10 | Good screenshots, but the cause was found by me each time |
| Recall | 9/10 | 4/4 correct (PushSubscriptions, sw.js, 1440, OUT = 4 steps) |
| Typing | 1/10 | No code typed today |
| Effort | 9/10 | Long day, till midnight, tested everything on the phone |
| **Overall** | **7/10** | Big progress in understanding; next step is typing small parts yourself |

## 🧪 Test data left in Development

| What | Where |
|---|---|
| Senthil Main Gate on duty + 1 pinned note | DutyLog / PostMessages |
| Test Guard → PREM handover at Gate 3 + notes | DutyLog / PostMessages |
| Guard B extra IN 23:47 / 23:5x | AccessLog |
| Beach supervisor phone set | Branches |
| Test Guard: inactive again, phone address expired | Guards / PushSubscriptions |

## ⏭️ Next

1. Recall quiz (notes 5 + 6) before reading them
2. Post handover **Phase 2**: photo / video / voice
3. Plan **login + roles** (needed before live)
4. Ask IT: Gallagher → can it send each swipe to an HTTPS URL?
