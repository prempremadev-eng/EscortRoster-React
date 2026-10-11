# 🪪 Card Access feature — start prompt

Open Claude in THIS folder and paste the block below:

```bash
cd ~/Desktop/EscortRoster-CardAccess
claude
```

---

```
I'm Prem. This folder (~/Desktop/EscortRoster-CardAccess, git branch `card-access`) is a TEST COPY
of my live app ~/Desktop/EscortRoster-React (branch main). Don't touch the live folder/project.
Read README.md, notes/2-trip-entry-dashboard-notes-english.md and notes/HANDOFF-PROMPT.md first.
Reply in Tanglish, simple words, tables, hotel analogy. Explain WHY before code.

## Catalyst (already set up)
- Account premkumar.r@zohocorphelpdesk.com, org 60086856508, Development env
- Project EscortCardAccess, id 50225000000055071 (.catalystrc points here)
- Test URL: https://escortcardaccess-60086856508.development.catalystserverless.in/app/index.html
- Tables already created (same columns as live): Escorts, Settings, DutyRecords, TripStops. Empty —
  I will upload the escorts Excel.
- MCP: use the plugin catalyst-by-zoho server (ZohoMCP_getSchema / ZohoMCP_executeTool).
- Free tier is shared with my other projects in this account: keep Data Store reads low.

## Feature (agreed in discussion)
Real access-card database can't be used yet (no permission) → build with a DUMMY source.
1. When a guard's status becomes IN (access card), update our app automatically.
2. Send a Web Push notification (free) to the guard's phone at once: "✅ IN. Today your Seat 5".
3. Tapping it opens the guard page: the day's seat list, their own row highlighted,
   other IN guards' names, EMPTY rows for guards not IN yet.
4. Seats do NOT shift when someone is absent — empty seat stays empty.
5. Guard page opens only after that duty day's card IN, closes at 08:00 next morning
   (same SHIFT_END_HOUR rule as the app). Next day needs a new IN → new notification.
6. Supervisor duty sheet shows everyone with ✅ HH:MM (IN) / ⏳ (not IN).
7. Next-day rotation stays automatic (existing computeDisplayRows, Mon–Fri, rotation 4).
8. One-time setup per guard: supervisor shares a per-guard secret link / QR → guard opens it
   → taps Allow notifications. Android and iPhone (iPhone: Add to Home Screen, iOS 16.4+).

## Design decisions
- Dummy access DB = a Catalyst table `AccessLog` (+ an in-app Card Simulator page with IN/OUT
  buttons). A Catalyst Data Store Event Listener on AccessLog runs an Event function that
  marks the guard IN and sends the push. Later the real access system writes the same
  table / calls the same endpoint — nothing else changes ("one door").
- Push: standard Web Push (service worker + `web-push` npm, VAPID keys in env variables),
  subscriptions stored in a `PushSubscriptions` table; per-guard `guard_token` on Escorts.
- Login / head-guard permissions are still paused.

## Build order (one step at a time; I test after each step)
1. Tables: AccessLog, PushSubscriptions, Escorts.guard_token — show me the columns first
2. Card Simulator page (IN/OUT buttons)
3. Supervisor sheet ✅/⏳ marks
4. Guard setup page (secret link/QR → Allow → save subscription)
5. Event function: AccessLog IN → push
6. Guard page (seat list, ⭐ own row, empty seats, 08:00 lock)
7. iPhone: web app manifest / Add to Home Screen
8. Test on real Android + iPhone, deploy

When finished and tested, merge `card-access` into `main` in the live folder.
Start with step 1: show me the table design and ask before creating anything.
```
