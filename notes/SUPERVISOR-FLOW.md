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
| Report | **Shift Report** (read only, for the supervisor's report to the branch admin): per shift Allot (roster) · Posts · Filled · Present · Late · Absent · Not yet · Spare · Vacant posts, Leave / Week off totals, then the lists: Vacant posts, **Absent**, Late, **Leave**, Spare, Week off. Print / PDF; admins also get All my branches |
| History | **Duty History** (read only, every role sees only its own area; city / state / super admin also get "All my branches" with a Branch column): a date → every guard's team, roster letter, post / escort seat, card IN / OUT, status (Present / Late / Absent / Week off / Leave / No post). Replaces the weekly Duty Chart page (removed 22 Oct) |
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
- Live board: **Auto** moves to a shift when its IN window opens; a post / escort is **Due** from the window opening to the **shift start**, then **Not IN** at once (red, Needs attention); a post with **nobody scheduled** turns **Vacant** (red, Needs attention, own KPI) once the shift starts; an IN **after the shift start** shows **late** (e.g. B IN 13:05).
- Live board tabs: **A · G · B · C** = posts only (only the posts that work that shift today, same rules as the Schedule page, so Total posts = that shift's slots); **🚗 Escort** = 6 to 5 and 9 to 6 only.

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

## 🗑️ Weekly Duty Chart removed (Prem, 22 Oct)

- The #chart page is gone (an old link opens Duty History). Card IN, the Live board and "Copy from yesterday" use **only the published Schedule** now (no weekly fallback): a day that is not published has no post.
- The DutyChart table and its API stay in the database untouched (not used by the pages).

## Publish after the guard's card IN (23 Oct)

- Card IN before the day is published → guard page says **"Today's schedule is not published yet… no need to swipe again"** (not "not assigned").
- **Publish** (today) → every guard whose last swipe today is IN gets **"✅ Your post is ready · <post> · Shift X"**; opening the page makes their duty row with the **card IN time** (late mark stays right). No second swipe.

## App update on phones (23 Oct)

- When the app comes back to the screen it checks (at most once a minute) whether a new build was deployed and reloads itself. No Data Store read.

## 🚗 Escort table only for the escort agency (25 Oct)

The Schedule page shows the ESCORT table and the "→ Escort" button only when the agency being looked at has
Escort-team guards (IPF at Estancia). BSS / ISI do not see it, and the page skips the escort reads for them.

## 📤 Schedule by Excel (25 Oct, for agencies without Auto fill rules)

- Schedule page → **📥 Template**: an Excel of the day (Date, Post, Shift, Guard ID, name) with the names already put, and a **Guards** sheet (ID, name, roster shift that day, team).
- Fill the Guard ID column → **📤 Upload** → the rows become drafts (same rules as a hand pick: one guard one slot a day, a second shift only at an extra duty post; post shifts checked, G allowed on any post) → check → **Publish**.
- Several days in one file: put each row's date. Rows that cannot be saved are listed (post / guard not found, twice on a shift …).
- Test plan (ISI, 26 Oct): 15 dummy guards + dummy roster + 6 ISI posts → template → fill → upload → publish → guard link → card IN.
