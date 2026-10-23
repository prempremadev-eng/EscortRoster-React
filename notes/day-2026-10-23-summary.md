# Day summary: 23 Oct 2026 (Friday, till 02:19 on 24 Oct)

Time: 11:35 → 02:19 (meal 20:17–21:37, tea 00:31–00:41). Branch: `post-handover`. Mode: build now, learn later.
Main topics: **vehicle entry finished** (scan, voice, design), **publish after card IN**, **app auto update**, **roles and flow from a fresh start** (`notes/ROLES-FLOW.md`), first role builds.

## What we did

| # | Work | Result |
|---|---|---|
| 1 | Card IN before Publish | Page opens after Publish without a second swipe; "Your post is ready" push; "not published yet" message |
| 2 | App auto update | Phone reloads itself on a new build when the app comes back to the screen |
| 3 | Plate scan | Plate Recognizer, key in Settings; in-app camera like the old app: 16 s → 1.7 s |
| 4 | Scan of a car inside | "is inside since … · Mark OUT now" |
| 5 | Voice to text | Sarvam (from the old app), English letters, "I speak" language per phone, status under each field |
| 6 | Number plate | Always "TN 12 AB 0987", last number max 4 digits, pale "XX 00 XX 0000" hint |
| 7 | Seen before | Last 4 digits list earlier vehicles; tap fills type and details; changing the number clears them |
| 8 | Design | One simple card like the old app, type colours, 🎤 emoji, centred title, light Scan / Save, lists behind a bar |
| 9 | Phone Back | Returns to the chat page instead of closing the app |
| 10 | Publish speed | Bulk update (was up to 4 s) |
| 11 | Roles and flow | Supervisor work, shift report at start + 30 min (auto at + 45), report chain up to Admin, State Admin added, upper levels view only, setup flow |
| 12 | Builds 1–3 | State Admin (UserRoles.state), view-only rule, Branch Admin deletes wrong vehicle entries; admin users as a state → city → branch tree |
| 13 | Supervisor logins | Old personal logins deleted (Prem's call); agency shift incharge logins instead, shared office computer with Chrome profiles |

## Errors and how they were found

| Error | Cause | Fix |
|---|---|---|
| Not assigned after card IN | Schedule not published; no duty row made later | Duty row made when the page opens |
| Scan took 16 s | Big camera photo decoded twice + camera app OK step | In-app camera frame (1.7 s) |
| Phone stayed on an old build | No reload | Auto update |
| Tamil script in "Coming from" | Sarvam codemix mode | translit mode |
| Seen-before tap did nothing | Two functions named `pick`; the photo one replaced it | Renamed; found with a headless Chrome touch test |
| My mistake | First guessed the cause was the input blur | Tested properly and found the real cause |
| IPF incharge saved with agency BSS | Wrong pick in the form | Prem to fix with ✏️ |

## Honest rating

| Area | Rating | Why |
|---|---|---|
| Concept | 9/10 | Thought about the people (guard → supervisor → branch → city → state → admin) before the code |
| Debugging | 9/10 | Found the dead tap, slow scan, Tamil letters, old build, page that closed on Back |
| Recall | 6/10 | Build day, little revision |
| Typing | 6/10 | Fast Tanglish, some typos |
| Effort | 10/10 | 15-hour day with many phone tests |
| Overall | 9/10 | Vehicle entry is complete and the roles are designed |
