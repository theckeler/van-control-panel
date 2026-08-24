"""
On-demand database snapshot for download.

Complements the nightly scp to the Mac: that one needs the Mac awake and
reachable, this one puts a copy on whatever device you are holding.

Deliberately database only. No .env, no NetworkManager profiles, no session
secret. The dashboard sits behind a password but van-api is reachable with an
API key, and an endpoint that hands out WiFi credentials and the Victron key is
a different risk class from one that hands out battery history. The secrets are
either regenerable or documented in SETUP.md.
"""
import asyncio
import gzip
import shutil
import sqlite3
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from app.services import db


def _snapshot_sync(dest: Path) -> None:
    """
    Consistent copy via SQLite's backup API.

    Not shutil.copy — the logger writes every 30 seconds and a plain file copy
    can capture a torn write.
    """
    src = sqlite3.connect(db.DB_PATH)
    try:
        out = sqlite3.connect(dest)
        try:
            src.backup(out)
        finally:
            out.close()
    finally:
        src.close()


async def make_snapshot() -> tuple[Path, str]:
    """
    Produce a gzipped snapshot in a temp dir.

    Returns (path, download_filename). Caller is responsible for cleanup.
    Runs in a thread — sqlite backup and gzip are blocking, and the event loop
    is also servicing BLE polling.
    """
    tmpdir = Path(tempfile.mkdtemp(prefix="van-backup-"))
    raw = tmpdir / "van_power.db"

    await asyncio.to_thread(_snapshot_sync, raw)

    gz = tmpdir / "van_power.db.gz"
    def _compress() -> None:
        with open(raw, "rb") as f_in, gzip.open(gz, "wb", compresslevel=6) as f_out:
            shutil.copyfileobj(f_in, f_out)
    await asyncio.to_thread(_compress)

    raw.unlink(missing_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return gz, f"van_power-{stamp}.db.gz"


def cleanup(path: Path) -> None:
    """Remove the temp dir once the response has been sent."""
    try:
        shutil.rmtree(path.parent, ignore_errors=True)
    except Exception:
        pass


async def status() -> dict:
    """
    What a download would contain, and how the nightly job is faring.

    last_scheduled_run comes from the systemd timer rather than anything we
    record, so it reflects reality even if the script failed. pending_failed
    counts snapshots stuck on the Pi because the Mac was asleep — a steady
    non-zero value means the nightly job has not landed in a while.
    """
    result: dict = {
        "db_size_bytes": None,
        "last_scheduled_run": None,
        "pending_failed": 0,
        "row_counts": {},
    }

    try:
        result["db_size_bytes"] = db.DB_PATH.stat().st_size
    except OSError:
        pass

    pending = Path.home() / "van-backups-pending"
    if pending.is_dir():
        result["pending_failed"] = len(list(pending.glob("*.gz")))

    try:
        proc = await asyncio.create_subprocess_exec(
            "systemctl", "show", "van-backup.timer",
            "--property=LastTriggerUSec", "--value",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        out, _ = await asyncio.wait_for(proc.communicate(), timeout=3.0)
        text = out.decode().strip()
        if text and text != "n/a":
            result["last_scheduled_run"] = text
    except (OSError, asyncio.TimeoutError):
        pass

    try:
        result["row_counts"] = await asyncio.to_thread(_row_counts)
    except Exception:
        pass

    return result


def _row_counts() -> dict[str, int]:
    counts: dict[str, int] = {}
    con = sqlite3.connect(db.DB_PATH)
    try:
        for table in ("readings_raw", "readings_hourly", "readings_daily", "events"):
            try:
                counts[table] = con.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            except sqlite3.Error:
                pass
    finally:
        con.close()
    return counts
