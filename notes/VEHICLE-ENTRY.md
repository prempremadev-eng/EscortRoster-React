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

## Later (one by one)

1. Vehicle photo (Stratus, photo_key)
2. Number plate scan
3. Voice to text (needs the API key)
