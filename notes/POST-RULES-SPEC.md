# 📘 Post duty rules: clean spec (for the next app)

Version 1 · 22 Oct 2026 · IPF at Estancia (PKL, Hospital, MLCP, Lancor, Ninnakarai).
Rules only: **no names**. Built today in `functions/escortAPI/supervisor.js` (`/scheduleAuto`, `/schedule`, `/supBoard`, `/dutyHistory`).
Source of the decisions: `AUTO-FILL-RULES.md` (day-by-day notes), `ESCORT-RULES.md` (escorts), `SUPERVISOR-FLOW.md` (screens and times).
Goal of the next app: the supervisor uploads the month roster and everything below **adjusts by itself** (rules, not names).

---

## 1. Inputs

| Input | From | Gives |
|---|---|---|
| **Month roster** (Excel, once a month) | Supervisor | Each guard's **team** (section heading: PKL, MLCP, ESCORT, HOSPITAL, sub-groups) and **one letter per day**: A / B / C / G = shift, O = week off, L = leave |
| **Guard master** | Admin | Name, ID, phone, agency, branch, card number |
| **Posts** | Admin, once | Section, sheet order, shifts, type, flags (section 3) |
| **Last month's real schedule** | The app's own published schedules (or the paper sheets the first time) | The **order** of people at each post (most days there first) |
| **Shift times + card IN windows** | Branch settings | When a shift starts, when IN counts, when it is late (section 8) |

## 2. Teams and fixed sub-groups

| Kind | Groups | Changes monthly? |
|---|---|---|
| **Rotating teams** | PKL men, MLCP men, Escort, Ninnakarai | **Yes**: a guard can be PKL one month, MLCP or Escort the next |
| **Fixed sub-groups** | Supervisors, Documents, Medical Mine ladies, Kidos ladies, Lady pool, PKL core team | No |
| Hospital | Own team, works only hospital posts | Not known yet (check each month) |

Rules that always hold:
- Lists use **this month's team** only; history only decides the **order**.
- The roster section is not always where people really work → for rotation posts the order comes from **days at that post last month (any team)**.
- A 1–2 week one-off stint does not make someone a regular (look for repeated stretches).
- Ninnakarai people stay at Ninnakarai (a post may name an exception).
- Escort men do posts only when their roster day is **A / B / G** (C = escort duty) and on **Sunday**; they are picked **after** PKL / MLCP men.

## 3. A post: fields and flags

| Field | Meaning |
|---|---|
| Section | Sheet block: PKL / Main, Hospital Block, MLCP |
| **Sheet order** | Row on the printed sheet = the template the guards know. **Never** used for fill priority |
| Shifts | e.g. ABC, ABCG, G, AB |
| Regular list | Ordered people (first = first choice) |
| Relief list | Ordered people for Rules 3 / 4 (5+ people also turns on Rule 8) |
| Weekend list | Used on Sat / Sun instead of the relief list |
| Lady shifts | The shifts where the lady pool rotates (e.g. B at Kitchen-2) |

| Flag | Meaning |
|---|---|
| **digit 1–9** | **Fill priority**: filled before posts without a digit (1 before 2) |
| **D** | **Daily rotation**: never yesterday's guard at this post |
| **F** | **Never empty**: if nobody from its list is free, take a free PKL / MLCP man **after every post has its own regulars** (escort last, never Ninnakarai / ladies / shift incharges). MLCP Main Gate-1 = `1F` |
| **R** | Row only on the shifts its regular works that day (one fixed person, e.g. CCTV) |
| **R + shifts** (e.g. RG) | The same, only for those shifts (Documents G, Shift Incharge G) |
| **W** | Weekdays only (no row on Sat / Sun) |

### Set in the app (25 Oct)

Post setup → ➕ Add post / ✏️ edit, in this order: 1 Branch · 2 Agency · 3 Post name · 4 Type · 5 Section + row · 6 Shifts · options (🚗 vehicle entry, ⭐ extra duty, ⚡ Auto fill) · **8 Auto fill details** (shown when Auto fill is on): **Regular guards** and **Relief guards** (ordered lists of that branch + agency's guards, ↑ to move up), **Priority 1–9**, **F**, **D**, **W**, **R** (+ shifts). The weekend list and lady shifts are kept as they are (not in the form yet). The list has Agency and post-name filters.

## 4. Post types (how the list is made each month)

| Type | Used for | List | D |
|---|---|---|---|
| **Fixed** | Documents, PKL core posts, CCTV, permanent reception ladies, Kidos | Those people as regulars | No |
| **Team** | Hospital floors, Ninnakarai | The team as regulars, each post's own order; the main post first | No |
| **Lady pool rotation** | North Plaza Reception, Apricot Reception, Apricot Patrolling (A, C), Kitchen-2 (B weekdays) | Weekly rotation (Rule 5) | weekly |
| **Support / important** | North Plaza GF1 (helps the reception lady, needs pass-system knowledge), CWE Play Ground | People who **know the post** (4 months), PKL first, then MLCP | GF1 no, Play Ground yes |
| **Group pair** | A small team moving between 2–3 posts (Lancor BKE / Car Parking / Vendor Entrance) | The team, ordered by days at each post | only where the post says |
| **Option B rotation** | Most MLCP, Lancor and PKL-other posts | **Most days at that post last month (any team)**, then the 4-month total; top 15–20 | usually yes |
| **Special shift** | One shift has a fixed person (e.g. Basement-2 G, Car Parking-3 G) | That person first, then cover | No |

## 5. The Auto fill, step by step

For one day of one branch. Only **empty** slots are filled, as **drafts**; one guard gets **one slot a day**; a guard is used only on **his roster shift** that day.

| Step | Rule |
|---|---|
| 0 | Posts with Auto fill on, sorted by **fill priority digit**, then sheet order, then name |
| 1 | **Shift Incharge**: a guard ticked as **shift incharge of the agency** (Admin → Agencies, `Agencies.incharge_ids`) whose roster has that shift. Two incharge posts (e.g. MLCP Shift Incharge on G): each first takes its own regular, then the main one takes any incharge left. Nobody → empty |
| 2 | **Regulars**, two passes: (a) every post's own regulars in list order (not yesterday's guard on a D post); (b) then an **F** post still empty → a free PKL / MLCP man (priority digit order, so `1F` first) |
| 5 | **Lady pool weekly rotation** (weekdays: after step 2): same lady as yesterday for her shift week; a new week → the lady who was there least in 14 days. Lady shifts limit where a pool lady may go |
| 3 | **Team relief**: the relief list, post's own team only (on Sat / Sun: before step 5, and the weekend list if any) |
| 4 | **Outside team**: the rest of the relief list (outsiders ordered by days at the team's posts) |
| 8 | **Anyone free** (last): a man still free on that shift goes to an empty men's post (not Shift Incharge, R posts, Kidos, Hospital, Ninnakarai, lady posts, Medical Mine). Own team first, PKL / MLCP next, escort last. Respects D |

Order matters: **fill yesterday before today** (daily rotation looks at yesterday).

## 6. Sheet display

- Blocks per section with **A · B · C** side by side; the **G shift** as one block per section, stacked (PKL G, then MLCP G).
- Row order = sheet order (template). R / RG / W posts show a row only when they apply that day.
- Under the sheet: **Week off / Leave**, **Escort** (6 to 5, 9 to 6; none on Sunday), **Day summary** (per shift: total / filled / unfilled + unfilled post names, then TOTAL), **On duty, no post** (free guards; "→ Escort" for C guards).
- Picking a guard by hand: only that shift's guards with no post.

## 7. Weekend

| Rule |
|---|
| Ladies take weekly offs on Sat / Sun → permanent reception posts (MLCP, Medical Mine) get team relief **before** the pool rotation |
| Order when ladies are few: MLCP Reception → North Plaza → Medical Mine → Apricot Reception; Apricot Patrolling = men only |
| Medical Mine weekend cover: the same man Sat and Sun |
| Kidos: no row (W) |
| Sunday: escort men may take posts (picked last); no escort list on the sheet |
| Open: Documents on Saturday when both are off (hide or show empty) |

## 8. Times (Estancia)

| Duty | Shift | Card IN window | Late after | No duty after (decided, not built) |
|---|---|---|---|---|
| A | 06:00 – 15:00 | 05:20 – 06:15 | 06:00 | 06:15 |
| B | 13:00 – 21:00 | 12:30 – 13:15 | 13:00 | 13:15 |
| G | 09:00 – 18:00 | 08:20 – 09:15 | 09:00 | 09:15 |
| C | 21:00 – 06:00 | 20:20 – 21:15 | 21:00 | 21:15 |
| Escort 6 to 5 | 18:00 – 05:00 | 17:20 – 18:15 | 18:00 | 18:15 |
| Escort 9 to 6 | 21:00 – 06:00 | 20:20 – 21:15 | 21:00 | 21:15 |

Live board: Auto moves to a shift when its window opens; "Due" until the shift start, then "Not IN".

## 9. Escorts

See `ESCORT-RULES.md` (E0–E19 + E1b): 6 to 5 = escorts with the coming Sat + Sun off (month-end week with no next roster: fewest 6-to-5 days this month, ties included), 9 to 6 = the other C escorts, Month Roster order, 4 down per duty day, fresh start each Monday, S.No 1…n (n = that week's 6-to-5 count) then n+1…, only C escorts do escort duty. Every shift incharge of the branch sees the escort sheet; only the escort agency's (IPF) changes it.

## 10. How the next app should rebuild the lists every month

1. Upload the new roster → set each guard's **team** from the section heading and the day letters.
2. For each post type (section 4) rebuild the list:
   - Fixed / Team: the sub-group or team members of this month.
   - Option B / Support / Group pair: count **days at that post in last month's published schedules** (any team), drop people not in this branch this month, drop Escort / Ninnakarai / ladies as the type says, keep the top 15–20, then add the 4-month total as a tie-break.
   - Special shift: the person with most days on that shift first.
3. Keep the post's flags (priority digit, D, F, R, W, lady shifts); they are post facts, not names.
4. Show the supervisor a **diff** (who came in, who went out of each list) before saving.
5. Test on the last real day: fill it, compare with the real sheet, show the match %.

## 11. Open / later

- Documents on Saturday (hide or show empty).
- "No duty after the IN window" (with real card swipes).
- Team update from the roster headings on upload (November roster).
- (Dropped: escort start = card IN time, shown to the supervisor; no extra column.)
- Real card system (Gallagher) connection.
