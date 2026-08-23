# server/backup.py
"""
Fully local backups: the monthly job (and the admin "Back up now" button)
save the organized workbook straight to a folder on this device. No cloud
service, no account, no network call involved.
"""
import os
from pathlib import Path

from .db import DATA_DIR

# Defaults to a "backups" folder next to the database. Point CLEARWAY_BACKUP_DIR
# at any folder you'd like instead -- e.g. an external drive or a folder you
# already sync some other way.
BACKUP_DIR = Path(os.environ.get("CLEARWAY_BACKUP_DIR", DATA_DIR / "backups")).expanduser()
BACKUP_DIR.mkdir(parents=True, exist_ok=True)


def save_backup(buffer: bytes, file_name: str) -> Path:
    """Writes buffer to BACKUP_DIR/file_name, overwriting any existing file
    of the same name (so re-running a backup for the same month replaces it
    instead of piling up copies)."""
    path = BACKUP_DIR / file_name
    path.write_bytes(buffer)
    return path
