# EscortRoster React — handoff prompt (2026-10-09)

Paste the block below into a new Claude Code session started in `~/Desktop/EscortRoster-React`.

---

```
I'm Prem. This folder is the React + Vite rebuild of my Escort Duty Sheet on Zoho Catalyst
(frontend/ = React source, client/ = build output, functions/escortAPI/ = Node 22 Express
Advanced I/O function). Read README.md and notes/ first. Reply in Tanglish, simple words.

## Goal
Replace the Zoho Creator "Escort Entry" form that guards fill on mobile for every trip
(escort details, cab no, driver name, trip start/end, employees subform). Guards should log
everything inside this app instead.

## Already done (code is in this folder)
1. Data Store:
   - DutyRecords: new columns vehicle_no (varchar 20), driver_name (varchar 100).
     Each DutyRecords row = one trip (one Route cell: location, out_time, in_time).
   - New table TripStops: duty_record_id (bigint, mandatory), duty_date (date, mandatory),
     escort_id (bigint), emp_id (varchar 30), location (varchar 100),
     trip_type (varchar 10: Drop / Pickup), stop_time (varchar 10, HH:MM).
2. Backend routes (functions/escortAPI/index.js): /updateTripCab, /getTripStops, /addTripStop,
   /updateTripStop, /deleteTripStop, /getDayData (escorts + duty + stops in one call).
   deleteDutyRecord also deletes the trip's stops; wipeAllData also wipes TripStops.
3. Frontend:
   - RouteCell.jsx: after Out time, a trip bar under the cell:
     blue "👤 N +" (in progress), red "⚠️ Entry pending" (In time set but cab details or
     employees missing), green "✅ 👤 N" (complete = vehicle + driver + ≥1 employee).
     Bar is no-print. Only on the main duty table (not Extra / Sunday pickup).
   - TripPopup.jsx: cab section (Vehicle No + Driver Name, once per trip, editable any time)
     + employee list (edit ✏️ / delete 🗑) + new employee form (Emp ID, Location,
     Drop/Pickup, Time auto = now). One Save button saves cab + employee.
   - App.jsx: stops state, saveTripCab / saveTripStop / deleteTripStop actions.
   - Auto-refresh 5 s → 30 s, paused while the tab is hidden, one /getDayData call.
4. Tested locally with catalyst serve: API CRUD + cascade delete passed; browser test
   showed blue / red / green bars and delete working.

## Rules agreed with Prem
- [+] appears only after Out time (trip starts then).
- In time is ALWAYS allowed (guard or head guard), even if paperwork is incomplete,
  because In time decides the rotation. Incomplete trips show red until filled.
- Guard and head guard can both fill / edit / delete employee entries, even after In time.
- Driver mobile not needed.
- Login / head-guard permissions: PAUSED until the end.

## Problem hit on 2026-10-09
Catalyst returned FREE_USAGE_LIMIT_REACHED (Datastore - Fetch) for the old account,
caused by 5 s polling across several tabs. The polling fix (item 3 above) is done but
NOT yet tested with real data.

## Pending (in this order)
1. Test the polling change + trip popup with real data (local serve first).
2. Commit + push, then deploy to Development (`cd frontend && npm run build && cd .. && catalyst deploy`).
3. Dashboard (separate page, opened by a "📊 Dashboard" button on the toolbar for now):
   - Part 1: cards (Trips, Drop, Pickup, Pending) + guard-wise table
     (Trips / Drop / Pickup / Total employees), filter Today / Week / Month.
   - Part 2: trip details table (guard, location, out, in, vehicle, driver, emp count, 🟢/🔴),
     tap a row to see its employees.
4. Login system + head guard permission (HG mark on In time) — last.

## If this is a NEW Catalyst account
I will log in myself (`catalyst login`, MCP authentication). Then: create a project, create
tables Escorts, DutyRecords, Settings, TripStops with the same columns as the old project
(read the column list from functions/escortAPI/index.js and this file), update
.catalystrc / catalyst.json, serve + test locally, then deploy to Development.
Old data does not move; I'll re-upload the escorts Excel.
```

---

## Full table schema (copied from the old account, 2026-10-09)

All tables: scope GLOBAL. ROWID / CREATORID / CREATEDTIME / MODIFIEDTIME are automatic.

| Table | Column | Type | Mandatory | Other |
|---|---|---|---|---|
| Escorts | escort_name | varchar 100 | yes | search index |
| Escorts | agency | varchar 50 | yes | search index |
| Escorts | mobile | varchar 20 | yes | search index |
| Escorts | id_no | varchar 20 | yes | search index |
| Escorts | is_active | varchar 10 | no | default `true` |
| Escorts | sort_order | int | no | default `0` |
| Settings | setting_key | varchar 50 | yes | |
| Settings | setting_value | varchar 50 | yes | |
| DutyRecords | duty_date | date | yes | |
| DutyRecords | escort_id | bigint | yes | search index |
| DutyRecords | seat_no | int | yes | |
| DutyRecords | route_no | int | yes | |
| DutyRecords | location | varchar 100 | no | |
| DutyRecords | out_time | varchar 10 | no | |
| DutyRecords | in_time | varchar 10 | no | |
| DutyRecords | remarks | varchar 200 | no | |
| DutyRecords | is_extra | varchar 10 | no | |
| DutyRecords | extra_name | varchar 100 | no | |
| DutyRecords | extra_agency | varchar 50 | no | |
| DutyRecords | extra_mobile | varchar 15 | no | |
| DutyRecords | extra_id_no | varchar 20 | no | |
| DutyRecords | is_sunday_pickup | varchar 10 | no | |
| DutyRecords | vehicle_no | varchar 20 | no | |
| DutyRecords | driver_name | varchar 100 | no | |
| TripStops | duty_record_id | bigint | yes | search index |
| TripStops | duty_date | date | yes | search index |
| TripStops | escort_id | bigint | no | search index |
| TripStops | emp_id | varchar 30 | no | |
| TripStops | location | varchar 100 | no | |
| TripStops | trip_type | varchar 10 | no | |
| TripStops | stop_time | varchar 10 | no | |
