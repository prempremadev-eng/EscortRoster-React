# Day summary: 17 Oct 2026 (Saturday)

Time: ~12:11 → 00:29 (about 12 hours, breaks not logged). Branch: `post-handover`. Mode: build now, learn later.

## What we did

| # | Work | Result |
|---|---|---|
| 1 | Notifications blocked on a phone | Step-by-step unblock help (Android / iPhone), "Check again" button, tells apart "Chrome hid the question" from a real block |
| 2 | **Login** | Catalyst embedded login for every page except the guard links. Public sign-up off |
| 3 | **6 roles** | Super Admin, Admin, City Admin, Branch Admin, Supervisor (one branch + one agency), Guard (secret link). Server checks the area on every call |
| 4 | Owner protection | The first Super Admin can never be edited or switched off |
| 5 | **Admin page** | Tabs in making order: States → Cities → Branches → Agencies → Users |
| 6 | Agencies | Name + the branches they work in; posts, guards and supervisors pick only those |
| 7 | Posts | Agency, 🚗 vehicle entry tick, post name unique in the whole app |
| 8 | Guards | Card number, photo, Created by / last change, guard name unique, details only (no IN / OUT) |
| 9 | Style | Small On/Off switches and ✏️ icons in every table, S.No |
| 10 | Fresh data | Old test data wiped; Tamilnadu → Chennai → Estansia; BSS, IPF, ISS; **53 IPF posts** from the 18-10 roster image (6 with car app); **208 IPF guards** from four roster images |
| 11 | Supervisors | 3 dummy supervisors; Prem added one real supervisor himself; supervisor login tested: sees only Estansia IPF posts, no Admin |
| 12 | Monthly roster file | Read `IPF-Oct-2026 Monthly Schedule.xlsx`: 214 staff, P code, VEN-IP code, phone, area, A/B/C/G/O/L per day |

## Errors and how they were fixed

| Error | Cause | Fix |
|---|---|---|
| Catalyst MCP blocked (Enable_Authentication, Create_Table) | Auto mode needs an allow rule, not a chat OK | Prem added two allow rules with `/permissions` |
| Login box showed no password field | Invite not accepted yet (`is_confirmed: false`) | Opened the invite from Zoho Mail → Notification folder |
| "Invite mail failed: Duplicate value for Email ID" | Catalyst said "already exists" in other words | Treat "duplicate" as already invited |
| Agency dropdown looked empty in Guards | Agency waits for the branch | Branch is picked first; with one branch it is pre-picked |

## Honest rating (build-now day, so learning parts are low on purpose)

| Area | Rating | Why |
|---|---|---|
| Concept | 6/10 | Understood roles, owner protection, State → City → Branch, unique names; did not study the code |
| Debugging | 7/10 | Found the hidden Chrome prompt, the Notification folder and the invite issue with screenshots |
| Recall | – | No quiz today |
| Typing | – | No code typed today (auto build) |
| Effort | 9/10 | 12 hours, clear decisions, real data from the agency |
| Overall | 7.5/10 | Big product step: the app now has real login, roles and real IPF data |

## Next (18 Oct)

1. Guards update from the monthly file: ID = P code, card = VEN-IP code (to confirm), phone, area; add the 3 new people; ask about the one guard not in the file.
2. Month Roster screen: upload the monthly Excel, shift per guard per day (A/B/C/G/O/L).
3. Escort section (49) → escort duty.
4. Notes still pending for 16 Oct (breaks, history, supervisor screens) and for today's login topic.
