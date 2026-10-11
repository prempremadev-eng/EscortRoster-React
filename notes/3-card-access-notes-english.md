# 🪪 Card Access → Push Notification → Guard Seat Page (Notes – English)

Date: 2026-10-11 (Sunday)
Where: `~/Desktop/EscortRoster-CardAccess` (branch `card-access`), Catalyst project **EscortCardAccess** (`50225000000055071`, Development)

---

## 📖 Story: why this work?

Guards come to duty, **swipe their card**, and then ask the supervisor "Which seat am I?".
Now, as soon as the card shows **IN**, the guard's phone gets a message **by itself**: **"✅ IN 19:42 · Today your Seat 5"**. Tapping it opens their seat page.

🍽️ **Hotel story:** a customer signs the register at the hotel gate. Right away an SMS says "Your table is number 5". No need to ask the waiter!

We have no permission for the real card database yet, so we built it with a **dummy** card machine (the **Card Simulator**). Later the real system will use the same **"door"** (`/addAccessLog`), and nothing else changes.

---

## 🔄 Full flow

| # | What happens | Where |
|---|---|---|
| 1 | Card swipe (for now, a Simulator button) | `#simulator` → `POST /addAccessLog` |
| 2 | The swipe is saved in the register | `AccessLog` table |
| 3 | **First IN** of the day → work out the seat → send a push | `onCardIn()` + `seats.js` |
| 4 | The phone shows the message in the background | `sw.js` (service worker) |
| 5 | Tap → seat page | `#guard/<token>` → `GET /guardDay` |
| 6 | Supervisor sheet shows ✅ 19:42 / ⏳ | `/getDayData` + `DutyTable.jsx` |

---

## 1️⃣ Tables

| Table / column | Why |
|---|---|
| `AccessLog` (escort_id, direction, punch_time, duty_date, source) | The gate register. `source` = SIMULATOR / REAL / TEST |
| `PushSubscriptions` (escort_id, subscription_json, device) | The phone's **address**. A guard with 2 phones has 2 rows |
| `Escorts.guard_token` (unique) | The **secret** link. A ROWID can be guessed; a token can't |
| `duty_date` | A swipe at 01:30 AM belongs to the **previous day's** duty (08:00 rule) |

---

## 2️⃣ Push notifications: 4 new words

| Word | Hotel story | What it is |
|---|---|---|
| **Service worker** | Night watchman 🌙 | Waits in the phone's background and shows the message, even when the app is closed |
| **Subscription** | Customer's address 🏠 | The phone's push address. You get it when the user taps "Allow" |
| **VAPID keys** | Hotel's official seal 🔏 | Lets Google / Apple / Mozilla trust that the message really comes from us |
| **Manifest** | The app's ID card 🪪 | Name, icon, colour. iPhone needs it for the Home Screen |

**Where is the VAPID private key?** In the `Settings` table. `catalyst-config.json` goes into git, and our GitHub repo is **public**, so everyone could read it ❌

---

## 3️⃣ Rules

| Rule | Why |
|---|---|
| Only the **first IN** sends a notification | Coming back from a tea break doesn't ring again (no spam) |
| The swipe is **saved even if the push fails** | The register matters more than the SMS |
| Time = **server** time (IST), not the phone's | A wrong phone clock can't break it |
| Guard page 🔒 until card IN, locks itself at **08:00** | People not on duty can't see it |
| Guards not IN show as **EMPTY**; their names are not sent | Seats don't move + privacy |
| Sat / Sun → no seat ("Your card IN is noted.") | Saturday is leave, Sunday is the pickup sheet |
| `?date=` test trick works **only on localhost** | Nobody can cheat on the internet |
| Server seat logic = a copy of the frontend (`seats.js`) | **Change both together** |

---

## 🐞 Bugs and fixes

| Bug | Cause | Fix |
|---|---|---|
| MCP `Create_Column` → `PATTERN_NOT_MATCHED` | Many columns in one call | One column per call |
| `localhost` → 502 after a build | `npm run build` empties `client/`, which confuses a running serve | **Restart** serve |
| `Invalid raw ECDSA P-256 public key` | The key has 87 characters but `setting_value` held only **50**, so it was silently cut ✂️ | Column → 255 + a key length check |
| Ctrl + C didn't work | **Ctrl + Z** had been pressed earlier, so serve was **paused** (`T`) | `kill -9 PID` |
| `.webmanifest` served as `octet-stream` | Catalyst doesn't know that extension | Renamed to `manifest.json` |

---

## 🐧 New Linux commands

| Command | Job |
|---|---|
| `pgrep -af "catalyst serve"` | Is serve running? What is its PID? |
| `ss -ltnp \| grep 300` | Which port is it on? |
| `kill PID` / `kill -9 PID` | Stop it / force it to stop |
| Ctrl + C ✅ / Ctrl + Z ⏸️ | Close / pause |

---

## ✅ Tested

| Test | Result |
|---|---|
| Laptop (Firefox): setup, test push, IN push, 2nd IN skipped | ✅ |
| Laptop (Chrome): install the app, close + reopen → My Seat | ✅ |
| **Android** (deployed): QR → Allow → IN push (app closed) → tap → My Seat | ✅ |
| iPhone | ⏳ when we can borrow one |

**Pending:** iPhone test → merge into the live project (on live: `setting_value` → 255 + the new tables).

---

## 🗣️ Spoken English practice

Read these aloud, slowly, three times each:

1. "When a guard's card shows IN, their phone gets a notification with their seat."
2. "We used a card simulator because we don't have access to the real card system yet."
3. "Only the first swipe of the day sends a notification, so the phone doesn't keep ringing."
4. "The service worker shows the message even when the app is closed."
5. "We kept the private key in the database, because our code is on a public GitHub repo."
6. "The key was cut short because the column was too small, and there was no error."
7. "I pressed Control Z by mistake, so the server was paused, not stopped."
8. "Could you lend me your iPhone for five minutes? I'd like to test a notification."

**Interview-style answer (practice saying this):**
> "I built a feature that sends a push notification to a guard's phone as soon as their access card shows IN. The message tells them their seat for the day, and tapping it opens a page with the full seat list. Since we didn't have access to the real card system yet, I built a simulator that writes to the same endpoint the real system will use later. I used standard Web Push with a service worker, so it's free and works on Android and iPhone."

---

## ✅ Recall questions

1. What are the 6 steps from card swipe to seat page?
2. Why does only the first IN send a notification?
3. What is a service worker? Explain it with the hotel story.
4. Why is the VAPID private key in `Settings` and not in `catalyst-config.json`?
5. Why did the key get cut, and why was it hard to notice?
6. Why do guards who are not IN show as EMPTY instead of moving up?
7. What's the difference between Ctrl + C and Ctrl + Z? How do you stop a paused process?
8. Why does iPhone need "Add to Home Screen"?
