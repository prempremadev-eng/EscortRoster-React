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

## Other

| Rail | For |
|---|---|
| Guards | Guard Master (add / edit guards) |
| Admin | Users, branches, agencies (branch admin and above) |
| ▴ / ▾ on Schedule | Hide the buttons for a bigger sheet |
| 🖨️ Print | The sheet + Day summary + free guards on paper / PDF |
