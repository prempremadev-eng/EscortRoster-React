# Escort Duty Sheet — React version

React + Vite rebuild of the Escort Duty Sheet (`~/Desktop/prem`), running on Zoho Catalyst.

| | |
|---|---|
| Catalyst project | `EscortRosterReact` (ID `41255000000306715`, org `60072483450`, Development) |
| Live app | https://escortrosterreact-60072483450.development.catalystserverless.in/app/index.html |
| API | https://escortrosterreact-60072483450.development.catalystserverless.in/server/escortAPI/ |
| Data Store | `Escorts`, `DutyRecords`, `Settings` (same columns as the old EscortRoster project) |

## Folder structure

```
EscortRoster-React/
├── catalyst.json            # Catalyst project config (functions + client)
├── .catalystrc              # links this folder to the EscortRosterReact project
├── client/                  # BUILD OUTPUT (vite build) — this is what `catalyst deploy` publishes
├── frontend/                # React source
│   ├── index.html
│   ├── vite.config.js       # builds into ../client, proxies /server to catalyst serve
│   ├── public/client-package.json
│   └── src/
│       ├── main.jsx
│       ├── App.jsx          # state, loading, saving, auto-refresh, upload flow
│       ├── api.js           # every fetch to /server/escortAPI
│       ├── utils.js         # dates, seat rotation, route locks, Excel parsing
│       ├── style.css        # old style.css (print layout unchanged) + popup error styles
│       └── components/
│           ├── Toolbar.jsx       DutyTable.jsx    ExtraSection.jsx
│           ├── PickupTable.jsx   RouteCell.jsx    TimePicker.jsx
│           ├── UploadPopup.jsx   Messages.jsx     Field.jsx
│           └── TableHeader.jsx   TableFooter.jsx
└── functions/escortAPI/     # Advanced I/O function (Node.js 22, Express)
    ├── index.js
    ├── package.json
    └── catalyst-config.json
```

## Run locally

```bash
cd frontend && npm install && npm run build      # builds into ../client
cd ../functions/escortAPI && npm install
cd ../.. && catalyst serve                        # http://localhost:3000/app/
```

`catalyst serve` uses the **real Development Data Store** — anything you type is saved for real.

For live-reload while editing React: keep `catalyst serve` running, then in another terminal
`cd frontend && npm run dev` (Vite proxies `/server/*` to port 3000).

## Deploy

```bash
cd frontend && npm run build && cd .. && catalyst deploy
```

## Notes

- Print layout: 15 escorts per page, A4 landscape, same columns as the old app (`@media print` in `style.css`).
- `syncEscortsFromExcel` deactivates every active escort whose mobile number is not in the uploaded file.
- `wipeAllData` (testing button) is now **POST** only and deletes all Escorts + DutyRecords.
