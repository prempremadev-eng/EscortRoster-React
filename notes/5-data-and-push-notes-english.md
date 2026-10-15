# 🔔 How our data and push notifications work (English notes)

Date: 2026-10-15 (Thursday)

## Why
When a guard swipes the card, their phone should say **"Gate 3 · Shift A"**. We need:
1. **Data**: who, where, which shift, which phone
2. **Push**: a way to reach the phone even when the app is closed

## 1. Data: Catalyst Data Store (7 tables)
The server function forgets everything after each request, so everything lives in the Data Store.

| Table | Holds | Why |
|---|---|---|
| Branches | Beach, Vizag… | Which branch a guard belongs to |
| Guards | Name, ID, phone, guard_token | Who the guard is; the token is their private link |
| Shifts | A 06–15, B 14–21, C 21–06 | Shift times kept in one place |
| Posts | Gate 3, Lobby, Escort | Places in a branch |
| DutyChart | guard + post + shift + week | Who is where this week |
| AccessLog | guard + IN/OUT + time | Card swipes |
| PushSubscriptions | guard + phone address | Which phone gets the notification |

Tables are linked by `ROWID`.

## 2. Push: four pieces
| Piece | Where | Job |
|---|---|---|
| VAPID keys | Settings table | The server's ID card |
| Service worker (`sw.js`) | Phone browser | Shows the notification and opens the page on tap, even when the app is closed |
| `pushManager.subscribe()` | GuardSetup.jsx | Gives the phone's address, saved in PushSubscriptions |
| web-push library | escortAPI function | Sends the message to that address |

## Flow
Setup → card IN → server reads DutyChart → web-push sends to the phone's address → sw.js shows it → tap opens My Post.

## What went wrong today
- Tapping opened the setup page: it was the **test** notification. Fix: its URL now opens the guard page.
- No notification on IN: the IN happened **before** the phone was set up.
- No notification on a second IN: only the **first IN** of the day notifies.

## 🗣️ Spoken English practice
- "The service worker shows the notification even when the app is closed."
- "Each phone's address is saved in the PushSubscriptions table."
- "The server proves who it is with the VAPID keys."
- "Only the first swipe of the day sends a notification."
- "I deleted only one row, using its ROWID."
- "That was the test notification, so it opened the setup page."
