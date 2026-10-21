# ⚡ Schedule Auto fill: Rules (IPF, Estancia)

Ithu oru **rule book**. Rules rendu idathula irundhu varudhu:
- **Built**: app la already work aagudhu (`functions/escortAPI/supervisor.js` → `/scheduleAuto`)
- **History**: team oda pazhaya schedule photos (22 Jun – 19 Oct 2026, 113 sheets, about 17k duties) la irundhu kandupudichchadhu. Ippo note mattum, innum build pannala.

> Names ingae illa (public repo). Yaar regular / relief nu ellam **Data Store** la (`Posts.regular_guards`, `Posts.relief_guards`).

---

## 🧱 Groups

| Group | Meaning |
|---|---|
| PKL team | PKL posts (Main Gate, Vehicle Movement, Patrolling-1/2, Vendor Parking…) |
| MLCP team | MLCP posts |
| Escort | Night escort cab (Mon–Fri) |
| Lady guards | 17 total: **8 permanent** (MLCP Reception 3, Medical Mine Reception 3, Kidos School 2) + **9 pool** |

---

## ✅ Built rules (order la run aagum)

| # | Rule | Enna pannum |
|---|---|---|
| 0 | Switch | `Posts.auto_fill` = on irukkura posts la mattum run aagum |
| 0 | Escort | Escort guards **Sunday mattum**. Mon–Fri avanga night cab, so skip |
| 1 | Shift Incharge | Month roster la andha shift code irukkura supervisor. Yaarum illa na **empty** |
| 2 | Regular guards | `Posts.regular_guards` la irukkuravanga, avanga roster shift la |
| 3 | Team relief | Innum empty slot ah `Posts.relief_guards` (order) la irundhu, **post oda team** la irukkuravanga mattum |
| 4 | Outside team | Apparum empty na, relief list la meedhi irukkuravanga |
| 5 | Weekly rotation | Lady pool posts (team Lady Guards, regulars < shifts), **Rule 2 ku apram, Rule 3 ku munnaadi**: (a) nethu indha post + shift la irundhavanga, innaikkum adhe shift na **adhe post**; (b) pudhu shift week na, kadaisi 14 naal la indha post la **kammiya** irundhavanga first |
| 6 | Weekend list | Post ku thaniya **Sat / Sun list** irukkalaam (`Posts.relief_guards` la `;` ku apram). Sat / Sun la Rule 3 / 4 andha list ah use pannum. List la post team (ladies) yaarum illa na Rule 5 andha post ah skip pannum. Order = history la andha post la **weekend la adhiga naal** vandhavanga first |
| 7 | Weekend order | Sat / Sun la ladies kammi. Adhanaala **Rule 3 permanent posts ku (MLCP / Medical Mine Reception) Rule 5 ku munnaadi** odum. Apram meedhi ladies ah Rule 5 North Plaza / Apricot ku podum (H3: MLCP weekend 92% ladies, North Plaza 65%) |
| 8 | Anyone free | Kadaisi la: rotation post (relief list 5+) la innum empty slot irundhaa, andha shift la **post illaama free ah irukkura yaar venaalum** (own team first). Supervisor, lady pool, weekday Escort illa. **21 Oct:** daily rotation (D) posts kum (PKL / MLCP men mattum; Hospital, Ninnakarai, Medical Mine illa), fill priority order la (Play Ground first) |
| 9 | Lady shifts | `relief ; weekend ; lady shifts` (e.g. `B`). Andha shifts la mattum Rule 5 lady pool rotation; mathha shifts la pool lady podaadhu. **Kitchen-2 = B** (weekday), **Apricot Patrolling = A, C** (B = men) |
| 10 | Daily rotation | A post flagged **D** (4th `;` part of `Posts.relief_guards`) never gets the guard who was there **yesterday** (Rules 2, 3, 4, 8). For hot / hard posts (Lancor Vendor Entrance: sun) |
| – | Safety | Empty slot mattum fill pannum, **draft** ah. Oru guard oru naal la oru slot thaan |

## 🗂️ Post types (how each post is decided, 20 Oct)

| Type | When | How the list is made | Daily rotation |
|---|---|---|---|
| **Fixed** | 1–3 people always there (Documents, PKL Core, CCTV, permanent ladies, Kidos) | Those people as regulars; first in list = first choice | No |
| **Team** | A roster group that only works its own posts (Hospital, Ninnakarai) | The group as regulars, each post's own order; important post first in post order | No |
| **Pool rotation (ladies)** | Lady pool posts | Rule 5 weekly rotation, lady shifts, weekend lists | – (weekly) |
| **Support / important post** | A post that helps another (North Plaza GF1 helps the reception lady) or Prem marks important (CWE Play Ground) | Pool of people who **know the post** (4 months), **PKL first, then MLCP** | **No** (familiar people) |
| **Group pair** | Same small team moves between 2–3 posts (Lancor team: BKE, Car, Vendor Entrance; MG-1 + CP-1) | The team ordered by days at each post | Only where Prem says (Vendor Entrance: sun) |
| **Option B rotation** | Everyone else (MLCP, Lancor, PKL others) | **Most days at that post last month (any team)**, then 4-month total; top 15 | **Yes (D)** where Prem says |
| **Special shift** | One shift has a fixed person (Basement-2 G, Car Parking-3 G) | That person + cover first | No |

**Priority (fill order):** Medical Mine Reception → **North Plaza GF1** → **CWE Play Ground** → other posts (Prem, 20 Oct). Fill order decides who gets a shared person first.

**Fill order ≠ sheet order (Prem, 20 Oct night):** the printed sheet must keep the **template order the guards are used to** (`sort_order`). So fill priority is a **digit in the 4th `;` part of relief_guards** (`;;;1`, `;;;2D`): posts with a digit are filled first (1 before 2), then the rest by sort_order. sort_order is only for the sheet.

**Always:** Escort out Mon–Sat · Ninnakarai people kept at Ninnakarai (except where Prem says, e.g. Manoj Kumar J also Lancor) · a 1–2 week one-off stint is not a regular · test on the last real sheet (Mon 19 Oct).

**Rule 4 order:** outside-team guards are also ordered by **most days at the team's posts** (e.g. MLCP / Escort guards who covered PKL most come first). PKL relief list = PKL team + the outside guards who covered PKL posts in history (Sat/Sun gaps were never left empty).

**Regular order (Rule 2):** regular list order = choice order. Two regulars on the same shift → the first one gets the post, the other goes on to relief.

**"Senior" (Rule 3 order):** team oda ella posts layum serthu **adhiga naal** duty paathavanga first. P-code seniority illa. (Prem: P-code senior ellarum PKL ah virumbi pannamaattaanga; adhiga naal PKL paathavanga nalla pannuvaanga.)

---

## 🏭 PKL Core Team (20 Oct, step by step restart)

- Monthly roster: 4 teams (PKL 84, MLCP 67, Escort 49, Hospital 14). PKL 84 = Supervisors 4 · Documents 2 · Medical Mine 3 · Kidos 2 · Ninnakarai 7 · Lady Guards 9 · **PKL Core Team 8** · other PKL men 49
- Posts: PKL Main Gate (3 regulars), Vehicle Movement (3), Patrolling-1 (2, first in list = first choice), Patrolling-2 (relief only)
- Rules: Escort Sunday only → Rule 2 regulars (list order) → Rule 3 PKL relief (most PKL days) → Rule 4 outside team → Rule 8 anyone free
- Mon 19 test: 10 / 12 match (2 regulars on the same shift swapped VM C ↔ P1 C)
- 20 Oct: Auto fill **only these 4 posts on**; other groups switched back on one by one. Names: private file outside git

## 🏢 Ninnakarai (20 Oct)

- 2 posts × A/B/C = 6 slots a day. Monthly roster section = 7 people, each off on a different weekday
- Set: the 7 = **regulars of both posts** (Rule 2, list order); **relief list empty for now** (team people only; outsiders later)
- Roster fit: exactly 2 per shift on only 6 of 31 October days; most days one shift has 1 and another 3 → ~1 short slot (stays empty for now) and ~1 spare person a day
- Shift Incharge: Tue–Thu one shift has no supervisor (staggered weekly offs) → left empty. Documents: 2 regulars only

## 🏥 Hospital (20 Oct)

- Roster team 14, all rotate only inside the hospital (no fixed floor)
- On: G/F, 2nd FL, 4th FL, 6th FL (C) with the 14 as regulars (each post's own order: most days there first); relief empty for now
- Off for now (do last): Lift (filled only ~38% of days), Rear Side (107 different guards, mostly outsiders)
- Code: Auto fill goes through posts in **sort order** (Posts page order), so the more important post of a group (G/F) gets people first

## 🅿️ MLCP (20 Oct, started)

- **Teams change every month** (PKL ↔ MLCP ↔ Escort; not the PKL sub-groups; Ninnakarai changes too; Hospital unknown). Lists use **this month's team only**; history only sets the order
- Main Gate-1 + Car Parking-1 = a pair (7 slots a day, both every day, every shift). Each post's own order (most days there first), October MLCP people as regulars, Main Gate-1 filled first. Relief empty for now
- Escort guards never on these posts Mon–Sat (Rule 0 + not in the lists)

## 🅿️ MLCP option B (20 Oct, Prem)

- October: the roster's team section ≠ where people work (~15 PKL-section people were #1/#2 at MLCP posts; some MLCP people top Ninnakarai)
- Rotation posts: regular order = **most days at that post last month (any team)**, then 4-month history; Escort out Mon–Sat; top 15; relief empty
- Done: ERT Booth, MLCP Main Gate-1, MLCP Car Parking-1. Day-by-day history rebuilt from all 113 photos (18,568 duties, 112 days)

## 📋 Post by post rules (20 Oct, step-by-step setup)

No names here (public repo). Names and day-by-day history: private folder outside git.

| # | Post | Group | Shifts | Pattern (history) | Rule in the app | Auto fill |
|---|---|---|---|---|---|---|
| 1 | Shift Incharge | Supervisors | A B C G | 3 supervisors rotate A/B/C weekly, 1 on G | Rule 1: supervisor whose roster says that shift; nobody → empty (Tue–Thu one shift is empty every week) | ✅ |
| 2 | Documents | Documents | A B G | 2 fixed people | Rule 2: regulars only, no relief | ✅ |
| 3 | PKL Main Gate | PKL Core | A B C | 3 fixed people | Rule 2: 3 regulars → PKL relief → outside | ✅ |
| 4 | PKL Vehicle Movement | PKL Core | A B C | 3 almost fixed | Rule 2: 3 regulars (list order = choice) → relief | ✅ |
| 5 | PKL Patrolling-1 | PKL Core | A B C | 2 main people | Rule 2: 2 regulars, first = first choice → relief | ✅ |
| 6 | PKL Patrolling-2 | PKL Core | A B | rotation | Rule 3/4: PKL relief (most PKL days) → outside | ✅ |
| 7 | North Plaza Reception | Lady pool | A B C | weekly rotation | Rule 5 (same lady all shift-week); weekend list: ladies first, then men | ✅ |
| 8 | Apricot Reception | Lady pool | A B C | 2 Apricot-side ladies + pool | Rule 2 (2 regulars) → Rule 5; weekend list men | ✅ |
| 9 | Apricot Patrolling | Lady pool | A B C | ladies on A, C; men on B; weekend men | Rule 5 on A, C (lady shifts); B and weekend = men list | ✅ |
| 10 | Kitchen-2 | Lady pool + men | B C | B = pool lady Mon–Fri; C and weekend = men | Rule 5 on B only; weekend list men | ✅ |
| 11 | MLCP Reception | Lady (permanent) | A B C | 3 fixed ladies; off day → pool lady, then men | Rule 2 → Rule 3 lady pool → Rule 4 men; weekend: before Rule 5 | ✅ |
| 12 | Medical Mine Reception | Lady (permanent) | A B C | 3 fixed ladies; weekend men cover (same man Sat + Sun) | Rule 2: 3 ladies + 2 weekend men → relief | ✅ |
| 13–14 | Kidos School PKL / Apricot | Lady (permanent) | G | 1 fixed each, Mon–Fri | Rule 2 | ✅ |
| 15–16 | Ninnakarai Land-1 / Land-2 | Ninnakarai (monthly) | A B C | roster gives 7 people; real life mixes others in | Rule 2: the 7 (both posts); relief later (~1 short slot a day) | ✅ |
| 17–20 | Hospital G/F, 2nd, 4th, 6th FL | Hospital | A B C (6th: C) | 14-person team rotates floors daily | Rule 2: team, each floor's own order; G/F filled first (sort order) | ✅ |
| 21 | Hospital Lift | Hospital | A B | filled ~38% of days | later (phase 2) | ⏸ |
| 22 | Hospital Rear Side | Hospital | A B C | mostly outsiders (107 people) | later (phase 2) | ⏸ |
| 23 | MLCP Main Gate-1 | MLCP rotation | A B C | 1 near-daily person + PKL people often | Option B: most October days first (any team) | ✅ |
| 24 | MLCP Car Parking-1 | MLCP rotation | A B C G (G Mon–Fri) | daily rotation, PKL people top in October | Option B | ✅ |
| 25 | ERT Booth | MLCP rotation | A B C | some 4–6 day stretches | Option B; one-off 2-week stint moved down | ✅ |
| 26 | MLCP Basement-1 | MLCP rotation | A B C G | a few people keep coming back | Option B | ✅ (19 Oct: 4/4 match) |
| 27 | MLCP Basement-2 | MLCP rotation | A B C G | **G = one fixed person daily** (+ 1 cover); A/B/C daily rotation | Option B: G regular + cover first, then A/B/C order | ✅ |
| 27b | MLCP Main Gate-2 | MLCP rotation | A B C | pure daily rotation (no stretches) | Option B (Ninnakarai regulars left out) | ✅ |
| 27c | MLCP Car Parking-2 | MLCP rotation | A B C G | daily rotation, many PKL people (36%) | Option B | ✅ |
| 27d | MLCP Car Parking-3 | MLCP | G only (~70% of days) | **one fixed person on G** | Option B: fixed person first (Basement-2 G regular kept out) | ✅ |
| 27e | MLCP Terrace | MLCP rotation | A B C | daily rotation, mostly MLCP | Option B | ✅ |
| 27f | MLCP Rear Exit | MLCP rotation | A B | daily rotation, mostly MLCP | Option B | ✅ |
| 27g | Lancor BKE Parking | Lancor team | A B C G | a ~10-person **Lancor team** (mostly PKL section) in 3–5 day stretches; G = MLCP people daily | Ordered Lancor team, G people at the end | ✅ |
| 27h | Lancor Car Parking | Lancor team | A B C | same Lancor team (pair with BKE) | Ordered Lancor team (car days first) | ✅ |
| 27i | Lancor Vendor Entrance | Lancor team | A B C G | 3rd Lancor-team post; **very sunny** | Lancor team list + **daily rotation (D)**: never yesterday's guard | ✅ |
| 27j | Lancor Boarding Exit | MLCP rotation | A B C | daily rotation; Ninnakarai people also come | Option B, Ninnakarai people kept out, **daily rotation (D)** (Prem: a different guard every day) | ✅ |
| 27k | Lancor Parking-1 | MLCP rotation | A B C | daily rotation, mostly MLCP | Option B, Ninnakarai people kept out, **daily rotation (D)** | ✅ |
| 27l | Lancor Waiting Hall | MLCP rotation | A B C G | daily rotation, a few short stretches | Option B, **daily rotation (D)** | ✅ |
| 27m | Kitchen-1 | MLCP rotation | A B C | daily rotation; Ninnakarai people also come | Option B, Ninnakarai kept out, **daily rotation (D)** | ✅ |
| 27n | Smoking Zone | MLCP rotation | A C G (A new in Oct) | mostly daily, a few short stretches | Option B, Ninnakarai kept out, **daily rotation (D)** | ✅ |
| 29a | North Plaza GF1 | PKL others | A B C | **supports the North Plaza Reception lady** (covers her breaks) and needs **some system knowledge (issuing passes)**; **filled first** (fill priority 1, then Play Ground 2; sheet order unchanged); Jul–Oct: rotation among ~15 people who know GF1 (October 71% PKL) | **GF1 pool: PKL people first, then MLCP**, **no daily rotation**; Medical Mine filled before it (fill priority 1) so its weekend cover keeps priority | ✅ |
| 29b | North Plaza GF2 | PKL others | A B C | Jul–Oct: different person almost every week; only 3 short stretches; October 61% PKL | Option B + **daily rotation (D)** (Prem: not a support post) | ✅ |
| 29c | CWE Play Ground | PKL others (**important**) | A B C | most rotated post: no 3-day stretch ever, max 8 days per person; October 67% PKL | **Full history most days first, PKL first, then others wherever they are** + **daily rotation (D)** (Prem: even the most-frequent people never two days running) | ✅ |
| 29d | North Plaza WW Entrance, GF/S/P Exit, Patrolling (G), 4th Floor (G), M Floor (G), Center Block Outer, Utility Entrance, Old Woodlands, Connecting Bridge, MD House (C), PKL Vendor Parking | PKL others | as listed | all pure daily rotation, nobody fixed (Oct #1 has only 2–5 days) | Option B + **daily rotation (D)**; Escort, Ninnakarai, Hospital people out | ✅ |
| 28 | MLCP CCTV | – | A B C | **1 fixed person, 1 slot a day on his own shift** (weekly cycle, off Thursdays) | Regular only; Oct roster row added from history; other two shifts stay empty | ✅ |
| 29 | VTitan | – | – | weekend-only extra duty | removed | – |

**General rules learned:** a person can be in two groups' lists (e.g. Lancor + Ninnakarai); the post filled first in sort order gets them first. a one-off 1–2 week stint is not a regular pattern (look for repeated stretches); the roster section is not where people work (go by last month's post days); Escort never Mon–Sat; fixed sub-groups never change.

## 🏭 PKL others (20 Oct, analysis)

- 14 posts: North Plaza GF1, GF2, WW Entrance, GF/S/P Exit, Patrolling (G), 4th Floor (G), M Floor (G), Center Block Outer, Utility Entrance, CWE Play Ground, Old Woodlands, Connecting Bridge, MD House (C), PKL Vendor Parking
- All **pure daily rotation**: in October nobody stayed more than 1–3 days in a row at any of them; teams mixed (PKL + MLCP, some Escort on Sundays, some Ninnakarai-section people)
- Proposal: option B + daily rotation (D); Escort and Ninnakarai people out

## 🧪 Tue 20 Oct test (21 Oct morning)

- Mon 19 complete aana apram Tue 20: Clear day → Auto fill → **daily rotation repeats 0** (last night 16, because Tue was filled before Mon). Rule: **yesterday first, then today**.
- Sheet order back to template (sort_order 12 / 15 / 21); fill priority digits `;;;1`, `;;;2D`.
- A shift: 5 D posts empty while 8 PKL / MLCP men had no post (Play Ground list had nobody on A) → Rule 8 now covers D posts.
- **MLCP CCTV = `R` flag** (4th `;` part): the post is on the sheet **only on the shift its regular works that day** (roster); his off day = no CCTV row, so it is never counted as unfilled (Prem: "subathran iruntha mattum, antha shift la post").
- Schedule page now shows **Day summary** (shift · total · filled · unfilled · unfilled posts, then TOTAL) and **On duty, no post** (free guards by shift).

## 🧾 Real sheet vs app, Wed 21 Oct (Prem sent the real sheet)

- Same posts on A / B / C (44 = 44). Only 4 names differ:
  - **G: two Shift Incharges** (PKL G + MLCP G); history: 24 of 85 G days had two. → New post **MLCP Shift Incharge** (G only, MLCP section, sort 1). **Rule 1** now fills every post ending in "Shift Incharge": first from the post's own regular list, then the main Shift Incharge takes any supervisor left.
  - **Hospital Lift A** (real sheet calls it "Hospital Patrolling") → Hospital Lift **Auto fill on**, Hospital team (14) as regulars, most October Lift days first (old relief list kept in the private backup file).
  - One MLCP man moved to the Escort 9-to-6 list for the day, one A-shift man absent: **day changes**, the supervisor fixes them with the picker.
- Same person at the same post: A 18 / 44, C 13 / 44 (the supervisor rotates posts by hand).

## 🗓️ Rows only when the person is on that shift (21 Oct, Prem)

- `R` (4th `;` part) = the post's row shows only on the shifts its people work that day (month roster). `R` + shifts (e.g. `RG`) = only for those shifts.
- **MLCP CCTV** `R` (one fixed person). **Documents** `RG` and **Shift Incharge** `RG`: the **G row only when a Documents person / a supervisor is on G**; no one → no G row (not counted as empty). Shift Incharge counts the supervisors except MLCP Shift Incharge's own regular.
- **MLCP Shift Incharge**: no `R` — if he is on leave the row stays empty.
- Empty Lancor / MLCP slots with free men: **leave empty, the supervisor fills** (Prem: "slot free ah irukkattum"). Hospital Rear Side: still off.

## 🗓️ Weekend test Fri 23 – Sun 25 (21 Oct)

- Fri 23: 144 / 150 · Sat 24: 137 / 151 · Sun 25: 113 / 151 (18 Escort men free on Sunday).
- **Kidos School ×2 = `W` flag** (4th `;` part): Mon–Fri only, **no row on Sat / Sun**.
- **Sunday: escorts DO fill empty slots** (Prem changed it, 21 Oct): on Sunday Rule 8 covers every men's post (not Shift Incharge, R posts, Hospital, Ninnakarai, lady / Medical Mine posts); own team first, PKL / MLCP next, **Escort last**. Mon–Sat unchanged. Later job (skip now): Sunday C-shift men leave a post around 3 AM Monday for 1–2 escort pick-up trips. Escort page left as it is.
- Documents on Saturday (both regulars off): **open**, Prem will decide (hide the row or show empty).

## 📜 History rules (found, not built yet)

### H1 · Lady pool: vaaram vaaram rotation
- Pool la 9 per. Daily slots: North Plaza Reception (A/B/C) + Apricot Reception (A/B/C) + Apricot Patrolling (A/B/C) = **9**
- Oru lady **oru vaaram full ah (Mon–Sat) ore post + ore shift**
- **Adutha vaaram vera post** ku maaruvaanga. History la oruthar North Plaza la thodarndhu 6 naal mela irundhadhe illa
- Saila per Kitchen-2 / MLCP Reception relief um poraanga
- 2 per (Apricot side) mostly **Apricot Reception ↔ Apricot Patrolling** mattum, North Plaza romba kammi

### H2 · Permanent reception ladies: weekly off
- MLCP Reception, Medical Mine Reception: ovvoru postlayum 3 permanent ladies
- Off **weekend la mattum**, maari maari (staggered): **Saturday 1 per off, Sunday 2 per off**
- Month roster um idhe solludhu (Oct: Medical Mine la 1 per Saturday off, 2 per Sunday off)
- Weekday la cover romba kammi (MLCP 9 / 60, Medical Mine 16 / 68)

### H3 · MLCP Reception: off naal cover
- 60 cover duties la **49 = lady pool** (H1 ladies), **9 = MLCP team male guards**, 2 = Medical Mine lady
- So first lady pool la free irukkuravanga; illa na MLCP team

### H4 · Medical Mine Reception: off naal cover
- 68 cover duties la **mostly male guards** (PKL / MLCP team), ladies romba kammi
- Weekday la oru Medical Mine lady MLCP Reception ku pona, Kidos lady cover pannina naal um irukku
- **Weekend pattern (17 weekends):**
  - Saturday: **1 cover** (off la irukkura lady oda shift)
  - Sunday: **adhe cover guard, adhe shift** + **innoru cover** (2nd off lady oda shift). 16 / 17 weekends la Sat cover thaan Sun um
  - Main weekend cover guard oruthar **oru maasam** maadhiri same (Jul, Aug, Sep, Oct ovvonnukkum oruthar), 2nd Sunday cover um mostly same person
  - Escort guard Sunday 2nd cover ah vandhirukkaanga (escort Sunday rule ku match)
- **Month roster already plan pannudhu:** Oct la cover guards oda roster shift = avanga cover panna shift (6 / 6 weekend duties match)
- Cover guards **PKL team** relief lists layum irukkaanga. So weekend la PKL posts first eduthutta, Medical Mine empty aagum. Medical Mine weekend cover ku **PKL relief ah vida priority** venum

### H6 · Apricot Patrolling weekend = men
- 85 weekend duties la **0 ladies** (1 thadava mattum). MLCP 32, Escort 27, PKL 18
- **55 vera vera aalunga**, oruthar max 4 thadava. Fixed aal illa: andha naal free ah irukkura men
- Sat C / Sat A sila naal **empty** ah vittirukkaanga
- Escorts Saturday layum vandhirukkaanga (13). App rule ippo: Escort Sunday mattum

### H5 · Cover shift
- Weekend cover la, cover guard oda shift avanga andha vaara shift ah irukkanum nu illa (about pathi thaan same)

---

## 🗂️ Post by post (summary)

| # | Post | Group | Rules | Persons (count, names in Data Store) | Auto fill |
|---|---|---|---|---|---|
| 1 | Shift Incharge | Supervisors | Rule 1 | Month roster supervisors | ✅ On, tested |
| 2 | Documents | Documents | Rule 2 | 2 regulars | ✅ On, tested |
| 3 | PKL Main Gate | PKL | Rule 2 → 3 → 4 | 3 regulars + PKL relief (most PKL days first) | ✅ On, tested |
| 4 | PKL Vehicle Movement | PKL | Rule 2 → 3 → 4 | **3 regulars** (20 Oct: history 77 / 71 / 61 days at VM) + PKL relief | ✅ On |
| 5 | PKL Patrolling-1 | PKL | Rule 2 → 3 → 4 | **2 regulars** in order (1st choice 64 days at P1, 2nd 45 days; same shift → 1st choice gets P1) + PKL relief | ✅ On |
| 6 | PKL Patrolling-2 | PKL | Rule 3 → 4 | PKL relief only | ✅ On, tested |
| 7 | Kidos School PKL | Lady (permanent) | Rule 2 | 1 regular, G shift Mon–Fri, Sat/Sun off | ✅ On, tested |
| 8 | Kidos School Apricot | Lady (permanent) | Rule 2 | 1 regular, G shift Mon–Fri, Sat/Sun off | ✅ On, tested |
| 9 | Medical Mine Reception | Lady (permanent) + male weekend cover | Rule 2 (H2, H4) → 3 → 4 | 3 ladies + 2 weekend cover men (regular) + 7 backups | ✅ On, test Sat 24 / Sun 25 |
| 10 | MLCP Reception | Lady (permanent) + lady pool cover | Rule 2 → 3 lady pool (H3) → 4 MLCP men | 3 ladies (regular) + 7 pool ladies, then 2 MLCP men (relief; the 3 regulars left out of relief so the team = Lady Guards) | ✅ On, test Sat 24 / Sun 25 |
| 11 | Apricot Reception | Lady pool (+ men on weekend) | Rule 2 + Rule 5; Sat / Sun weekend list | 2 Apricot-side ladies + pool + 25 weekend men | ✅ On (Rule 5, Rule 6) |
| 12 | North Plaza Reception | Lady pool (+ men on weekend) | Rule 5; Sat / Sun Rule 5 → 3 → 4 weekend list | pool ladies + 15 weekend men | ✅ On (Rule 5, Rule 6) |
| 13 | Apricot Patrolling | Lady pool (weekday) + men (weekend, H6) | Weekday Rule 5; Sat / Sun Rule 6 → 4 | pool ladies + 51 weekend men | ✅ On (Rule 5, Rule 6) |
| 14 | **Meedhi 43 posts** (Hospital Block, MLCP, Lancor, North Plaza GF / floors, Kitchen, Smoking Zone, Ninnakarai, VTitan, MLCP CCTV, MD House, PKL Vendor Parking…) | Rotation | Rule 2 → 3 → 4 | **Regular** = andha post la 30+ naal, avanga duty la pathikku mela andha post (7 per, 5 posts la). **Relief** = andha post la duty paatha ellaarum, adhiga naal first (top 25) | ✅ On (19 Oct, ellaam ore rule) |

---

## 📊 Mon 19 Oct test (all 56 posts)

| Result | Slots |
|---|---|
| Same person, same post as real sheet | 45 |
| Right person + right shift, **vera post** | 80 |
| Empty (before Rule 8) | 24 |

History: same shift la irundhaalum **~30% thaan nethu post la ve** irukkaanga. Supervisor daily rotation pannuraar, adhanaala exact post predict panna mudiyaadhu. **Yaar duty** (person + shift) sari ah varudhu.

## 🍳 H7 · Kitchen-2 B = pool lady (weekday)

- Kitchen-1 and Kitchen-2 A / C: **0 ladies** ever. Kitchen-2 **B: 60 lady duties**, all Mon–Fri, **0 on Sat / Sun**
- Sep 14 / 16 and Oct 12 / 13 weekdays had a lady → almost daily now
- Pool ladies only, **4–5 days in a row** then another lady (weekly rotation, same as Rule 5)
- Pool 9 = North Plaza 3 + Apricot Reception 3 + Apricot Patrolling A, C + Kitchen-2 B
- **Pool split (Prem, 20 Oct):** 9 pool ladies = North Plaza 3 (1 per shift) + Apricot 6 (2 per shift: Reception + Patrolling; the 2 Apricot-side ladies are Reception regulars). **B shift only:** the Apricot Patrolling lady goes to **Kitchen-2 B**, and a **man** covers Apricot Patrolling B
- 19 Oct real sheet had the opposite (lady at Apricot Patrolling B, man at Kitchen-2 B): a **one-day manual change** by the supervisor. The rule stays: Kitchen-2 B = lady

## 🔒 Regular-only posts: Documents, MLCP CCTV

- Prem: "regular mattum thaan anga poga mudiyum". Relief list **empty**, Rule 8 skips them (relief list < 5), so a missing regular = **empty slot** for the supervisor
- MLCP CCTV regular has **no month roster row** for Oct, so Rule 2 can't place him (the roster needs that row)

## ⭐ VTitan: removed (19 Oct)

- History: weekday la **oru thadava kooda illa**. 33 weekend la 10 naal mattum (Sat C / Sun A+B), aal ovvoru thadavaiyum vera
- Prem: "fill pannavendaam, column thevai illai" → post **inactive** (schedule la varaadhu), Auto fill off. App potta 8 draft rows delete. 18 Oct published rows appadiye irukku

## 🔜 Next steps (step by step, post by post)

| Step | Post / topic | Status |
|---|---|---|
| 1 | Shift Incharge, Documents, PKL Main Gate / VM / P1 / P2, Kidos ×2 | ✅ Built + tested on 19 Oct |
| 2 | Apricot Reception regulars (2 Apricot-side ladies) | ✅ Set, Auto fill off |
| 3a | Medical Mine Reception **weekdays**: 3 regulars on roster shift (Rule 2), relief list empty for now | ✅ Auto fill on, test 19 Oct |
| 3b | Medical Mine Reception **weekend** cover (H2, H4): 2 weekend cover guards added to the **regular** list after the 3 ladies (so Rule 2 takes them before PKL relief); 7 backups in the relief list, most Medical Mine days first | ✅ Set, test Sat 24 / Sun 25 Oct |
| 3c | MLCP Reception weekend cover (H2, H3) | ✅ Set, test Sat 24 / Sun 25 Oct |
| 4 | Lady pool weekly rotation (H1) = Rule 5. 5–17 Oct history (3 posts) loaded into the app | ✅ Built, NP / Apricot Rec / Apricot Patrolling on, test 19 Oct |
| 4b | Apricot Patrolling **weekend** men (H6) = Rule 6 weekend list | ✅ Set, test Sat 24 / Sun 25 Oct |
| 4c | North Plaza + Apricot Reception **weekend list** = pool ladies first, then men (history 33 weekend days, 27 Jun – 18 Oct, most days at that post first). Ladies irundhaa Rule 5 rotation; illa na Rule 4 men | ✅ Set, test Sat 24 / Sun 25 |
| 4d | Weekend la ladies kammi: permanent posts first, then rotation = Rule 7 | ✅ Built, test Sat 24 |
| 5 | Meedhi 43 posts (generic history rule, row 14) | ✅ On 19 Oct, test Mon 19 / Sat 24 / Sun 25 |
| 6 | Rotation posts ku weekly same post (Rule 5 maadhiri) | 🔜 Test result paathu |
