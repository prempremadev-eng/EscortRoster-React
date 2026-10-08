# 🧱 EscortRoster React: Tech Stack + Learning Plan (Notes)

Date: 2026-10-08
Where: `~/Desktop/EscortRoster-React`, Catalyst project **EscortRosterReact**

---

## ❓ Tech stack na enna?

Oru app-a build panna use panna **ellaa technologies-oda list**.
Screen (frontend) + server (backend) + database + hosting.

> **En app = React + Vite + Node.js/Express + Zoho Catalyst (Functions + Data Store + Hosting)**

---

## 🍽️ Hotel story

| Hotel la | En app la | Tech |
|---|---|---|
| 🍽️ Plate (customer paakkuradhu) | Screen | **React** + plain **CSS** |
| 🧹 Plate arrange pannradhu | Build | **Vite** |
| 📄 Order list padikkura waiter | Excel upload | **SheetJS** |
| 🔥 Stove | Server runtime | **Node.js 22** |
| 🧑‍💼 Waiter | Routes (`/getEscorts`…) | **Express** |
| 🔑 Store room key | DB kooda pesuradhu | **zcatalyst-sdk-node** |
| 🏬 Store room | Tables | **Catalyst Data Store** |
| 🏢 Hotel building | Hosting + function | **Zoho Catalyst** |

Customer browser open pannuvaar → **React** screen kaattum → `api.js` order-a **Express** waiter kitta anuppum → **Node** kitchen la cook (function) → **Data Store** la save / edukkum → thirumbi screen ku varum.

---

## 🧩 Layer by layer

### 1. Frontend (`frontend/src/`)
| File | Velai |
|---|---|
| `App.jsx` | State, data load, save, auto-refresh |
| `api.js` | Ellaa `fetch` calls ore idathula |
| `utils.js` | Date, rotation, Excel padikkuradhu |
| `components/*.jsx` | Toolbar, DutyTable, TimePicker… chinna chinna parts |
| `style.css` | Old look + print layout (15 rows, A4 landscape) |

### 2. Backend (`functions/escortAPI/index.js`)
- Express app, **Advanced I/O** function
- Runtime **node22**
- **En node22?** → En laptop la Node v22. Local-um cloud-um same version la odinaa "inga work aagudhu, anga aagala" problem varaadhu.

### 3. Database (Catalyst Data Store)
| Table | Enna irukku |
|---|---|
| `Escorts` | Name, agency, mobile, ID, is_active, sort_order |
| `DutyRecords` | Date, escort_id, route, location, out/in time |
| `Settings` | start_date, last_upload_date |

### 4. Deploy
```bash
cd frontend && npm run build    # React → client/ folder
cd .. && catalyst deploy         # function + client → live
```

---

## 🧠 Indha project la naan paatha mukkiyamaana concepts

| Concept | Simple-a | Enga |
|---|---|---|
| Component | Screen-oda oru chinna part | `TimePicker.jsx` |
| Props | Parent → child data | `<DutyTable rotation={rotation} />` |
| `useState` | Maarura data-va nyabagam vechukkradhu | `const [view, setView]` |
| `useEffect` | Page load / timer | auto-refresh 5 sec |
| `async/await` | Server answer varra varaikkum wait | `await api.getEscorts()` |
| ZCQL `LIMIT` | Oru query la max 300 rows | `selectAll()` |
| Race condition | Rendu save orey nerathula → duplicate | save queue (`enqueue`) |
| Data migration | Old DB → new DB copy | escort_id remap pannom |

---

## 🚚 Data copy la kathukitta vishayam

- Pudhu row insert panna **pudhu ROWID** varum → `DutyRecords.escort_id`-a **pudhu ROWID ku maathanum** (remap).
- `is_active` default `'true'`. Null-a insert panna default-a eduthudum → so `'false'` nu pottom.

---

## ⏱️ Learning plan (daily 2–3 hrs)

| Step | Topic | Time |
|---|---|---|
| 1 | JS: `map/filter`, spread, `async/await`, `fetch`, modules | 1–2 weeks |
| 2 | React: component, props, `useState`, `useEffect`, `useRef` | 2–3 weeks |
| 3 | Express: GET/POST/PUT/DELETE, `req.query` vs `req.body` | 1–2 weeks |
| 4 | Catalyst Data Store: ZCQL, insert/update/delete, pagination | 1–2 weeks |
| 5 | Tools: Vite, npm, Git, DevTools Network tab | kooda kooda |
| 6 | Advanced: race condition, polling, print CSS, lazy load | kadaisiya |

| Level | Time |
|---|---|
| Code padichu puriyum | 3–4 weeks |
| Chinna changes neeye pannalaam | 6–8 weeks |
| Scratch la build pannalaam | 3–4 months |

---

## ✅ Recall questions (notes paakkaama answer pannu)

1. En app-oda tech stack-a oru line la sollu.
2. `api.js` file en thani-a vechom?
3. Backend ku en `node22` choose pannom?
4. ZCQL oru query la evlo rows max tharum? Adhukku enna pannom?
5. Data copy pannumbodhu `escort_id`-a en maathanom?
