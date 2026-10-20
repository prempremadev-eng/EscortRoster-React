# Day summary: 20 Oct 2026 (Tuesday)

Time: 09:15 → 23:36 (about 14 h 20 min, breaks not logged). Branch: `post-handover`. Mode: build now, learn later.
Main topic: **Auto fill, post by post**: each group's own people as regulars, then "option B" (who really worked the post in October) for rotation posts. Full rule book: `notes/AUTO-FILL-RULES.md`. Names are kept only in the private folder (outside git).

## What we did

| # | Work | Result |
|---|---|---|
| 1 | Step-by-step restart | Each group's own people first: PKL Core Team, lady pool, Ninnakarai, Hospital |
| 2 | PKL Core Team | Main Gate, Vehicle Movement, Patrolling-1 regulars from history (first in list = first choice) |
| 3 | Lady pool split | North Plaza 3 + Apricot 6; **B shift**: Apricot Patrolling lady goes to Kitchen-2, a man covers Apricot Patrolling |
| 4 | Lady shifts code | 3rd `;` part of the relief list limits the lady rotation to those shifts |
| 5 | Ninnakarai + Hospital | Roster team as regulars; Hospital Lift + Rear Side left for later |
| 6 | Teams change monthly | PKL / MLCP / Escort (and Ninnakarai) move every month; PKL sub-groups stay |
| 7 | **Option B** | Rotation posts: most October days at that post (any team), then 4-month total; Escort out Mon–Sat; a 1–2 week stint is not a regular |
| 8 | MLCP posts | Main Gate-1/2, Car Parking-1/2/3, ERT, Basement-1/2, Terrace, Rear Exit, CCTV (roster row added from history) |
| 9 | Lancor | One Lancor team for BKE, Car Parking, Vendor Entrance; Boarding Exit, Parking-1, Waiting Hall, Kitchen-1, Smoking Zone = option B |
| 10 | **Rule 10 · Daily rotation (D)** | Same guard never at a hot / hard post two days running |
| 11 | North Plaza GF1 + CWE Play Ground | Important posts; GF1 needs pass-system knowledge; filled first |
| 12 | Last 11 PKL-others posts | Option B + daily rotation → **53 posts on**, 2 off (Hospital Lift, Rear Side) |
| 13 | Test Tue 20 | 133 / 153 filled |
| 14 | **Fill order ≠ sheet order** | Prem: the sheet must keep the template order the guards know. Code now reads a fill-priority digit from the 4th `;` part; sort_order is only for the sheet (deployed, `e4c51b2`) |

## Errors and how they were found

| Error | Cause | Status |
|---|---|---|
| Medical Mine Reception jumped to the top of the sheet | Fill priority was put in `sort_order`, which also sets the sheet order | Code fixed + deployed; **data (sort_order 12 / 15 / 21 + digits) waits for MCP** |
| 16 repeats on daily-rotation posts (Mon 19 → Tue 20) | Probably Tue was filled before Mon was complete (D only looks at yesterday) | **Test tomorrow**: Tue 20 → Clear day → Auto fill |
| CWE Play Ground A empty on Tue 20 | Not checked yet (list people busy / not on A / rested) | Check tomorrow |
| Catalyst MCP: every query failed | Zoho side (connection up, execute blocked); `/mcp` reconnect did not help | Try again tomorrow |
| Reconnected the wrong MCP first | Two servers: `zoho-catalyst` (other account) and `plugin:catalyst-by-zoho` | Learned which one is ours |

## Honest rating (build-now day, so learning parts are low on purpose)

| Area | Rating | Why |
|---|---|---|
| Concept | 8/10 | Clear thinking on teams changing monthly, option B, daily rotation, and why the sheet order must stay the same for the guards |
| Debugging | 8/10 | Spotted the sheet order change from a screenshot by himself |
| Recall | – | No quiz today |
| Typing | – | No code typed (auto build) |
| Effort | 9/10 | ~14 hours, post-by-post decisions for 53 posts |
| Overall | 8/10 | Almost every post has a rule now; one test and one data fix left |

## Next

1. MCP check first. Then Posts data: sort_order Play Ground 12, GF1 15, Medical Mine 21; fill digits Medical Mine `1`, GF1 `1`, Play Ground `2D`.
2. Daily rotation test: Tue 20 → Clear day → Auto fill → check the 16 repeats.
3. Why CWE Play Ground A was empty.
4. Phase 2: Hospital Lift / Rear Side, Ninnakarai short slots, Shift Incharge Tue–Thu gap, spare people.
5. Escort section. Open questions: CP-1 G Mon–Fri only? Escort roster shift on weekdays? Confirm popup on name change?
6. Later: separate self-adjusting schedule project.
