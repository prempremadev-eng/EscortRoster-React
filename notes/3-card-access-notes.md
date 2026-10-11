# 🪪 Card Access → Push Notification → Guard Seat Page (Notes)

Date: 2026-10-11 (Sunday)
Where: `~/Desktop/EscortRoster-CardAccess` (branch `card-access`), Catalyst project **EscortCardAccess** (`50225000000055071`, Development)

---

## 📖 Story: en indha velai?

Guard duty-ku vandhu **card swipe** panraanga. Apram supervisor kitta "en seat enna?" nu kekkuraanga.
Ippo: card **IN** aanadhum guard phone-ku **thaanaa** message varum: **"✅ IN 19:42 · Today your Seat 5"**. Tap pannaa avanga seat page open aagum.

🍽️ **Hotel story:** customer hotel gate-la register-la sign panraanga. Udane avanga phone-ku "Unga table number 5" nu SMS pogudhu. Waiter kitta kekka vendaam!

Real card database-ku innum permission illa → **dummy** card machine (**Card Simulator**) vachu build pannom. Real system vandhaa, adhe **"door"** (`/addAccessLog`) use pannum. Vera edhuvum maaraadhu.

---

## 🔄 Full flow

| # | Enna nadakkudhu | Engae |
|---|---|---|
| 1 | Card swipe (ippo Simulator button) | `#simulator` → `POST /addAccessLog` |
| 2 | Swipe register-la save | `AccessLog` table |
| 3 | **First IN** of the day → seat calculate → push | `onCardIn()` + `seats.js` |
| 4 | Phone background-la message kaattum | `sw.js` (service worker) |
| 5 | Tap → seat page | `#guard/<token>` → `GET /guardDay` |
| 6 | Supervisor sheet-la ✅ 19:42 / ⏳ | `/getDayData` + `DutyTable.jsx` |

---

## 1️⃣ Tables

| Table / column | Why |
|---|---|
| `AccessLog` (escort_id, direction, punch_time, duty_date, source) | Gate register. `source` = SIMULATOR / REAL / TEST |
| `PushSubscriptions` (escort_id, subscription_json, device) | Phone-oda **address**. Oru guard-ku 2 phone irundhaa 2 rows |
| `Escorts.guard_token` (unique) | **Secret** link. ROWID guess pannalaam, token guess panna mudiyaadhu |
| `duty_date` | 01:30 AM swipe = **mundhaina naal** duty (08:00 rule) |

---

## 2️⃣ Push notification: 4 pudhu words

| Word | Hotel story | Enna |
|---|---|---|
| **Service worker** | Night watchman 🌙 | App close aanaalum phone background-la kaathirundhu message kaattum |
| **Subscription** | Customer address 🏠 | Phone-oda push address. "Allow" press pannaa kidaikkum |
| **VAPID keys** | Hotel official seal 🔏 | Google / Apple / Mozilla "idhu namma hotel message" nu nambanum |
| **Manifest** | App ID card 🪪 | Peyar, icon, colour. iPhone Home Screen-ku kattaayam |

**VAPID private key engae?** `Settings` table-la. `catalyst-config.json` git-la pogum, namma GitHub repo **public** → ellaarukkum theriyum ❌

---

## 3️⃣ Rules

| Rule | Why |
|---|---|
| **First IN** mattum dhaan notification | Tea break-ku poi vandhaa thirumba adikkaadhu (spam illa) |
| Push fail aanaalum swipe **save aagum** | Register mukkiyam, SMS illa |
| Time = **server** time (IST), phone time illa | Phone clock thappa irundhaalum correct |
| Guard page 🔒 until card IN, **08:00**-ku thaanaa lock | Duty-la illadhavanga paakka koodaadhu |
| IN aagaadhavanga = **EMPTY**, peyar anuppa maattom | Seat nagaraadhu + privacy |
| Sat / Sun → seat illa ("Your card IN is noted.") | Saturday leave, Sunday pickup sheet |
| `?date=` test trick **localhost-la mattum** | Internet-la yaarum cheat panna mudiyaadhu |
| Server seat logic = frontend copy (`seats.js`) | **Rendaiyum onna maathanum** |

---

## 🐞 Bugs + fixes

| Bug | Kaaranam | Fix |
|---|---|---|
| MCP `Create_Column` → `PATTERN_NOT_MATCHED` | Oru call-la niraya columns | Ovvoru column-um thaniya |
| Build apram `localhost` → 502 | `npm run build` `client/` folder-a kaali pannum, odura serve confuse | Serve **restart** |
| `Invalid raw ECDSA P-256 public key` | Key 87 letters, `setting_value` box **50** → vettupattu poyiduchu ✂️ (error kooda varala!) | Column 255 + key length check |
| Ctrl + C work aagala | Munnaadi **Ctrl + Z** press panniyirundhom → serve **pause** (`T`) | `kill -9 PID` |
| `.webmanifest` → `octet-stream` | Catalyst-ku extension theriyala | `manifest.json` |

---

## 🐧 Linux commands (pudhusa kathukittadhu)

| Command | Velai |
|---|---|
| `pgrep -af "catalyst serve"` | Serve odudhaa? PID enna? |
| `ss -ltnp \| grep 300` | Endha port-la odudhu? |
| `kill PID` / `kill -9 PID` | Niruthu / force-a niruthu |
| Ctrl + C ✅ / Ctrl + Z ⏸️ | Close / pause |

---

## ✅ Tested

| Test | Result |
|---|---|
| Laptop (Firefox): setup, test push, IN push, 2nd IN skip | ✅ |
| Laptop (Chrome): install app, close + reopen → My Seat | ✅ |
| **Android** (deployed): QR → Allow → IN push (app close) → tap → My Seat | ✅ |
| iPhone | ⏳ iPhone kidaikkumbodhu |

**Pending:** iPhone test → live project-ku merge (live-la `setting_value` 255 + pudhu tables pannanum).
