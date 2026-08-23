# server/db.py
"""
Single source of truth on the server side. SQLite keeps this dependency-light
and trivially portable -- the whole database is one file, wherever you'd like
it to live on disk.
"""
import sqlite3
import os
from pathlib import Path
from datetime import datetime, timezone

# By default the database lives inside the project at server/data/clearway.db.
# Set CLEARWAY_DATA_DIR in .env to point it anywhere else on your device
# instead -- e.g. a folder in your Documents, or one you already sync with
# something else. The folder is created automatically if it doesn't exist.
DATA_DIR = Path(os.environ.get("CLEARWAY_DATA_DIR", Path(__file__).parent / "data")).expanduser()
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "clearway.db"

TABLES = ["habits", "habit_logs", "todos", "expenses", "goals"]

SCHEMA = """
CREATE TABLE IF NOT EXISTS habits (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#5B7F66',
  frequency TEXT DEFAULT 'daily',
  target_per_week INTEGER DEFAULT 7,
  archived INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS habit_logs (
  id TEXT PRIMARY KEY,
  habit_id TEXT NOT NULL,
  date TEXT NOT NULL,
  completed INTEGER DEFAULT 1,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE(habit_id, date)
);

CREATE TABLE IF NOT EXISTS todos (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  notes TEXT,
  due_date TEXT,
  priority TEXT DEFAULT 'normal',
  completed INTEGER DEFAULT 0,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  amount REAL NOT NULL,
  category TEXT DEFAULT 'general',
  note TEXT,
  date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  unit TEXT DEFAULT '',
  target_value REAL DEFAULT 100,
  current_value REAL DEFAULT 0,
  deadline TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
"""


def get_conn():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


_conn = get_conn()
_conn.executescript(SCHEMA)
_conn.commit()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_meta(key: str, fallback=None):
    row = _conn.execute("SELECT value FROM meta WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else fallback


def set_meta(key: str, value: str):
    _conn.execute(
        "INSERT INTO meta (key, value) VALUES (?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, str(value)),
    )
    _conn.commit()


def upsert(table: str, row: dict) -> dict:
    """
    Generic upsert used by the sync endpoint and direct CRUD routes.
    Last-write-wins on updated_at, which is enough for a single-user,
    few-device app.
    """
    cols = list(row.keys())
    existing = _conn.execute(f"SELECT updated_at FROM {table} WHERE id = ?", (row["id"],)).fetchone()
    if existing and existing["updated_at"] >= row["updated_at"]:
        return {"skipped": True}

    placeholders = ", ".join("?" for _ in cols)
    updates = ", ".join(f"{c} = excluded.{c}" for c in cols if c != "id")
    sql = (
        f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({placeholders}) "
        f"ON CONFLICT(id) DO UPDATE SET {updates}"
    )
    _conn.execute(sql, [row[c] for c in cols])
    _conn.commit()
    return {"skipped": False}


def all_since(table: str, since: str) -> list[dict]:
    rows = _conn.execute(
        f"SELECT * FROM {table} WHERE updated_at > ? ORDER BY updated_at ASC", (since,)
    ).fetchall()
    return [dict(r) for r in rows]


def all_active(table: str) -> list[dict]:
    rows = _conn.execute(f"SELECT * FROM {table} WHERE deleted_at IS NULL").fetchall()
    return [dict(r) for r in rows]


def soft_delete(table: str, row_id: str):
    ts = now_iso()
    _conn.execute(
        f"UPDATE {table} SET deleted_at = ?, updated_at = ? WHERE id = ?", (ts, ts, row_id)
    )
    _conn.commit()
