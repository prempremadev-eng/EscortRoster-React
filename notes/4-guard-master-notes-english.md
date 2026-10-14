# 🛡️ Guard Master → Card IN → Escort Duty Sheet on the phone (Notes – English)

Date: 2026-10-14 (Wednesday)
Where: `~/Desktop/EscortRoster-CardAccess` (branch `card-access`), Catalyst **EscortCardAccess** (Development)

---

## 📖 Story: why this work?

A company like Nokia has **many branches** (Chennai Beach, Guduvanchery, Salem, Nagpur…), and every branch has security guards. We want **all guards in one master list**.
When a card shows **IN**, the message depends on the guard's **duty type**:
- **ESCORT** → "Today your Seat 9" → tap → **Escort Duty Sheet**, where only their ⭐ row can be filled in
- **POST** → "Today your post: Gate 3"

🍽️ **Hotel story:** the head office keeps a **branch book**, a **staff register** and a **gate book**. When a staff member signs at the gate, they get an SMS. Tapping it opens the **order book**, but their pen only writes on **their own line**.

---

## 1️⃣ Tables

| Table | One row = | Why |
|---|---|---|
| `Branches` | One branch (code, name, company, country, state, city, area) | Branch details are written **once**; a guard only stores the branch ID |
| `Guards` | One guard (ID number, name, agency, branch_id, duty_type, post / escort_id, guard_token, is_active) | The **master list** |
| `AccessLog` | One swipe, now with **`guard_id`** | The gate book (changes daily, history matters) |
| `PushSubscriptions` | One phone, now with **`guard_id`** | The phone's address |

**IN / OUT is not in the master.** It changes every day and we need the history, so it lives in `AccessLog`.

**The Escorts table has no access data any more** (`guard_token` was deleted). The link goes one way only: `Guards.escort_id → Escorts`.

---

## 2️⃣ Pages

| Page | For | What |
|---|---|---|
| `#master` 🛡️ Guard Master | Supervisor | All guards, today's IN / OUT, State → City → Branch filters, 🚐 Escorts, ➕ Add, ✏️ Edit, 🚫 Guard left, ↩️ Re-activate |
| `#simulator` 🪪 | Testing | IN / OUT for every guard |
| `#links` 🔗 | Supervisor | QR / link, phone count, **🔄 New link** |
| `#guard/<token>` | Guard's phone | ESCORT: the **original Escort Duty Sheet**, only the ⭐ row is editable. POST: their post |

---

## 3️⃣ Rules (checked on the server)

| Rule | Why |
|---|---|
| No **duplicate** ID numbers | Two guards called "Murugan" never get mixed up |
| One escort → **one active guard** | It's clear whose seat it is |
| A guard who leaves is **switched off, not deleted** | Old swipes keep their name |
| Switched off: link, phone and swipes **all stop** | People off duty can't get in |
| On the guard sheet, only **their own row** saves | Someone with a link can't change other rows |
| Card IN + **today's duty day** + a weekday seat | No entries without being on duty |
| Route order: Location → Out → In, Route 2 after Route 1 | Same rule as the duty sheet, also on the server |
| Other rows show **employee counts** only, no Mobile / ID | Privacy: every guard sees this page |
| **New link** → old link dead + phones removed | For a leaked link or a lost phone |

---

## 4️⃣ How we reused the original design

The guard page uses the supervisor's **own components** (`DutyTable`, `RouteCell`, `TimePicker`, `TripPopup`) **without changing them**.
- The guard's `actions` send the guard's own row to the guard API and **do nothing** for any other row
- CSS: `tbody tr {pointer-events:none}`, then the guard's own Route cells are switched back **on**
- The server **checks again** (in case someone cheats on the phone)

**The escort-side files are the same as `main`** (git diff is empty), so the live merge stays easy.

---

## 🐞 Problems and fixes

| Problem | Cause | Fix |
|---|---|---|
| A POST guard's swipe wouldn't save | `AccessLog.escort_id` was **mandatory** | Made it optional, later deleted it |
| localhost 502 after a build | Building while serve was running (old problem) | Restart serve |
| `pkill -f "catalyst serve"` killed my own command | The pattern was also in my **bash command line** | Use `ps … awk '!/bash -c/'` to find only the node process |
| `git checkout main -- files` was blocked by auto mode | Overwriting files is risky | Small edits with the same result |
| Time boxes too narrow on the guard page ("07:50 F") | Out and In on one line | One below the other on phones |

---

## ✅ Tested

| Test | Result |
|---|---|
| Add guard: duplicate ID, no post, already-linked escort, bad branch, `'` in ID | ❌ correct errors ✅ |
| Edit, POST ↔ ESCORT, switch off / on | ✅ |
| Murugan (POST) IN → "Gate 3" | ✅ |
| RAJA (ESCORT) IN → Seat 9, guard sheet ⭐ 9 | ✅ |
| Guard's Route 1 entry → supervisor sheet seat 9 | ✅ |
| Old link after New link | ❌ "not valid" ✅ |
| **Notification → tap → sheet on a real phone** | ⏳ tomorrow (TEST ESCORT / RAJMOHAN) |

---

## 🗣️ Spoken English practice

Read these aloud, slowly, three times each:

1. "We keep every guard of every branch in one master table."
2. "The card IN time is not stored in the master, because it changes every day."
3. "When a guard leaves, we switch them off instead of deleting them."
4. "An escort guard taps the notification and sees the full duty sheet."
5. "They can only fill in their own row; the other rows are view only."
6. "The server checks every save again, so nobody can cheat from the phone."
7. "If a link is shared by mistake, we make a new link and the old one stops working."
8. "I'll test the notification on a real phone tomorrow morning."

**Interview-style answer (practice saying this):**
> "I designed a guard master for a company with many branches. Each guard has a duty type. When their access card shows IN, they get a push notification. Escort guards tap it and see the same duty sheet the supervisor uses, but they can only fill in their own row. I reused the existing table components without changing them, and the server checks every save, so the link can't be used to edit anyone else's data."

---

## ✅ Recall questions

1. Why is IN / OUT not a column in the Guards master?
2. Why does a guard who leaves get switched off instead of deleted?
3. How does the guard page find the seat for a guard? (Guards → Escorts)
4. Name three things the server checks before saving a guard's route.
5. Why are Mobile and ID numbers empty on the guard's sheet?
6. What happens to the guard's phones when you press New link? Why?
7. Why did `pkill -f "catalyst serve"` stop my own command?
