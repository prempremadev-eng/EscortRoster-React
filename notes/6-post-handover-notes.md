# 🛡️ Post Handover Phase 1: Card IN → Take over → Post timeline (Notes)

Date: 2026-10-15 night (Thursday)
Where: branch **`post-handover`** (from `card-access`), Catalyst **EscortCardAccess** (Development)
Prompt: `~/Downloads/guard-app-build-prompt.md` + designs zip (37 screens)

---

## 📖 Story: en indha velai?

Ippo POST guards **WhatsApp group** la "taken over" / "handed over" type pannuraanga. Edhuvum thedave mudiyaadhu.
App la: card IN → 🔔 → **Taken over** button → post oda **notebook (timeline)**.

🏨 **Hotel story:** Adhe hotel la **pudhu dining hall**. Kitchen (server), staff register (Guards), store room (Data Store) **share**. Hall pidikkalana mooditalaam, pidichaa main hall oda join.

---

## 1️⃣ Decisions

| Kelvi | Mudivu | Why |
|---|---|---|
| Shift time | A 06–15, B 14–21, C 21–06, **G 09–18** (pudhu) | Unga office time |
| Enga build | **Adhe project**, pudhu branch + pudhu file `post.js` + folder `src/post/` | Guards, push, simulator reuse. Escort code touch illa |
| Supervisor phone | **Branches.supervisor_phone** (Option A) | Branch ku oru supervisor, simple |
| 5 s polling | ❌ → 🔄 button | Reads low (oru screen = 17,280 calls/day) |

## 2️⃣ Pudhu tables

| Table | Enna | Why |
|---|---|---|
| `DutyLog` | guard + post + shift + date + **status** (waiting → on_duty → handed_over) + times | DutyChart = **plan**, DutyLog = **nijam** |
| `PostMessages` | post + duty_log + guard + kind (text/system) + text + **pinned** | Post oda **notebook**. Pin = adutha guard ku |

Times `2026-10-16 05:58` maadhiri (date + time). **Why:** Shift C midnight cross aagum.

## 3️⃣ Flow (Phase 1)

| Flow | Button | Server | Screen |
|---|---|---|---|
| F1 | Card IN | DutyLog **waiting** + 🔔 | — |
| F2 | Go to my post | (read) | Screen 2 |
| F4 | ✓ Taken over | Pazhaya → handed_over, pudhu → on_duty, system pill, pazhaya guard ku 🔔 "You can leave" | Screen 3 |
| F6 | Send | PostMessages row | Blue bubble |
| F10 | Note touch → Pin | pinned = true | 📌 Pinned for next guard |

## 🐞 Bugs kandupidichadhu

| Prachanai | Kaaranam | Fix |
|---|---|---|
| Note, "took over" pill ku **munnaadi** vandhuchu | Catalyst **ROWID time order la varaadhu** | `ORDER BY CREATEDTIME` |
| PREM ku DutyLog varala, page locked | 22:55 IN (escort) apram chart maathinom → 23:47 **2nd IN** skip | POST guard ku DutyLog illana, **endha IN** aanaalum create + 🔔 |
| `text` 1000 kettaen, 255 dhaan kidaichadhu | Catalyst varchar max 255 (error illama) | 255 podhum; memory la save |
| Test Guard ku "You can leave" varala | Phone address **expire** (410) → delete aachu | Phone ah thirumba setup pannanum |

## ✅ Test result (23:59)
Test Guard took over → 📌 note → PREM IN → Screen 1 → Screen 2 → **Taken over** → timeline la "PREM KUMAR R took over from Test Guard · 23:52" + Tamil note ✅

## ⏭️ Adutha phases
Photo/video/voice → Work updates → Safety → Alerts → Breaks & cover → History → General shift → Supervisor inbox → Admin. **Login + roles** live ku munnaadi kandippa.
