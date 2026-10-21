# 🚗 Escort rules (decided with Prem, 21 Oct 2026)

Names stay out of git. Checked against the real sheets of 01-10 and 02-10 and the October Month Roster.

## Decided

| Rule | What |
|---|---|
| **E0 · Source** | No weekly Excel any more. Escorts come from the **Month Roster** (escort section). Name, phone, ID and agency are already in **Guards** (Guard Master). Excel ID `1234` = app ID `P01234` (example) |
| **E1 · 6-to-5 batch** | Escorts whose **coming Sat + Sun are both OFF** in the Month Roster |
| **E2 · Order** | **Month Roster escort order** (the order in the uploaded roster), not A–Z |
| **E3 · 9-to-6 batch** | The other escorts on **C** that day, in roster order. Supervisor may add extra people at the end |
| **E4 · Two separate lists** | 6-to-5 and 9-to-6 each have their own S.No and their own rotation |
| **E5 · Rotation** | Every duty day each escort moves **4 down** inside their own list (past the end → back to the top). Sat and Sun are not counted |
| **E6 · Restart** | **Every Monday** a fresh start: that week's Sat + Sun off → 6-to-5, roster order again (Day 0) |
| **E7 · New month** | Fresh start from the new roster. **Day 0 = the first day the whole 6-to-5 batch is on C** (like the real sheet: on 01-10 half the batch was on A/G posts, so 02-10 was Day 0). If the 1st is Sat/Sun → Monday |
| **E8 · Card IN** | Escort taps card → notification "Your S.No: N" → opens the Escort page → can write **only their own row** (other rows locked) |
| **E9 · Leave mid-week** | The escort's **row stays empty** that day; nobody else's S.No changes (rotation not disturbed). The empty row shows as unfilled and the **supervisor may put an extra person** there with the picker (a 6-to-5 row has a support point) |
| **E10 · Who does escort duty** | **Only escorts on C** that day (Prem, 21 Oct). An escort whose roster says **A / B / G** works a **post** like anyone else (Auto fill uses them; PKL / MLCP men are still picked first). The 6-to-5 batch also needs C that day. Sunday: all escorts may take posts |
| **E11 · Who writes the trips** | The **escort writes** their own Route 1–4 (Location · Out · In) after card IN, only on their own row; the **supervisor can correct** any row |
| **E12 · Trip details** | The trip popup (cab number, driver, employee stops: Emp ID, location, pickup / drop, time) **stays exactly as it is** — the escort fills it for every trip. No changes |
| **E13 · Everything else** | The rest of the Escort sheet **stays exactly as it is** (Saturday leave, Sunday pickup sheet, extra today-only rows, remarks, print, dashboard). Don't touch it (Prem, 21 Oct) |
| **E14 · Sunday** | The Schedule page shows **no escort list on Sunday** (escorts take posts that day) |
| **E15 · Numbering** | One running S.No like the real sheet: **6 to 5 = 1 … 12** (12 rows even if fewer, 12 support points), **9 to 6 carries on from 13**. Each list still turns 4 down on its own |
| **E16 · Extra escort for a day** | Schedule page → ON DUTY, NO POST → **→ Escort** (only guards on **C** that day): that guard (any team) goes to the **end of 9 to 6** for the day with the next S.No; his card IN gives his seat and his own row on the guard page. ✕ on his escort row removes him. **That day only** (Prem: next day he is back to the normal rules; tap again if needed). Saved as EscortDay.support_point = `Extra 9 to 6` (no new table). The escort sheet's "+ Add Extra" stays for people outside the app (no notification) |

## Seen in the real sheets (to confirm)

- 6-to-5 is always **12** people (12 support points: ERT Booth 1–3, Tower Main Gate, Smoking Zone, Lancor 2, North Plaza, MLCP Main Gate, MD House, PKL, PKL 1, Potheri).
- Schedule page Escort table is sorted A–Z now → should follow roster order (E2).

## Built (21 Oct evening)

- `functions/escortAPI/escortRoster.js` → `escortDay(date)`: 6-to-5 / 9-to-6 lists from the Month Roster with today's seats (E1–E7, E9, E10). Checked offline: 02-10 and 21-10 6-to-5 match the real sheets.
- Escort Duty Sheet (supervisor): on a roster weekday two tables **6 to 5** and **9 to 6**, S.No = seat, details from Guard Master (read-only there), no Monday Excel prompt, no Add Escort / remove. Sat, Sun and dates without a roster: old sheet.
- Schedule page Escort table: same lists and seat numbers.
- Card IN: "Today your Seat N · Escort 6 to 5 · Shift C". Guard page: their own list, only their row writable; trips saved with the roster seat.
- Each guard on escort duty gets an Escorts row the first time (linked by Guards.escort_id); trips are kept per Escorts row.
- Open: the real 21-10 sheet shows 9-to-6 in roster order (not rotated); the app rotates both lists (E5) until Prem decides.

## Later

- Sunday C men leave a post around 3 AM Monday for 1–2 pick-up trips: the Sunday pickup sheet stays as it is for now (E13).
