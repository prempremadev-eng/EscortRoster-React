# 🚗 Vehicle entry (decided with Prem, 22 Oct 2026)

Brought in from the separate vehicle entry app (option A: inside this app). Old entries are not brought over.

## Phase 1 (built 22 Oct)

| Part | What |
|---|---|
| **Which posts** | Only posts with **🚗 Vehicle entry** on in Post setup (Posts.vehicle_entry) |
| **Guard** | Post page **+ → Vehicle entry** (only on such a post, own post). Heading = post name. Type **Employee / Visitor / Vendor** → Save IN. List **Inside now** with **OUT**, and **Out today** |
| **Must fill** | Employee: vehicle no + employee no. Visitor: vehicle no, name, phone, coming from, whom to meet. Vendor: same, whom to meet optional (like the old app) |
| **Same vehicle twice** | Refused while it is still IN at that post ("Mark it OUT first") |
| **Supervisor / admins** | Rail / top bar **Vehicles** (#vehicles): one day + vehicles still inside. Filters: branch (or all my branches), post, type, Inside / Out, search. **+ New entry** (pick the post) to test or when the guard's phone is down. OUT can be marked there too |
| **Saved** | Table **VehicleEntries**: branch_id, post_id, guard_id (IN), out_guard_id, duty_date, shift_code, entry_type, vehicle_no, status IN/OUT, in_time, out_time, details (JSON: emp no / name / phone / from / meet / entered by / out by), photo_key (for later) |
| **Look** | Our app's colours, the old app's layout (type tabs on top, form, list). Can be changed later |

## Number plate layout (23 Oct)

- Always **TN 12 AB 0987**: capitals, a space where letters and digits meet (while typing), RTO number padded to 2 and the last number to 4 digits (on leaving the box, after a scan, and on the server). Bharat series stays **22 BH 1234 AA**.
- "Already IN" check ignores spaces (older entries were saved without them).
- The last number takes at most **4 digits**.
- **Seen before**: typing 3+ letters / digits of the number (usually the last 4 digits) lists the branch's earlier vehicles (last 300 entries, one read when the page opens). A tap fills the number, **type** and details (emp no / name / phone / from / meet); changing the number again clears what the tap filled; typing a full number that is exactly a known vehicle fills it by itself (no tap). A picked vehicle that is inside shows **Mark OUT**.

## Photo (built 22 Oct evening)

- Form: **📷 Vehicle photo (optional)** → phone camera → small preview (Retake / ✕). Made ~200 KB (1280 px JPEG) on the phone.
- Sent **after** the IN is saved; if only the photo fails, the IN stays ("IN is saved, but the photo was not").
- Kept in **Stratus** (bucket escortcardaccess-media, `vehicle/<post>/<date>/<entry>.jpg`), not in the Data Store: the row keeps only `photo_key` (the address). A photo is big and every list read would carry it.
- 📷 on the guard's lists and a **Photo** column on the Vehicles page → full-screen photo (link works one hour).
- Supervisor's + New entry has the same photo button.

## Number plate scan (built 22 Oct evening)

- **Scan** button next to the vehicle number → **camera inside the app** (live picture, like the old app) → **Capture** → the number is filled in (no camera app, no OK step, no 12 MP photo: was ~15 s, 23 Oct) ("check it with the vehicle"); the guard can still change it.
- Number on screen (scanned or typed) is a vehicle **inside** at that post → yellow box "… is inside since hh:mm" with **Mark OUT now** (scan at the gate does the OUT too, Prem 23 Oct).
- The scan photo also becomes the vehicle photo when none was taken yet (one photo, two uses).
- Service: **Plate Recognizer** (same as the old app), Indian plates. Its key is in the **Settings** table (`plate_recognizer_token`), **not in git** (public repo). No key / limit reached / no plate → a message, the guard types the number.

## Voice to text (built 23 Oct)

- 🎤 next to Employee no, Name, Phone, Coming from, Whom to meet: tap → beep → speak → stops by itself after a short pause (or tap ■).
- Same as the old app: the phone records a clip (MediaRecorder; iPhone mp4, Android webm), our server sends it to **Sarvam** (`saaras:v3`, ta-IN, mode **translit** = English letters; codemix gave Tamil script) and fills the text. Numbers spoken as words become digits ("double two five" → 225) in Employee no and Phone.
- **I speak** (above the fields): Tamil (default), English, Hindi, Telugu, Kannada, Malayalam, Bengali, Odia, Marathi, Gujarati, Punjabi or Any (auto). Kept on that phone. The text always comes in English letters.
- The browser's own speech recognition is not used (the old app found it hangs on iPhone Safari).
- Key in **Settings** (`sarvam_api_key`), not in git. No key / limit / error → a message, the guard types.
- iPhone needs **iOS 14.5 or newer** (MediaRecorder) and microphone allowed for Safari.

## Later

- Own speech model (open source + training): later, as a separate project (Prem, 23 Oct).
