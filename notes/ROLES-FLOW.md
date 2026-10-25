# 👥 Roles and flow (fresh start, with Prem, 23 Oct 2026)

The app is close to finished and will be sold, so roles are set again from the bottom up:
guard → supervisor → branch admin → … Names of real people stay out of this file (public repo).

## Guard (done)

- Secret link, no login. Card IN opens their post or escort seat; vehicle entry on vehicle posts.

## Supervisor (one branch, one agency)

| # | Work | When | In the app now |
|---|---|---|---|
| 1 | Upload the month roster | Once a month | ✅ |
| 2 | Put names in the schedule (Auto fill + changes) and Publish | Every day | ✅ |
| 3 | Create posts | When needed | **Not now** (Prem, 23 Oct): stays with the Branch Admin. Later maybe: supervisor *requests* a post → ⏳ pending → Branch Admin approves / rejects (with a notification both ways) |
| 4 | Add guards | New person | ✅ |
| 5 | Read guard messages; send important problems to the Branch Admin | Always | ⚠️ reading ✅, **forward to Branch Admin missing** |
| 6 | Shift report to the Branch Admin: posts A / B / C / G, IN, late, absent, leave, off, vacant | Every shift | ⚠️ Report page ✅, **sending missing** |

### Shift report timing (decided)

| Shift | Start | Late after | Report to Branch Admin |
|---|---|---|---|
| A | 06:00 | 06:15 | **06:30** |
| G | 09:00 | 09:15 | **09:30** |
| B | 13:00 | 13:15 | **13:30** |
| C | 21:00 | 21:15 | **21:30** |

- **Who sends (1-c):** at start + 30 min the app makes the report ready; the supervisor checks it, can add a note and taps **Send**. Not sent by start + 45 min → the app sends it by itself.
- **Several agencies in a branch (2-b):** the Branch Admin gets **one combined report**, split by agency.
- **How it arrives (3-a):** app notification + the Report page (WhatsApp / email later, if wanted).
- Same pattern for every supervisor (each for their own agency).

## Report chain (decided 23 Oct)

```
Supervisor (branch + agency) → Branch Admin (branch) → City Admin (city) → State Admin (state, NEW) → Admin (all)
```

- **Every shift** the report goes all the way up (Prem: who did not come and today's count are the main thing; the upper levels know the planned strength already and only track plan vs actual).
- **State Admin is added** between City Admin and Admin (Branches already have a state).
- **The app adds the reports up** — nobody adds by hand: one combined message per shift for each level (Branch Admin: agencies of the branch; City Admin: branches of the city; State Admin: cities; Admin: states). A tap opens the detail.
- Supervisor checks and taps Send (start + 30 min; the app sends by itself at + 45 min). Above the supervisor **the app forwards by itself** (about start + 45 min); a Branch Admin may add a note before that. Nobody else has to press Send.
- Each report: posts A / B / C / G, planned, IN, late, absent, leave, off, vacant, notes / problems.

## Who may change what (decided 23 Oct)

| Thing | Supervisor | Branch Admin | City / State / Admin |
|---|---|---|---|
| Schedule changes, Publish | ✅ | ✅ | 👀 view only |
| Month roster upload | ✅ | ✅ | 👀 view only |
| Guards add / remove | ✅ | ✅ | 👀 view only |
| Posts create / edit | ❌ (later: request → approval) | ✅ | 👀 view only |
| Vehicle entry: new entry / OUT | ✅ | ✅ | 👀 view only |
| Vehicle entry: correct / delete | ❌ | ✅ (delete only here) | 👀 view only |

The doing is done by Supervisor + Branch Admin; the levels above watch and track.

## New customer setup (decided 23 Oct)

| Who | Sets up |
|---|---|
| Admin | Branch (site, city, state), agencies, the Branch Admin user |
| Branch Admin | Posts and shifts, Supervisor users |
| Supervisor | Guards (Excel), month roster, guard links |

## Build order (next)

1. ✅ State Admin role (UserRoles.state, 24 Oct) · 2. ✅ City / State Admin view only, Admin only setup (server refuses other changes; Super Admin may do all) · 3. ✅ Vehicle delete for Branch Admin (🗑 on the Vehicles page) · Branches / agencies now saved by Admin only ·
4. Shift report Send (+45 min auto) · 5. Report chain with app totals and notifications ·
6. Forward a guard message to the Branch Admin · 7. Check the setup rights above.

## 25 Oct changes

| Thing | Now |
|---|---|
| Supervisor logins | Personal logins deleted (Prem); **one login per agency per branch**: "IPF / ISS / BSS Shift Incharge". Shared office computer → one Chrome profile per agency |
| Who is a shift incharge | **Guards page → add / ✏️ edit → ⭐ This guard is a shift incharge** (or Admin → Agencies → Shift incharges); saved in `Agencies.incharge_ids`; ⭐ badge + filter on the Guards page; IPF = 4 guards. Used by Auto fill, Schedule, Live board. (Before: supervisor login names matched to guard names) |
| Escort sheet | All shift incharges see it; only the escort agency's changes it |
| Users page | Tree (All India → state → city → branch); **role first** in the form, then only the boxes that role needs; **email can be changed** (invite to the new one); **🗑 delete a login** (past work stays) |
| State Admin | Built (UserRoles.state) |
| Report chain names | Prem's idea (to confirm): Security Manager → Security Admin → State Admin → … → agency supervisor |

## Daily flow per agency (decided 25 Oct)

- **Each agency (IPF, ISS, BSS) uploads its own Month Roster** and **corrects and publishes its own schedule**. The app already keeps them apart: a shift incharge login touches only its agency's guards (roster) and posts (schedule, Clear, Publish).
- Roster rows of a guard missing from the Guards master (or of another agency) are skipped on upload.
- **One escort page for all of Estancia**: every shift incharge sees it, the escort agency (IPF) changes it.

## Agency privacy (25 Oct)

- A supervisor (agency login) sees only their agency's guards, posts, roster rows, schedule, live board, reports, history and vehicles (incl. "seen before" suggestions).
- The **escort sheet** is the only shared page, and only inside the same branch (a login whose branch has no Escort team gets "No escort duty in your branch"); only the escort agency changes it.

## Next to discuss

- Branch Admin: daily work, what they see, what they approve.
- City / Admin / Super Admin, then new-customer setup flow.
- Who may edit or delete (vehicle entries, schedule).
