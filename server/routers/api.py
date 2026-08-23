# server/routers/api.py
import io
import uuid
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse

from .. import db, backup
from ..excel_export import build_workbook
from ..schemas import HabitCreate, TodoCreate, ExpenseCreate, GoalCreate, HabitToggle, SyncPush

router = APIRouter(prefix="/api")

TABLES = db.TABLES
CREATE_MODELS = {"habits": HabitCreate, "todos": TodoCreate, "expenses": ExpenseCreate, "goals": GoalCreate}


def new_id() -> str:
    return str(uuid.uuid4())


@router.get("/state")
def get_state():
    state = {t: db.all_active(t) for t in TABLES}
    state["serverTime"] = db.now_iso()
    state["lastBackupAt"] = db.get_meta("last_backup_at")
    return state


# ---- Offline sync: client pushes queued changes, then pulls anything -----
# newer from the server. Every record carries its own updated_at, so
# upsert() resolves conflicts last-write-wins.
@router.post("/sync/push")
def sync_push(payload: SyncPush):
    applied = {}
    for table in TABLES:
        applied[table] = 0
        for row in payload.changes.get(table, []):
            result = db.upsert(table, row)
            if not result["skipped"]:
                applied[table] += 1
    return {"ok": True, "applied": applied, "serverTime": db.now_iso()}


@router.get("/sync/pull")
def sync_pull(since: str = "0000-00-00T00:00:00.000Z"):
    changes = {t: db.all_since(t, since) for t in TABLES}
    return {"changes": changes, "serverTime": db.now_iso()}


# ---- Direct CRUD (used by the admin dashboard, and the client for --------
# anything not covered by the offline queue) -----
@router.post("/{table}")
def create_row(table: str, body: dict):
    if table not in TABLES:
        raise HTTPException(404)
    model = CREATE_MODELS[table](**body)
    ts = db.now_iso()
    row = {"id": new_id(), "created_at": ts, "updated_at": ts, "deleted_at": None, **model.model_dump()}
    db.upsert(table, row)
    return row


@router.put("/{table}/{row_id}")
def update_row(table: str, row_id: str, body: dict):
    if table not in TABLES:
        raise HTTPException(404)
    row = {**body, "id": row_id, "updated_at": db.now_iso()}
    db.upsert(table, row)
    return row


@router.delete("/{table}/{row_id}")
def delete_row(table: str, row_id: str):
    if table not in TABLES:
        raise HTTPException(404)
    db.soft_delete(table, row_id)
    return {"ok": True}


# ---- Habit check-in toggle (common enough to deserve a shortcut) ---------
@router.post("/habits/{habit_id}/toggle")
def toggle_habit(habit_id: str, body: HabitToggle):
    existing = db._conn.execute(
        "SELECT * FROM habit_logs WHERE habit_id = ? AND date = ? AND deleted_at IS NULL",
        (habit_id, body.date),
    ).fetchone()
    if existing:
        db.soft_delete("habit_logs", existing["id"])
        return {"completed": False}
    db.upsert(
        "habit_logs",
        {"id": new_id(), "habit_id": habit_id, "date": body.date, "completed": 1, "updated_at": db.now_iso(), "deleted_at": None},
    )
    return {"completed": True}


# ---- Excel export -- downloads straight to your device --------------------
@router.get("/export/excel")
def export_excel():
    wb = build_workbook()
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    filename = f"clearway-export-{db.now_iso()[:10]}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---- Local backup -- saves the workbook to a folder on this device --------
@router.post("/backup/now")
def backup_now():
    try:
        wb = build_workbook()
        buf = io.BytesIO()
        wb.save(buf)
        path = backup.save_backup(buf.getvalue(), "ClearWay Data.xlsx")
        db.set_meta("last_backup_at", db.now_iso())
        return {"ok": True, "path": str(path), "at": db.now_iso()}
    except Exception as err:
        return JSONResponse(status_code=500, content={"ok": False, "error": str(err)})


@router.get("/backup/folder")
def backup_folder():
    return {"path": str(backup.BACKUP_DIR)}
