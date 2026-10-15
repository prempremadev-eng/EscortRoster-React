# 🛡️ Post handover, phase 1 (English notes)

Date: 2026-10-15 night · Branch `post-handover`

## Why
Post guards hand over in a WhatsApp group today. Nothing can be searched. The app gives each post a "Taken over" button and a notebook (timeline).

## Decisions
- Shifts: A 06–15, B 14–21, C 21–06, plus new G 09–18.
- Same Catalyst project, a new branch, a new server file `post.js` and a new folder `src/post/`. The escort code is untouched.
- Supervisor phone lives on the branch (`Branches.supervisor_phone`).
- No 5-second polling; a refresh button keeps Data Store reads low.

## New tables
- `DutyLog`: what really happened (waiting → on_duty → handed_over). DutyChart is only the plan.
- `PostMessages`: the post's notebook. A pinned note is shown to the next guard.

## Flow
Card IN → DutyLog "waiting" + notification → Go to my post → Taken over (the old guard is handed over) → timeline → write a note → pin it for the next guard.

## Bugs found
- Catalyst ROWIDs are not in time order → sort by CREATEDTIME.
- A second IN after the chart changed made no DutyLog → now any IN makes it if it is missing.
- varchar is capped at 255 without an error.

## 🗣️ Spoken English practice
- "The incoming guard presses Taken over, and the outgoing guard is handed over automatically."
- "The duty chart is the plan; the duty log is what really happened."
- "Pin this note for the next guard."
- "Row IDs are not in time order, so we sort by created time."
- "I built it on a separate branch so the escort code stays safe."
- "Supervisors need a login before this goes live."
