# Day summary: 19 Oct 2026 (Monday)

Time: 09:15 → 23:02 (about 13 h 45 min, breaks not logged). Branch: `post-handover`. Mode: build now, learn later.
Main topic: **Schedule ⚡ Auto fill**, rule by rule, from the old WhatsApp schedule history (22 Jun – 19 Oct). Full rule book: `notes/AUTO-FILL-RULES.md`.

## What we did

| # | Work | Result |
|---|---|---|
| 1 | First posts on Auto fill | Shift Incharge, Documents, PKL Main Gate / Vehicle Movement / Patrolling-1 / Patrolling-2, Kidos ×2: tested on 19 Oct |
| 2 | "Senior" in relief lists | Prem's choice: **most days at the team's posts**, not P-code seniority |
| 3 | PKL relief lists | Outside guards who covered PKL added; all lists sorted by PKL days |
| 4 | Medical Mine Reception | 3 ladies + 2 men weekend cover (history: same man Sat + Sun) |
| 5 | MLCP Reception | 3 ladies; off-day cover from the lady pool first, MLCP men after |
| 6 | **Rule 5 · Weekly rotation** | Lady pool posts (North Plaza Reception, Apricot Reception, Apricot Patrolling): same post as yesterday for the shift week, else fewest days there. 114 history rows (5–17 Oct) loaded |
| 7 | **Rule 6 · Weekend list** | Separate Sat / Sun list after `;` in the relief list. Apricot Patrolling weekend = men only; North Plaza / Apricot Reception = ladies first, then men |
| 8 | **Rule 7 · Weekend order** | On Sat / Sun the permanent lady posts (MLCP, Medical Mine) get team relief before Rule 5 |
| 9 | All 56 posts on | Remaining 43 posts set by one rule: regular = 30+ days and half of own duties at that post; relief = most days there (top 25) |
| 10 | **Rule 8 · Anyone free** | Last step: an empty slot at a rotation post gets any free guard on that shift |
| 11 | VTitan | History: never on weekdays, only 10 of 33 weekend days → removed from the schedule |
| 12 | Tests | Mon 19: 149 / 154 · Sat 24: 138 / 154 · Sun 25: 138 / 152 (history averages ~151 / ~144 / ~143) |

## Errors and how they were fixed

| Error | Cause | Fix |
|---|---|---|
| Direct Catalyst query said INVALID_ORG | Wrong MCP server for this org | Used the Catalyst plugin's `executeTool` |
| First MLCP Reception update went to North Plaza Reception | Wrong ROWID | Reverted in seconds, then updated the right post |
| MLCP Reception would pick men first | Regulars also in the relief list changed the post's team | Removed the regulars from the relief list |
| Lady at Apricot Patrolling on Saturday | Old draft rows; **Clear day** was not pressed | Clear day, then Auto fill |
| MLCP Reception C got a man on Saturday | Rule 5 took the free lady for North Plaza first | Rule 7: permanent posts first on weekends |
| 24 empty slots on Mon 19 | Top 25 of each list were busy elsewhere | Rule 8: anyone free |
| Same guard at a different post than the real sheet | Supervisor rotates daily (only ~30% stay at the same post) | Accepted: the right people come; the supervisor moves posts by hand |
| Bulk update stopped half way | Safety check wanted a clear OK for 43 shared posts | Prem said "A, batch 2 um pannunga" |
| Screenshots show only half the page | Big table | From now: type **"done"** and Claude reads the Data Store |

## Honest rating (build-now day, so learning parts are low on purpose)

| Area | Rating | Why |
|---|---|---|
| Concept | 7/10 | Understood each rule from history (rotation, weekend cover, weekend order, anyone free); did not read the code |
| Debugging | 8/10 | Spotted wrong ladies / men, MLCP C, VTitan on a weekday, PKL Patrolling-2 empty, from his own knowledge of the site |
| Recall | – | No quiz today |
| Typing | – | No code typed (auto build) |
| Effort | 9/10 | ~14 hours, many careful tests, quick clear decisions |
| Overall | 8/10 | Two days of Auto fill work finished: all posts, weekday and weekend |

## Next

1. Show the rule book to sir; collect any changes.
2. Supervisor tries one real day: Auto fill → fix by hand → Publish.
3. Maybe later: grades (A / B / C) for the PKL relief list.
4. Still pending: iPhone notification test, notes for 16–18 Oct, vehicle app join, merge to live.
