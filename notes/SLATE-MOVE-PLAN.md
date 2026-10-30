# NightOwl: new Catalyst project + Slate (plan, 30 Oct 2026)

Goal: a clean project named for the app (URL without "escort"), frontend on **Slate** (Git deploy, previews),
same backend code. The current project keeps running (Cumbum live) until the switch day.

## Why
| Now | After |
|---|---|
| URL `escortcardaccess-…` ("escort" gives the job away) | `nightowl-…` or a custom domain |
| Web Client Hosting (deprecated, `/app/`) | Slate (Git push → build → deploy, preview links) |
| One folder points at the old project | Two folders, two projects, one Git repo |

## What Slate changes in our code
| # | Change | Where | Why |
|---|---|---|---|
| 1 | API base from env: `import.meta.env.VITE_API_BASE` (absolute `https://<project>-<org>.catalystserverless.in/server/escortAPI`) | `frontend/src/api.js` | Slate is a different domain; relative `/server/...` breaks |
| 2 | Office calls send `Authorization: Zoho-oauthtoken <token>` from `catalyst.auth.generateAuthToken()` | `api.js` | Cookies do not cross domains; `auth.js` already reads `authorization` |
| 3 | Guard pages (`#guard/`, `#qr/`, `#group/`) stay token-in-URL, no login | – | Public routes, need only CORS |
| 4 | `public/_redirects` = `/* /index.html 200` and `/app/* / 200` | `frontend/public/` | SPA fallback; SDK's legacy `/app/` redirect |
| 5 | `public/client-package.json` with `"homepage": "/", "login_redirect": "/"` | `frontend/public/` | Login comes back to `/`, not `/app/` |
| 6 | Vite `base: '/'` (check `vite.config.js`) | – | Slate serves from root |
| 7 | Stratus bucket name from one constant / Settings (`escortcardaccess-media` is hard-coded in 3 places) | `functions/escortAPI` | Bucket names are per project |
| 8 | Links the app builds (guard links, QR, push `url`) use the app origin, not `/app/index.html` | `admin`, `qr`, `sw.js`, push payloads | Slate has no `/app/` |
| 9 | `.env.development` / `.env.production` | `frontend/` | Env is build-time only |

## Console (new project)
| # | Step |
|---|---|
| 1 | New project `NightOwl` (domain `nightowl`, cannot change later) |
| 2 | Slate → Start Exploring (one-time) |
| 3 | Data Store: the 30 tables + columns (try Infrastructure as Code export/import; else script from the Dev schema) |
| 4 | Stratus bucket (new name), Zia (face) available in IN DC |
| 5 | Authentication: Enable, email login, **Whitelisting → add the Slate domain with CORS on** |
| 6 | Users + `UserRoles` super_admin row |
| 7 | Job Scheduling: crons for late check + 00:05 auto schedule |
| 8 | Custom domain (when the company gives one) mapped to Slate |

## Local setup
```
~/Desktop/EscortRoster-CardAccess   → old project (live till switch)
~/Desktop/NightOwl                  → git clone, catalyst project:use NightOwl
```
`catalyst slate:link --source frontend --framework react-vite`, functions deploy with `catalyst deploy --only functions`.
Run locally with plain `catalyst serve` (never `npm run dev`: no login wrapper).

## Data
| Data | How |
|---|---|
| Setup (branches, agencies, guards, posts, logins) | Admin → 📦 Move setup: Export (old) → Import (new) |
| Month rosters (current month) | Upload the roster files again |
| Photos (guards, relievers) | Guards 📤 Export Excel with photos → 📥 Import Excel (new) |
| Aadhaar | Re-enter / re-import (old key cannot open it) |
| History (swipes, schedules, chats) | Stays in the old project (read there if needed) |

## Switch day (one evening)
1. Freeze: no edits in the old app after a set time.
2. Move setup + rosters + photos into the new Production.
3. New gate QR printed; new guard links sent; office logs in at the new URL.
4. Old app: a banner "moved to the new NightOwl" (or kept read-only for history).

## Order of work (about 2–3 days, after Cumbum go-live)
| Day | Work | Who |
|---|---|---|
| 1 | Project, Slate activate, tables, bucket, auth + whitelist | Prem (console) + Claude (tables by script) |
| 1 | Code changes 1–9 in a branch `slate`, local `catalyst serve` test | Claude |
| 2 | Deploy to new Dev, full test (login, schedule, QR IN/OUT + face, push, attendance, Excel) | Both |
| 2 | Custom domain if ready | Prem + IT |
| 3 | Promote to new Production, switch day | Both |

## Risks
| Risk | Plan |
|---|---|
| Cross-domain login fails | Test on Slate preview first; fallback: keep frontend on the function domain until fixed |
| Guards confused by a new link | Custom domain first, so only one change ever |
| Two projects billed for a while | Old project switched off after the switch |
