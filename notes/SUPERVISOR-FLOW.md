# 🧭 Supervisor flow (21 Oct 2026)

The left rail is in this order, so the supervisor just goes top to bottom.

## Once a month

| Step | Screen | What to do | Why |
|---|---|---|---|
| **1** | **Roster** | Upload the month Excel (📤 Upload Excel) → check → **Next: Schedule →** | Auto fill takes each guard's shift (A / B / C / G / Off / Leave) from here. No roster = no Auto fill |

## Every day

| Step | Where | What to do | Why |
|---|---|---|---|
| **2** | Schedule → **⚡ Auto fill** | Fill **yesterday first, then today** (the daily rotation rule looks at yesterday) | Fills every post by the rule book (`AUTO-FILL-RULES.md`) |
| **3** | Schedule → **Check** (scrolls to the bottom) | **Day summary**: per shift total / filled / unfilled + unfilled post names. **On duty, no post**: free guards. Tap an empty slot → pick a guard | The supervisor knows the site; Auto fill gives the right people, the supervisor makes the last fixes |
| **4** | Schedule → **Publish** | Publish the day | Guards get their post when they swipe IN |
| **5** | **Live** board | Watch card IN, breaks, alerts | See that every post is really covered |
| – | **Posts** | Messages from the posts | Day-to-day talk with guards |

## The step strip on the Schedule page

`1 Month roster ready → 2 Filled 128 of 153 → 3 Check: 25 empty · 8 free guards → 4 Publish 128 → 5 Watch the Live board`

- 🟢 green = done · 🔴 red = still to do.
- Each step is a button: tap it to do that step.

## Getting around

| From | How |
|---|---|
| Rail screens (Roster, Schedule, Live, Posts) | Left rail: 1 Roster · 2 Schedule · 3 Live · 4 Posts, then Escort · Guards · Admin |
| Older pages with the top bar (Escort sheet, Guards, Post setup, Duty chart, Guard links) | Top bar starts with the same steps: **1 Month roster · 2 Schedule · 3 Live board · 4 Posts**, then Escort sheet · Guards · Post setup · Duty chart · Guard links |

## Other

| Rail | For |
|---|---|
| Guards | Guard Master (add / edit guards) |
| Admin | Users, branches, agencies (branch admin and above) |
| ▴ / ▾ on Schedule | Hide the buttons for a bigger sheet |
| 🖨️ Print | The sheet + Day summary + free guards on paper / PDF |

## ⏰ Estancia shift and card IN times (Prem, 22 Oct)

| Duty | Shift time | Card IN window |
|---|---|---|
| A | 06:00 – 15:00 | 05:20 – 06:15 |
| B | 13:00 – 21:00 | 12:30 – 13:15 |
| G | 09:00 – 18:00 | 08:20 – 09:15 |
| C | 21:00 – 06:00 | 20:20 – 21:15 |
| Escort 6 to 5 | 18:00 – 05:00 | 17:20 – 18:15 |
| Escort 9 to 6 | 21:00 – 06:00 | 20:20 – 21:15 |

- Shift times live in the **Shifts** table (B changed 14:00 → 13:00). IN windows are in `supervisor.js` (`IN_WINDOW`).
- Live board: **Auto** moves to a shift when its IN window opens; a post / escort is **Due** from the window opening to the **shift start**, then **Not IN** at once (red, Needs attention); an IN **after the shift start** shows **late** (e.g. B IN 13:05).
- Live board tabs: **A · G · B · C** = posts only; **🚗 Escort** = 6 to 5 and 9 to 6 only.

## ⏳ Decided, not built yet: "no duty" after the IN window (Prem, 22 Oct)

Prem: build this when it can be tested with real card swipes (Gallagher), not now.

| Swipe (B example) | Rule |
|---|---|
| 12:30 – 13:00 | Duty, on time |
| 13:01 – 13:15 | Duty, **late** mark (built) |
| **After 13:15** (window end) | **No duty that day**: the swipe is still saved in AccessLog, but it does **not** count as IN — no post / escort page, the post stays **Not IN**, and the phone gets "IN 13:20 is after 13:15. No duty today. Meet your supervisor." |

Same for every duty, with its window end: A 06:15 · B 13:15 · G 09:15 · C 21:15 · Escort 6 to 5 18:15 · Escort 9 to 6 21:15.

How to build (notes for later):
- Only the **first IN of the duty day** is checked; an IN again after a card OUT (break) is allowed.
- Window check by minutes from the window opening (C crosses midnight): late-reject when `windowLength < minutesSinceOpen <= 12 h`; an early swipe before the window opens is not rejected.
- Places: `onCardIn` (skip `post.onPostIn`, send the "no duty" notification), `/guardDay` and `/postDuty` (locked with that message), escort trip writes (`guardOnDuty`), Live board (post Not IN; escort card "Late IN · no duty").
- Move `IN_WINDOW` from `supervisor.js` to a shared module so `index.js` / `post.js` use the same times.
- Maybe later: a supervisor override ("allow duty") for a late guard.

## ⏳ Next month (November roster), not now

- The Month Roster upload saves **shifts** only. The guard's **team** (PKL / MLCP / ESCORT / HOSPITAL…) in Guard Master was set once by hand from the October roster headings.
- When the November roster comes: either make the upload read the **section heading** of each guard and update the team automatically (suggested), or change teams by hand in Guard Master. Decide then (Prem, 22 Oct).
