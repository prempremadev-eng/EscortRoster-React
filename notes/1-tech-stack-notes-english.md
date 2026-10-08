# 🧱 EscortRoster React: Tech Stack + Learning Plan (Notes – English)

Date: 2026-10-08
Where: `~/Desktop/EscortRoster-React`, Catalyst project **EscortRosterReact**

---

## ❓ What is a tech stack?

It is the **list of all the technologies** used to build an app:
the screen (frontend) + the server (backend) + the database + hosting.

> **My app = React + Vite + Node.js/Express + Zoho Catalyst (Functions + Data Store + Hosting)**

---

## 🍽️ Hotel story

| In the hotel | In my app | Tech |
|---|---|---|
| 🍽️ Plate (what the customer sees) | Screen | **React** + plain **CSS** |
| 🧹 Arranging the plate | Build | **Vite** |
| 📄 Waiter who reads the order list | Excel upload | **SheetJS** |
| 🔥 Stove | Server runtime | **Node.js 22** |
| 🧑‍💼 Waiter | Routes (`/getEscorts`…) | **Express** |
| 🔑 Store room key | Talks to the DB | **zcatalyst-sdk-node** |
| 🏬 Store room | Tables | **Catalyst Data Store** |
| 🏢 Hotel building | Hosting + function | **Zoho Catalyst** |

The customer opens the browser → **React** shows the screen → `api.js` sends the order to the **Express** waiter → the cook (function) works in the **Node** kitchen → it saves to or reads from the **Data Store** → the answer comes back to the screen.

---

## 🧩 Layer by layer

### 1. Frontend (`frontend/src/`)
| File | Job |
|---|---|
| `App.jsx` | State, loading data, saving, auto-refresh |
| `api.js` | Every `fetch` call in one place |
| `utils.js` | Dates, rotation, reading Excel |
| `components/*.jsx` | Small parts: Toolbar, DutyTable, TimePicker… |
| `style.css` | The old look + print layout (15 rows, A4 landscape) |

### 2. Backend (`functions/escortAPI/index.js`)
- An Express app running as an **Advanced I/O** function
- Runtime **node22**
- **Why node22?** → My laptop has Node v22. When local and cloud use the same version, we avoid "it works here but not there" problems.

### 3. Database (Catalyst Data Store)
| Table | What it holds |
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

## 🧠 Key concepts I saw in this project

| Concept | In simple words | Where |
|---|---|---|
| Component | One small part of the screen | `TimePicker.jsx` |
| Props | Data from parent → child | `<DutyTable rotation={rotation} />` |
| `useState` | Remembers data that changes | `const [view, setView]` |
| `useEffect` | Runs on page load / timers | 5-second auto-refresh |
| `async/await` | Waits for the server's answer | `await api.getEscorts()` |
| ZCQL `LIMIT` | Max 300 rows per query | `selectAll()` |
| Race condition | Two saves at once → duplicate row | save queue (`enqueue`) |
| Data migration | Copying old DB → new DB | we remapped escort_id |

---

## 🚚 What I learned from the data copy

- Inserting a row gives it a **new ROWID** → `DutyRecords.escort_id` must be **changed to the new ROWID** (remap).
- `is_active` defaults to `'true'`. Inserting null would take the default → so we used `'false'`.

---

## ⏱️ Learning plan (2–3 hours a day)

| Step | Topic | Time |
|---|---|---|
| 1 | JS: `map/filter`, spread, `async/await`, `fetch`, modules | 1–2 weeks |
| 2 | React: component, props, `useState`, `useEffect`, `useRef` | 2–3 weeks |
| 3 | Express: GET/POST/PUT/DELETE, `req.query` vs `req.body` | 1–2 weeks |
| 4 | Catalyst Data Store: ZCQL, insert/update/delete, pagination | 1–2 weeks |
| 5 | Tools: Vite, npm, Git, DevTools Network tab | alongside |
| 6 | Advanced: race conditions, polling, print CSS, lazy loading | last |

| Level | Time |
|---|---|
| Can read and understand the code | 3–4 weeks |
| Can make small changes myself | 6–8 weeks |
| Can build it from scratch | 3–4 months |

---

## 🗣️ Spoken English practice (read aloud)

1. "My app is built with React on the frontend and Node.js with Express on the backend."
2. "The data is stored in Zoho Catalyst Data Store, and the app is hosted on Catalyst."
3. "I chose Node 22 because my laptop runs Node 22, so local and cloud behave the same."
4. "I keep all the API calls in one file called api.js, so they are easy to find and change."
5. "ZCQL returns at most three hundred rows, so I read the data page by page."
6. "When I copied the data, I had to map the old escort IDs to the new ones."
7. "Could you explain what a race condition is?" → "It happens when two saves run at the same time and create a duplicate."
8. "I'm planning to learn this step by step: JavaScript first, then React, then the backend."

---

## ✅ Recall questions (answer without looking)

1. Say my app's tech stack in one line.
2. Why did we keep `api.js` as a separate file?
3. Why did we choose `node22` for the backend?
4. What is the maximum number of rows ZCQL returns per query? What did we do about it?
5. Why did we change `escort_id` while copying the data?
