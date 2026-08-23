# server/routers/admin.py
import os
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Header, HTTPException

from .. import db, backup
from ..schemas import AdminLogin

router = APIRouter(prefix="/api/admin")


def _admin_password() -> str:
    return os.environ.get("ADMIN_PASSWORD", "change-me")


def require_admin(x_admin_password: str = Header(default=None)):
    if x_admin_password != _admin_password():
        raise HTTPException(status_code=401, detail="Incorrect admin password")


@router.post("/login")
def login(body: AdminLogin):
    if body.password != _admin_password():
        raise HTTPException(status_code=401, detail="Incorrect password")
    return {"ok": True}


@router.get("/stats")
def stats(x_admin_password: str = Header(default=None)):
    require_admin(x_admin_password)

    habits = db.all_active("habits")
    logs = db.all_active("habit_logs")
    todos = db.all_active("todos")
    expenses = db.all_active("expenses")
    goals = db.all_active("goals")

    total_spent = sum(e["amount"] for e in expenses)
    spend_by_category: dict[str, float] = {}
    for e in expenses:
        spend_by_category[e["category"]] = spend_by_category.get(e["category"], 0) + e["amount"]

    today = datetime.now(timezone.utc).date()
    last7 = [(today - timedelta(days=i)).isoformat() for i in range(6, -1, -1)]
    check_ins_per_day = [
        {"date": d, "count": sum(1 for l in logs if l["date"] == d and l["completed"])} for d in last7
    ]

    return {
        "counts": {
            "habits": len(habits),
            "todosOpen": sum(1 for t in todos if not t["completed"]),
            "todosDone": sum(1 for t in todos if t["completed"]),
            "expenses": len(expenses),
            "goals": len(goals),
        },
        "totalSpent": total_spent,
        "spendByCategory": spend_by_category,
        "checkInsPerDay": check_ins_per_day,
        "lastBackupAt": db.get_meta("last_backup_at"),
        "backupFolder": str(backup.BACKUP_DIR),
    }
