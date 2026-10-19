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
| – | Safety | Empty slot mattum fill pannum, **draft** ah. Oru guard oru naal la oru slot thaan |

**Rule 4 order:** outside-team guards are also ordered by **most days at the team's posts** (e.g. MLCP / Escort guards who covered PKL most come first). PKL relief list = PKL team + the outside guards who covered PKL posts in history (Sat/Sun gaps were never left empty).

**"Senior" (Rule 3 order):** team oda ella posts layum serthu **adhiga naal** duty paathavanga first. P-code seniority illa. (Prem: P-code senior ellarum PKL ah virumbi pannamaattaanga; adhiga naal PKL paathavanga nalla pannuvaanga.)

---

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

### H5 · Cover shift
- Weekend cover la, cover guard oda shift avanga andha vaara shift ah irukkanum nu illa (about pathi thaan same)

---

## 🗂️ Post by post (summary)

| # | Post | Group | Rules | Persons (count, names in Data Store) | Auto fill |
|---|---|---|---|---|---|
| 1 | Shift Incharge | Supervisors | Rule 1 | Month roster supervisors | ✅ On, tested |
| 2 | Documents | Documents | Rule 2 | 2 regulars | ✅ On, tested |
| 3 | PKL Main Gate | PKL | Rule 2 → 3 → 4 | 3 regulars + PKL relief (most PKL days first) | ✅ On, tested |
| 4 | PKL Vehicle Movement | PKL | Rule 3 → 4 | PKL relief only | ✅ On, tested |
| 5 | PKL Patrolling-1 | PKL | Rule 2 → 3 → 4 | 1 regular + PKL relief | ✅ On, tested |
| 6 | PKL Patrolling-2 | PKL | Rule 3 → 4 | PKL relief only | ✅ On, tested |
| 7 | Kidos School PKL | Lady (permanent) | Rule 2 | 1 regular, G shift Mon–Fri, Sat/Sun off | ✅ On, tested |
| 8 | Kidos School Apricot | Lady (permanent) | Rule 2 | 1 regular, G shift Mon–Fri, Sat/Sun off | ✅ On, tested |
| 9 | Medical Mine Reception | Lady (permanent) + male weekend cover | Rule 2 (H2, H4) → 3 → 4 | 3 ladies + 2 weekend cover men (regular) + 7 backups | ✅ On, test Sat 24 / Sun 25 |
| 10 | MLCP Reception | Lady (permanent) + lady pool cover | Rule 2 → 3 lady pool (H3) → 4 MLCP men | 3 ladies (regular) + 7 pool ladies, then 2 MLCP men (relief; the 3 regulars left out of relief so the team = Lady Guards) | ✅ On, test Sat 24 / Sun 25 |
| 11 | Apricot Reception | Lady pool | Rule 2 + H1 weekly rotation | 2 Apricot-side ladies + pool | ✅ On (Rule 5) |
| 12 | North Plaza Reception | Lady pool | H1 weekly rotation | 7 pool ladies | ✅ On (Rule 5) |
| 13 | Apricot Patrolling | Lady pool | H1 weekly rotation | pool | ✅ On (Rule 5) |
| 14 | MD House, PKL Vendor Parking | – | Rotation | – | ⏸ Parked |

---

## 🔜 Next steps (step by step, post by post)

| Step | Post / topic | Status |
|---|---|---|
| 1 | Shift Incharge, Documents, PKL Main Gate / VM / P1 / P2, Kidos ×2 | ✅ Built + tested on 19 Oct |
| 2 | Apricot Reception regulars (2 Apricot-side ladies) | ✅ Set, Auto fill off |
| 3a | Medical Mine Reception **weekdays**: 3 regulars on roster shift (Rule 2), relief list empty for now | ✅ Auto fill on, test 19 Oct |
| 3b | Medical Mine Reception **weekend** cover (H2, H4): 2 weekend cover guards added to the **regular** list after the 3 ladies (so Rule 2 takes them before PKL relief); 7 backups in the relief list, most Medical Mine days first | ✅ Set, test Sat 24 / Sun 25 Oct |
| 3c | MLCP Reception weekend cover (H2, H3) | ✅ Set, test Sat 24 / Sun 25 Oct |
| 4 | Lady pool weekly rotation (H1) = Rule 5. 5–17 Oct history (3 posts) loaded into the app | ✅ Built, NP / Apricot Rec / Apricot Patrolling on, test 19 Oct |
| 5 | MD House, PKL Vendor Parking, other rotation posts | ⏸ Parked |
