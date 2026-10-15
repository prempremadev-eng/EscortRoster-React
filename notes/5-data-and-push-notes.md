# 🔔 Namma data + Push notification eppadi velai seiyudhu (Notes)

Date: 2026-10-15 (Thursday)
Where: `~/Desktop/EscortRoster-CardAccess` (branch `card-access`), Catalyst **EscortCardAccess** (Development)

---

## 📖 Story: en indha velai?

Guard card swipe pannaa, avaroda phone la **"Gate 3 · Shift A"** nu message varanum. Adhukku rendu vishayam venum:
1. **Data** = yaar, enga, endha shift, endha phone
2. **Push** = app close aa irundhaalum phone ku message anuppa oru vazhi

---

## 1️⃣ Data: Catalyst Data Store (7 tables)

**Why?** Server function (cook) ku memory illa. Ovvoru request um pudhusa start aagum. Adhunaala ellam **store room (Data Store)** la.

| Table | Enna irukku | Why venum |
|---|---|---|
| `Branches` | Beach, Vizag… | Guard endha branch |
| `Guards` | Peru, ID, phone, `guard_token` | Guard yaar. Token = avaroda secret link |
| `Shifts` | A 06–15, B 14–21, C 21–06 | Time ovvoru idathulayum type panna vendaam |
| `Posts` | Gate 3, Lobby, Escort | Branch la nikkura idangal |
| `DutyChart` | guard + post + shift + week_start (Monday) | Indha vaaram yaar enga |
| `AccessLog` | guard + IN/OUT + time | Card swipe record |
| `PushSubscriptions` | guard + phone address | Notification **endha phone ku** |

**Link:** ellame `ROWID` vechu → `DutyChart.guard_id → Guards.ROWID`, `DutyChart.post_id → Posts.ROWID`

---

## 2️⃣ Push: 4 things

| # | Enna | Enga | Velai |
|---|---|---|---|
| 1 | **VAPID keys** | `Settings` table | Server oda **ID card**: message correct server la irundhu dhaan nu prove |
| 2 | **Service Worker** `sw.js` | Phone browser | App close aanaalum background la irukkum. Notification kaattum, touch panna page open |
| 3 | `pushManager.subscribe()` | `GuardSetup.jsx` | "Allow" → phone address (subscription) → `PushSubscriptions` la save |
| 4 | **web-push** library | `functions/escortAPI/index.js` | Andha address ku message anuppum (Google push service vazhiya) |

---

## 🏨 Hotel story: full flow

1. **Setup (oru thadavai):** guard **room number** kudukkuraar → subscription save
2. **Card IN** → `AccessLog` row
3. **Cook (server)**: register paakkuraar → `DutyChart` → "Gate 3 · Shift A"
4. Cook room number (`PushSubscriptions`) + **VAPID ID card** → **waiter (Google push)**
5. Room la **receptionist (`sw.js`)** notification kaattuvaanga 🔔
6. Touch → receptionist **My Post page** ku kootittu poraanga 📍

---

## 🐞 Indha naal kathukittadhu

| Prachanai | Kaaranam | Theervu |
|---|---|---|
| Touch panna setup page ku pochu | Adhu **test notification**, adhoda url `#setup/` | Test url ah `#guard/` ku maathinom |
| IN pottum notification varala | IN **munnaadi**, phone setup **apparam** | Setup mudhalla, apram IN |
| 2nd IN ku notification varala | **First IN mattum** dhaan notify pannum (design) | Test swipe ah ZCQL `DELETE ... WHERE ROWID = ...` la delete |
| Murugan ku IN pochu | Simulator la thappaana guard select | Dropdown check pannanum |

⚠️ ZCQL `DELETE` la **`WHERE ROWID = ...` illama** run pannaadheenga, ella rows um pogum.

---

## ✅ Recall answers
- Phone address endha table? → **PushSubscriptions** ✅
- App close aanaalum notification kaattradhu yaaru? → **sw.js** (service worker) ✅
