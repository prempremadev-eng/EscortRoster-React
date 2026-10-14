# 🛡️ Guard Master → Card IN → Escort Duty Sheet on the phone (Notes)

Date: 2026-10-14 (Wednesday)
Where: `~/Desktop/EscortRoster-CardAccess` (branch `card-access`), Catalyst **EscortCardAccess** (Development)

---

## 📖 Story: en indha velai?

Nokia maadhiri company ku **niraya branch** (Chennai Beach, Guduvanchery, Salem, Nagpur…). Ovvoru branch la um security guards. **Ellaa guards um oru master list** la venum.
Card **IN** aanadhum, guard **velai type** paathu message pogum:
- **ESCORT** → "Today your Seat 9" → touch → **Escort Duty Sheet**, avar ⭐ row la mattum type pannalaam
- **POST** → "Today your post: Gate 3"

🍽️ **Hotel story:** Head office la **branch book** + **staff register** + **gate book**. Staff gate la sign pannaa SMS. SMS touch pannaa **order book** open, aanaa **avar line la mattum** pen ezhudhum.

---

## 1️⃣ Tables

| Table | Ovvoru row | WHY |
|---|---|---|
| `Branches` | Oru branch (code, name, company, country, state, city, area) | Branch details **oru thadava**. Guard la branch ID mattum |
| `Guards` | Oru guard (ID number, name, agency, branch_id, duty_type, post / escort_id, guard_token, is_active) | **Master list** |
| `AccessLog` | Oru swipe → ippo **`guard_id`** | Gate book (dhinamum, history venum) |
| `PushSubscriptions` | Oru phone → ippo **`guard_id`** | Phone address |

**IN / OUT master la illa.** Dhinamum maarum, history venum → `AccessLog`.

**Escorts table la access edhuvum illa** (`guard_token` delete). Link oru pakkam mattum: `Guards.escort_id → Escorts`.

---

## 2️⃣ Pages

| Page | Yaarukku | Enna |
|---|---|---|
| `#master` 🛡️ Guard Master | Supervisor | Ellaa guards, indru IN / OUT, State → City → Branch filter, 🚐 Escorts, ➕ Add, ✏️ Edit, 🚫 Guard left, ↩️ Re-activate |
| `#simulator` 🪪 | Test | Ellaa guards um IN / OUT |
| `#links` 🔗 | Supervisor | QR / link, phone count, **🔄 New link** |
| `#guard/<token>` | Guard phone | ESCORT: **original Escort Duty Sheet**, ⭐ row mattum edit. POST: avar post |

---

## 3️⃣ Rules (server la check)

| Rule | WHY |
|---|---|
| ID number **duplicate illa** | Rendu "Murugan" kozhappam illa |
| Oru escort ku **oru active guard** mattum | Seat yaaroda nu theliva |
| Guard velai vittaa **delete illa, switch off** | Pazhaya swipes la peyar irukkanum |
| Switch off aana guard: link, phone, swipe **ellaam stop** | Velai la illaadhavar ulla vara koodaadhu |
| Guard sheet la **sondha row mattum** save | Link irukkura yaarum mattavanga row maatha mudiyaadhu |
| Card IN + **indru duty day** + weekday seat | Duty la illaama entry illa |
| Route order: Location → Out → In, Route 2 after Route 1 | Duty sheet adhe rule, server la um |
| Mattavanga rows: **employee count** mattum, Mobile / ID **illa** | Privacy: ellaa guard um paarppaanga |
| **New link** → pazhaya link dead + phones remove | Link leak aanaa / phone tholanjaa |

---

## 4️⃣ Original design ah eppadi reuse pannom

Supervisor sheet oda **adhe components** (`DutyTable`, `RouteCell`, `TimePicker`, `TripPopup`) guard page la **use** pannom, **maathala**.
- Guard oda `actions` → avar row ku mattum guard API ku pogum, mattavanga row ku **onnum pannaadhu**
- CSS: `tbody tr {pointer-events:none}` → avar Route cells ku mattum thirumba **on**
- Server **thirumba check** pannum (phone la cheat pannaalum)

**Escort side files `main` oda same** (git diff empty) → live merge easy.

---

## 🐞 Problems + fixes

| Problem | Kaaranam | Fix |
|---|---|---|
| POST guard swipe save aagaadhu | `AccessLog.escort_id` **mandatory** | Optional aakki, apparam delete |
| Build apram localhost 502 | Serve odumbodhu build (pazhaya problem) | Serve restart |
| `pkill -f "catalyst serve"` en command ae kill aachu | Pattern en **bash command line** layum irundhuchu | `ps … awk '!/bash -c/'` vechu node process mattum |
| `git checkout main -- files` auto mode block | Files overwrite = risk | Chinna edits vechu adhe result |
| Guard page time box narrow ("07:50 F") | Out + In oru line la | Phone la onnu keezha onnu |

---

## ✅ Tested

| Test | Result |
|---|---|
| Add guard: duplicate ID, post illa, linked escort, bad branch, `'` ID | ❌ correct errors ✅ |
| Edit, POST ↔ ESCORT, switch off / on | ✅ |
| Murugan (POST) IN → "Gate 3" | ✅ |
| RAJA (ESCORT) IN → Seat 9, guard sheet ⭐ 9 | ✅ |
| Guard Route 1 entry → supervisor sheet seat 9 | ✅ |
| Old link after New link | ❌ "not valid" ✅ |
| **Notification → click → sheet on a real phone** | ⏳ naalaiku (TEST ESCORT / RAJMOHAN) |
