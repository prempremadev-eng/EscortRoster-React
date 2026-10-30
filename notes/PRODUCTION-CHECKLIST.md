# GuardDesk → Production checklist (30 Oct 2026)

Goal: guards and office use Production from **1 Nov 2026** (Sunday). Development stays for tests.

> **Key fact:** "Deploy to Production" copies the **code and the table structure**, not the **data**.
> Production's Data Store starts **empty**: no branches, agencies, guards, posts, users, settings or rosters.
> ROWIDs are new in Production, so Dev rows cannot be pasted in as they are (posts, agencies and guards point to
> each other by ROWID).

## 0. Before (Prem)

| ✔ | Step |
|---|---|
| ☐ | `git push origin post-handover` (all local commits on GitHub) |
| ☐ | Manager OK for going live |
| ☐ | Delete or switch off test data in Dev you do NOT want copied later: TEST FACE, BSS test guards / posts, test posts (GATE3, T-PATROLLING 1), TESTING GUARD, TEST NEW PERSON, the test reliever |

## 1. Deploy (Prem, Catalyst console)

| ✔ | Step | Check after |
|---|---|---|
| ☐ | Console → project EscortCardAccess → **Deploy to Production** (select: function `escortAPI`, web client, Data Store tables, Stratus bucket, Authentication, Job scheduling) | Production URL opens the login page |
| ☐ | Data Store: all 30 tables the code uses exist in Production | AccessLog, Agencies, Alerts, Branches, Breaks, Cities, DutyChart, DutyLog, DutyRecords, EscortDay, Escorts, GroupMessages, Guards, MonthRoster, PostMessages, Posts, Presence, PushSubscriptions, ReliefShifts, Relievers, SafetyEntries, Schedule, Settings, Shifts, States, SupervisorSubs, TripStops, UserRoles, VehicleEntries, WorkUpdates |
| ☐ | Columns: `Settings.setting_value` is varchar(255); `MonthRoster.team`, `MonthRoster.sort_no`, the new Guards / Branches / AccessLog columns are there | Data Store → table → columns |
| ☐ | Stratus bucket `escortcardaccess-media` exists in Production | Stratus page |
| ☐ | Authentication enabled in Production (email login) | Login page works |

## 2. First login (Prem)

| ✔ | Step |
|---|---|
| ☐ | Add yourself as a Production user (Authentication → Users) |
| ☐ | Insert one `UserRoles` row: your email, role `super_admin`, is_active true (console → Data Store → UserRoles → Add row) |
| ☐ | Log in → the app opens on Today |

## 3. Setup data (in this order)

Two ways: **A** type it in the app, or **B** a one-time "copy setup from Dev" tool (Claude builds: export Dev setup to a file, import in Production with new ROWIDs). B is faster for posts.

| ✔ | Data | Where | How many (Dev, 30 Oct) |
|---|---|---|---|
| ☐ | States, cities, branches (Estancia, Cumbum; shift times per branch) | Admin | small |
| ☐ | Shifts | Admin | A, B, C, G |
| ☐ | Agencies (IPF, ISI; branch list) | Admin | 2 (BSS was a test) |
| ☐ | Office logins (supervisors, incharges) | Admin → Users (also add each as a Production Authentication user) | |
| ☐ | **Guards**: 📥 Import Excel (All Security Details headings) per agency | Setup → Guards | IPF ~216, ISI, Cumbum 4 |
| ☐ | Agency incharges ⭐ (IPF 4) | Admin → Agencies | after guards |
| ☐ | Posts with their settings (shifts, regulars, relief, section, place on the sheet) | Setup → Posts | IPF ~60, ISI, Cumbum Gate |
| ☐ | Settings: API keys (number-plate, voice) | Prem copies by hand in the console (never in chat or git) | 2 |

Settings that make themselves: VAPID keys (first push), `aadhaar_key` (first Aadhaar), `qr_cron_key` (Admin → Gate QR).

## 4. November rosters

| ✔ | Roster | File |
|---|---|---|
| ☐ | Estancia · IPF · 2026-11 | `~/Downloads/IPF-Nov-2026-roster.xlsx` (from the agency PDF; PKL / MLCP / ESCORT / HOSPITAL sections set each guard's team) |
| ☐ | Estancia · ISI · 2026-11 | waiting for the ISI file |
| ☐ | Cumbum · ISI · 2026-11 | from the Cumbum schedule file (November sheet) |
| ☐ | After upload: Area = Escort shows this month's escort team | |

## 5. Cumbum QR gate

| ✔ | Step |
|---|---|
| ☐ | At the gate: Admin → Cumbum → 📍 Use my location → Save |
| ☐ | New QR (Production has a new key) → print → stick at the gate (the Dev QR stops working for Production) |
| ☐ | Each Cumbum guard: 🆕 New Registration once (face photo) |
| ☐ | Cron `qr_late_check` in Production: webhook to the Production URL `/server/escortAPI/qrLateCheck?key=<qr_cron_key>`, "15 6,9,14,22 * * *" IST |
| ☐ | Real alert receiver phone (now alerts go to Prem) |

## 6. Guards' phones

| ✔ | Step |
|---|---|
| ☐ | Every guard gets a **new link** (Setup → Guard links): Dev links do not open Production |
| ☐ | Each guard taps 🔔 to allow notifications again (push subscriptions are per environment) |

## 7. Go-live test (Sunday 1 Nov)

| ✔ | Test |
|---|---|
| ☐ | Schedule · Sun 1 Nov: Auto fill → Publish |
| ☐ | Mon 2 Nov: escort table S No 1, 2, 3 … (this month's escort team) |
| ☐ | One card IN / OUT (or the simulator) → Live board |
| ☐ | One Cumbum QR IN / OUT |
| ☐ | Attendances page shows the day |
| ☐ | A guard link opens the duty page; group chat works |

## Not moved (stays in Dev)

Old swipes, schedules, chats, photos, October rosters, test data.
