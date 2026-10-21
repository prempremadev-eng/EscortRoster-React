# Day summary: 21 Oct 2026 (Wednesday)

Time: 09:11 → 23:01 (about 13 h 50 min, breaks not logged). Branch: `post-handover`. Mode: build now, learn later.
Main topics: **Auto fill tuning** against the real sheets, **supervisor flow**, **escort duty from the Month Roster**, and the **first full card test** (post + escort) with the Card Simulator. Rule books: `notes/AUTO-FILL-RULES.md`, `notes/ESCORT-RULES.md`, `notes/SUPERVISOR-FLOW.md`.

## What we did

| # | Work | Result |
|---|---|---|
| 1 | Data fixes without the MCP (it failed all day) | Catalyst CLI `ds:export` / `ds:import` used instead; template sheet order restored, fill priority digits set |
| 2 | Daily rotation test | 0 repeats once yesterday was filled first |
| 3 | Rule 8 | Free men fill empty men's posts on every shift; Sunday escorts too (escort last) |
| 4 | Schedule page | Day summary, "On duty, no post", step strip 1–5, picker = that shift's free guards only, G shift as one block per section |
| 5 | Navigation | Rail and top bar in work order (1 Roster · 2 Schedule · 3 Live · 4 Posts), Roster inside the supervisor frame |
| 6 | Real sheet 21-10 vs app | Same posts; differences were day changes. New: MLCP Shift Incharge (G), Hospital Lift + Rear Side on |
| 7 | New flags | `R` / `RG` (row only when the person works that shift), `W` (weekdays only: Kidos), `F` (never empty: Lancor Car Parking, MLCP Basement-1, MLCP Car Parking-1) |
| 8 | Escort rules E0–E17 | From the Month Roster: 6 to 5 (Sat+Sun off, 1–12), 9 to 6 (13+), weekly rotation from Monday, Day 0 like the real sheet, only C escorts, → Escort for a day, Sunday no list |
| 9 | Escort sheet | Built on the roster: two lists, details from Guard Master, no Monday Excel, ‹ date ›, bigger names |
| 10 | Dashboard | Tap a guard → their trip history |
| 11 | Escort phone | Your seat → 5 rules → Start duty → own row |
| 12 | Card test | Post guard: Schedule → Publish → IN → post → Taken over → Live board → OUT ✅. Escort: IN → Seat 40 → rules → own row ✅ |
| 13 | Public repo check | No phones / IDs / keys; a few names in old notes replaced with Guard A, B… (old history still has them) |

## Errors and how they were found

| Error | Cause | Fix |
|---|---|---|
| Medical Mine at the top of the sheet | Fill priority was in sort_order | Digit in relief_guards part 4; sheet order back to template |
| MCP executeTool failed | Zoho side | Catalyst CLI bulk read / write |
| CLI import failed twice | Mandatory branch_id; same file name in the bucket (409) | Full rows; new file name each time |
| Extra B guard on 21st | Roster changed C → B by hand | Prem changed it back |
| "GUARD" names in the escort table | Old app version still open in Firefox | Ctrl+Shift+R after a deploy |
| My mistakes | A guess that a free escort would get a post (no empty slot); one real name and one ID written into public notes | Said so; cleaned the notes |

## Honest rating (build-now day, so learning parts are low on purpose)

| Area | Rating | Why |
|---|---|---|
| Concept | 9/10 | Clear rules for escorts from the real sheets (Sat+Sun off batch, roster order, 12 support points, only C) |
| Debugging | 9/10 | Spotted the sheet order change, the extra B guard, the Escort button on A shift, the old Firefox page |
| Recall | – | No quiz today |
| Typing | – | No code typed (auto build) |
| Effort | 9/10 | ~14 hours, two full end-to-end tests |
| Overall | 9/10 | Posts and escorts both run from one Month Roster now |

## Next

1. 9 to 6 rotation: real sheet looks unrotated, app rotates (decide).
2. Documents on Saturday (hide or show empty).
3. iPhone notification test (Add to Home Screen).
4. Real access card system: get the software name, data access way, and IT permission.
5. Escort "Start duty" on the server (needs a column, Prem's OK); 5 rules text in Tamil?
6. Clean post rules spec → plan the separate app. Decide on making the GitHub repo private.
