# ClearWay 

> A quiet place to track habits, to-dos, and spending.

ClearWay is an offline-first personal tracker: a Progressive Web App (habits, to-dos, goals, expenses) backed by a lightweight FastAPI server. It works fully offline via IndexedDB, syncs in the background when a connection is available, and can export/back up your data to Excel automatically — no cloud account required.

---

##  Features

- **Habits** — daily/weekly check-ins with per-habit colors and weekly targets
- **To-dos** — priorities, due dates, notes, completion tracking
- **Goals** — track progress toward a target value with a deadline
- **Expenses** — category-tagged spending log
- **Offline-first** — every read/write hits IndexedDB first; the network is a background concern
- **Background sync** — dirty records queue locally and push/pull with the server once it's reachable, resolved last-write-wins on `updated_at`
- **Excel export** — one-click organized `.xlsx` workbook of all your data
- **Automatic monthly backup** — a scheduled job saves a workbook straight to a local backups folder on the 1st of each month at 03:00, no network involved
- **Admin dashboard** — password-protected stats: totals, spend by category, 7-day check-in trend, last backup time
- **Installable PWA** — manifest + service worker, calm muted color palette

---

##  Architecture

```
┌────────────────────┐        ┌─────────────────────┐
│   Browser (PWA)     │        │   FastAPI server     │
│  index.html/admin   │        │                       │
│  ┌───────────────┐  │  HTTP  │  routers/api.py       │
│  │  IndexedDB     │◄─┼───────┼─►routers/admin.py     │
│  │  (db.js)       │  │       │  db.py (SQLite, WAL)  │
│  └───────┬───────┘  │        │  excel_export.py      │
│          │ dirty     │        │  backup.py            │
│    sync.js (queue,   │        │  (APScheduler:        │
│    push/pull, retry) │        │   monthly backup job) │
└────────────────────┘        └─────────────────────┘
```

- The client always reads/writes **IndexedDB** first (`js/db.js`), so the app is fully usable offline.
- `js/sync.js` watches connectivity, pushes queued ("dirty") local changes to `/api/sync/push`, then pulls anything newer from `/api/sync/pull`. Conflicts resolve **last-write-wins** on `updated_at`.
- The FastAPI backend (`server/`) persists everything to a single SQLite file with soft deletes (`deleted_at`), so sync and export can always reconstruct current + historical state.
- A background `APScheduler` job (`server/main.py`) builds an Excel workbook and writes it to a local backups folder monthly; the same export logic powers the on-demand `/api/export/excel` endpoint and the admin "Back up now" button.

---

## Tech stack

| Layer | Technology |
|---|---|
| Backend | FastAPI, Uvicorn, SQLite (WAL mode) |
| Scheduling | APScheduler (monthly backup cron) |
| Export | openpyxl (`.xlsx` workbook generation) |
| Frontend | Vanilla JS, IndexedDB, Service Worker, Web App Manifest |
| Validation | Pydantic schemas |

---

##  Project structure

```
.
├── index.html            # Main app (habits, todos, goals, expenses)
├── admin.html            # Password-protected admin dashboard
├── manifest.json         # PWA manifest
├── sw.js                 # Service worker (offline shell)
├── css/styles.css
├── js/
│   ├── app.js             # UI logic
│   ├── db.js              # IndexedDB wrapper (ClearDB)
│   ├── sync.js             # Offline queue + background sync
│   └── admin.js            # Admin dashboard logic
└── server/
    ├── main.py             # FastAPI app, static mount, scheduler
    ├── db.py               # SQLite schema, upsert/sync helpers
    ├── schemas.py           # Pydantic request models
    ├── backup.py            # Local backup file writer
    ├── excel_export.py       # Builds the organized workbook
    └── routers/
        ├── api.py            # CRUD, sync, export, backup endpoints
        └── admin.py           # Password-gated stats endpoint
```



