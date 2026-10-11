# 🚕 Trip Entry + Dashboard + Night Shift (Notes – English)

Date: 2026-10-09 → 2026-10-10
Where: `~/Desktop/EscortRoster-React`, Catalyst project **EscortRosterReact** (new account, org `60086856508`)

---

## 📖 Story: why this work?

Guards fill a **Zoho Creator form** for every trip and type their name, mobile, agency and cab details again and again.
Our `Escorts` table **already has** these details, so we moved the form **inside our app**.

🍽️ **Hotel story:** a delivery boy writes his own name in a notebook for every delivery, even though the hotel register already has it. Now he only **ticks each house**.

---

## 1️⃣ Trip employee entry

| Part | What | Why |
|---|---|---|
| `DutyRecords` + `vehicle_no`, `driver_name` | One row = one trip | Cab details are needed **once** per trip |
| New table `TripStops` | One employee = one row | A trip can have **any number** of employees |
| `duty_record_id` | Links a stop to its trip | Like the bill number on every line of a bill 🧾 |
| `TripPopup.jsx` | Cab + employees popup | The guard enters everything in one place |
| Trip bar in `RouteCell.jsx` | Under the Out time | The place that opens the popup |

### Rules
| Rule | Why |
|---|---|
| [ + ] appears only after **Out time** | You can't drop anyone before the trip starts |
| **In time is always allowed** | In time decides the rotation, so it must never get stuck |
| Guard **and** head guard can edit / delete | So forgotten entries can be fixed later |

### Bar colours
| Bar | When |
|---|---|
| 🔵 `👤 2 +` | Trip is going on |
| 🔴 `⚠️ Entry pending` | **In time set + (no cab details OR 0 employees)** |
| 🟢 `✅ 👤 4` | Vehicle + driver + at least 1 employee |

### 🐞 Bugs and fixes
| Bug | Cause | Fix |
|---|---|---|
| Type and Time hidden in the popup | Global CSS `table { min-width: 900px }` | `.trip-stops { min-width: 0 }` |
| Employees in the wrong order | ROWID order is not reliable | `ORDER BY CREATEDTIME` |
| 🗑 did not delete | The browser blocked `confirm()` | A **2-tap** "Delete?" inside the popup |

---

## 2️⃣ The free-limit problem 🔑

| | |
|---|---|
| Error | `FREE_USAGE_LIMIT_REACHED` (Datastore Fetch) |
| Cause | 5 s refresh × 4 queries × 3–4 tabs ≈ 2,900 reads per hour per tab |
| Fix | 30 s, no refresh while the tab is hidden, 4 calls → 1 call `/getDayData` |
| Result | About **8× fewer** reads |

Then we moved to a **new Catalyst account**: CLI login → create project → connect MCP → 4 tables + 31 columns.

---

## 3️⃣ Dashboard 📊

| Part | What |
|---|---|
| Page | `#dashboard` (no router; the Back button works) |
| Filter | Day / Week / Month + date |
| Cards | Trips, Drop, Pickup, Pending |
| Guard wise | Trips, Drop, Pickup, Total, Pending |
| Trip details | Tap a row to see its employees |
| Quota | **No auto-refresh**, only the 🔄 button |

---

## 4️⃣ Night shift + rotation

| Rule | Code |
|---|---|
| A new duty day starts at **8 AM** | `SHIFT_END_HOUR = 8`, `dutyDayStr()` |
| Sunday opens at **midnight** | Saturday is leave, so no night duty is running |
| Dashboard order: 00:15 comes after 23:40 | `shiftMinutes()` |
| Rotation **locked at 4** | One number did two jobs: route columns + seat shift |
| Rotation counts **Mon–Fri only** | Fri → Mon = +4 (not +12) |

---

## 🗣️ Spoken English practice

Read these aloud, slowly, three times each:

1. "A guard can add employees only after the trip has started."
2. "The bar turns red when the In time is set but the entry is incomplete."
3. "We created a separate table because one trip can have many employees."
4. "The app was refreshing every five seconds, so we ran out of free reads."
5. "We reduced the refresh to thirty seconds and paused it when the tab is hidden."
6. "The duty day changes at eight in the morning, not at midnight."
7. "We locked the rotation because one wrong click changed every seat."
8. "Could you please check the dashboard and tell me if the numbers look right?"

**Interview-style answer (practice saying this):**
> "I added a trip entry feature to our escort duty app. Guards log each employee they drop or pick up, along with the cab details. When the free tier ran out, I found that the auto-refresh was too frequent, so I combined four API calls into one and slowed the refresh down. I also built a dashboard that shows trips per guard."

---

## ✅ Recall questions

1. When does the [ + ] button appear, and why?
2. What are the two conditions for 🔴 Entry pending?
3. Why is `TripStops` a separate table?
4. Why did the free limit run out? What were the three fixes?
5. Which sheet opens at 6 AM on Saturday? And on Sunday?
6. Why did we lock the rotation box?
7. Why doesn't the dashboard auto-refresh?
