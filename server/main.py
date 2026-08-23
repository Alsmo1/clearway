# server/main.py
import io
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from . import db, backup
from .excel_export import build_workbook
from .routers import api, admin

PUBLIC_DIR = Path(__file__).parent.parent / "public"

scheduler = BackgroundScheduler()


def run_monthly_backup():
    """Runs at 03:00 on the 1st of every month. Saves the workbook straight
    to the local backups folder -- no network involved."""
    try:
        wb = build_workbook()
        buf = io.BytesIO()
        wb.save(buf)
        month_tag = db.now_iso()[:7]
        path = backup.save_backup(buf.getvalue(), f"ClearWay Monthly Backup - {month_tag}.xlsx")
        db.set_meta("last_backup_at", db.now_iso())
        print(f"[backup] Monthly backup saved to {path}")
    except Exception as err:
        print(f"[backup] Monthly backup failed: {err}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler.add_job(run_monthly_backup, CronTrigger(day=1, hour=3, minute=0))
    scheduler.start()
    print("ClearWay server ready.")
    print(f"Local backups folder: {backup.BACKUP_DIR}")
    yield
    scheduler.shutdown()


app = FastAPI(title="ClearWay", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

app.include_router(api.router)
app.include_router(admin.router)


@app.get("/health")
def health():
    return {"ok": True, "time": db.now_iso()}


# Static app files (index.html, admin.html, css/js/icons). Mounted last so
# it doesn't shadow the API routes above.
app.mount("/", StaticFiles(directory=PUBLIC_DIR, html=True), name="public")
