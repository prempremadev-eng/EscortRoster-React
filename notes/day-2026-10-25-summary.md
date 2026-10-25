# Day summary: 25 Oct 2026 (Sunday, till 00:40 on 26 Oct)

Time: 08:50 → 00:40 (lunch 14:06–14:45). Branch: `post-handover`. Mode: build now, learn later.
Main topics: **roles and agency privacy**, **escort rules (E1b)**, **post setup made simple**, **ISI test setup**,
**schedule by Excel**, then a long **phone (WhatsApp-like) pass** on the office chat and the guard page.

## What we did

| # | Work | Result |
|---|---|---|
| 1 | Agency privacy | Every page has an agency picker for Branch Admin and above; no guard goes to another agency's post |
| 2 | Escort | E1b (month-end week: fewest 6-to-5 days); escort sheet view only for other agencies of the branch; escort table on Schedule only for the agency with escorts |
| 3 | Escort 403 bug | `Number()` rounded 17-digit ROWIDs, so every escort read failed; ROWIDs kept as text |
| 4 | Post setup | Branch → Agency → Name → Shifts A/B/C/G → vehicle entry; Type / Section / Row / Auto fill removed |
| 5 | G on demand | Schedule "G TODAY → Post" puts a free G guard on any post for one day |
| 6 | Places | 5 Tamilnadu cities, 3 Kumbakonam branches |
| 7 | ISI test | 15 dummy guards, rosters, 6 posts; Excel for 26 Oct on the Desktop |
| 8 | Schedule by Excel | 📥 Template and 📤 Upload |
| 9 | Card simulator | Branch, agency, name / ID and IN filters |
| 10 | Phone menu | ☰ bar on phones; Live board with NEEDS ATTENTION first |
| 11 | Posts like WhatsApp | List or chat, ← back, phone Back, compact head (📍 branch · agency, 🔍, ↻), reload keeps the chat |
| 12 | Office chat = guard page | Same message box (+, 📎, 📷, 🎤), work update and vehicle entry from the office, sender role on messages, 📞 Safety sheet, break card, works strip, Duty history |
| 13 | Voice like WhatsApp | Play button with bars; hold to record (slide to cancel) or touch once (🗑 / Pause / ➤) |
| 14 | Swipe to reply | Text, media and work cards, guard and office |
| 15 | Privacy | "Who was at this post" only for Branch Admin and above |
| 16 | Duty history | Office works counted in the shift at that minute; table with 🔧 / 🚨; sticky Date column on phones; reload stays there |
| 17 | App QR | Admin page 📱 App QR (sign-in link, no secret) |

## Errors and how they were found

| Error | Cause | Fix |
|---|---|---|
| Escort page 403 for other agencies | `Number('50225000000094413')` → …94420 | Keep ROWIDs as text (found in the access logs) |
| Mic touch opened the camera | Mic button gone before the phone's click; camera took its place | Hide the box at once; swallow that one click |
| History table showed nothing on a phone | My card layout CSS | Table back, then sticky Date column like the escort sheet |
| Back button in the chat | Relied on browser history only | ← closes at once; Back closes the top screen first |
| My mistake | I told the wrong clock time several times (said 01:20 when it was 00:40) | Check `date` before saying the time |

## Honest rating

| Area | Rating | Why |
|---|---|---|
| Concept | 9/10 | Clear rules: agency privacy, who sees "who was at the post", office = guard view |
| Debugging | 8/10 | Logs and screenshots found the ROWID and ghost-click bugs fast |
| Recall | 7/10 | Long day, many features; quiz tomorrow on the role rules |
| Typing | — | Build-now mode, Claude typed |
| Effort | 10/10 | Nearly 16 hours |
| Overall | 8.5/10 | Big step for the Monday demo; phone testing still to do |

## Next

1. Test on the phone: chat back, compact head, mic touch, 📞 sheet, swipe reply, history table.
2. ISI test: upload the 26 Oct Excel, publish, guard links, card IN.
3. Monday demo plan (audience, language).
4. Later: profile photos (needs OK for `UserRoles.photo_key`), Build 4–7.
