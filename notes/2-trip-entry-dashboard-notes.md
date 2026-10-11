# 🚕 Trip Entry + Dashboard + Night Shift (Notes)

Date: 2026-10-09 → 2026-10-10
Where: `~/Desktop/EscortRoster-React`, Catalyst project **EscortRosterReact** (pudhu account, org `60086856508`)

---

## 📖 Story: en indha velai?

Guards ippo **Zoho Creator form**-la ovvoru trip-kum thirumba thirumba per, mobile, agency, cab details type panraanga.
Namma `Escorts` table-la indha details **already irukku**. Adhanaala form-a **namma app-kulla-ye** kondu vandhom.

🍽️ **Hotel story:** delivery boy ovvoru delivery-kum thani notebook-la thannoda per ezhudhuraar. Hotel register-la already irukku! Ippo avar **veedu veedu-a tick** mattum pannaa podhum.

---

## 1️⃣ Trip employee entry

| Part | Enna | Why |
|---|---|---|
| `DutyRecords` + `vehicle_no`, `driver_name` | Oru row = oru trip | Cab details trip-ku **oru thadava** dhaan |
| Pudhu table `TripStops` | Oru employee = oru row | Oru trip-la **evlo per venaalum** (4, 6, 10…) |
| `duty_record_id` | Endha trip nu link | Bill-la "idhu endha bill" nu ezhudhura bill number 🧾 |
| `TripPopup.jsx` | Cab + employees popup | Guard ore idathula ellaam entry |
| `RouteCell.jsx` trip bar | Out time-ku keezha | Popup open panra idam |

### Rules
| Rule | Why |
|---|---|
| **Out time** pottaa dhaan [ + ] varum | Trip start aagaama employee drop panna mudiyaadhu |
| **In time eppovum** podalaam | In time = rotation decide pannum, stuck aagakoodaadhu |
| Guard **and** head guard edit / delete pannalaam | Marandhadha apram fill panna |

### Bar colours
| Bar | Eppo |
|---|---|
| 🔵 `👤 2 +` | Trip nadakkudhu |
| 🔴 `⚠️ Entry pending` | **In irukku + (cab illa OR employee 0)** |
| 🟢 `✅ 👤 4` | Vehicle + Driver + ≥1 employee |

### 🐞 Bugs + fixes
| Bug | Kaaranam | Fix |
|---|---|---|
| Popup-la Type, Time theriyala | Global CSS `table { min-width: 900px }` | `.trip-stops { min-width: 0 }` |
| Employees thappu order | ROWID order nambakoodaadhu | `ORDER BY CREATEDTIME` |
| 🗑 delete aagala | Browser `confirm()` block aachu | Popup-kulla **2-tap** "Delete?" |

---

## 2️⃣ Free limit problem 🔑

| | |
|---|---|
| Error | `FREE_USAGE_LIMIT_REACHED` (Datastore Fetch) |
| Kaaranam | 5 sec refresh × 4 queries × 3-4 tabs = ~2,900 reads/hour/tab |
| Fix | 30 sec, tab hidden-na refresh illa, 4 calls → 1 call `/getDayData` |
| Result | ~**8 madangu** kammi reads |

🍽️ Adikkadi store room-ku odinaa saavi theinjidum!

Apram **pudhu Catalyst account**-ku maarinom: CLI login → project create → MCP connect → 4 tables + 31 columns.

---

## 3️⃣ Dashboard 📊

| Part | Enna |
|---|---|
| Page | `#dashboard` (router illaama, Back button work aagum) |
| Filter | Day / Week / Month + date |
| Cards | Trips, Drop, Pickup, Pending |
| Guard wise | Trips, Drop, Pickup, Total, Pending |
| Trip details | Touch panna employees list |
| Quota | **Auto-refresh illa**, 🔄 button mattum |

---

## 4️⃣ Night shift + rotation

| Rule | Code |
|---|---|
| Pudhu naal **kaalaila 8 mani-ku** | `SHIFT_END_HOUR = 8`, `dutyDayStr()` |
| Sunday **12 AM**-laye open | Saturday leave, night duty illa |
| Dashboard order: 00:15 → 23:40-ku apram | `shiftMinutes()` |
| Rotation **4-la lock** | Ore number rendu velai: route columns + seat shift |
| Rotation **Mon–Fri mattum** count | Fri → Mon = +4 (+12 illa) |

📖 Register page kaalaila 8-ku dhaan maarum.
🪧 Ore board, rendu velai: thottaa ellaame maarum.

---

## ✅ Recall questions (notes paakkaama answer pannu)

1. [ + ] button eppo varum? Yen?
2. 🔴 Entry pending-ku 2 conditions enna?
3. `TripStops`-a en thani table-aa vechom?
4. Free limit en mudinjadhu? 3 fixes enna?
5. Saturday 06:00-ku endha sheet? Sunday 06:00-ku?
6. Rotation box-a en lock pannom?
7. Dashboard en auto-refresh pannala?
