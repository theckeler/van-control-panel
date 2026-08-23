"""
SQLite database service — tiered time-series storage for van telemetry.

Tiers:
  raw      — every reading (~30s), kept 30 days
  hourly   — avg/min/max per hour, kept 1 year
  daily    — avg/min/max per day, kept forever
  monthly  — avg/min per month, kept forever

Tables:
  readings_raw    — raw BMS + MPPT readings
  readings_hourly — hourly rollups
  readings_daily  — daily rollups
  readings_monthly— monthly rollups
"""
import sqlite3
import logging
from contextlib import contextmanager
from datetime import datetime, timezone, timedelta
from pathlib import Path

logger = logging.getLogger(__name__)

DB_PATH = Path(__file__).parent.parent.parent / "van_power.db"

RAW_RETAIN_DAYS     = 30
HOURLY_RETAIN_DAYS  = 365


# ------------------------------------------------------------------ #
# Schema                                                               #
# ------------------------------------------------------------------ #

_SCHEMA = """
CREATE TABLE IF NOT EXISTS readings_raw (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ts          TEXT NOT NULL,          -- ISO8601 UTC
    source      TEXT NOT NULL,          -- 'bms' | 'mppt'
    soc         REAL,
    voltage     REAL,
    current     REAL,
    temperature REAL,
    solar_power REAL,
    charge_state TEXT,
    daily_yield REAL,
    cell_v1     REAL,
    cell_v2     REAL,
    cell_v3     REAL,
    cell_v4     REAL
);

CREATE TABLE IF NOT EXISTS readings_hourly (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    hour_ts      TEXT NOT NULL UNIQUE,  -- ISO8601 UTC truncated to hour
    avg_soc      REAL,
    min_soc      REAL,
    max_soc      REAL,
    avg_voltage  REAL,
    avg_current  REAL,
    avg_temp     REAL,
    avg_solar    REAL,
    peak_solar   REAL,
    sample_count INTEGER
);

CREATE TABLE IF NOT EXISTS readings_daily (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    day_ts        TEXT NOT NULL UNIQUE,  -- YYYY-MM-DD UTC
    avg_soc       REAL,
    min_soc       REAL,
    max_soc       REAL,
    avg_voltage   REAL,
    avg_current   REAL,
    avg_temp      REAL,
    avg_solar     REAL,
    peak_solar    REAL,
    total_yield   REAL,
    sample_count  INTEGER
);

CREATE TABLE IF NOT EXISTS readings_monthly (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    month_ts      TEXT NOT NULL UNIQUE,  -- YYYY-MM UTC
    avg_soc       REAL,
    min_soc       REAL,
    avg_voltage   REAL,
    avg_current   REAL,
    avg_temp      REAL,
    avg_solar     REAL,
    peak_solar    REAL,
    total_yield   REAL,
    sample_count  INTEGER
);

CREATE INDEX IF NOT EXISTS idx_raw_ts     ON readings_raw(ts);
CREATE INDEX IF NOT EXISTS idx_raw_source ON readings_raw(source);
"""


# ------------------------------------------------------------------ #
# Connection                                                           #
# ------------------------------------------------------------------ #

@contextmanager
def _conn():
    con = sqlite3.connect(DB_PATH, timeout=10)
    con.row_factory = sqlite3.Row
    try:
        yield con
        con.commit()
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()


def init():
    """Create tables and indexes if they don't exist."""
    with _conn() as con:
        con.executescript(_SCHEMA)
    logger.info("Database initialised at %s", DB_PATH)


# ------------------------------------------------------------------ #
# Write raw reading                                                     #
# ------------------------------------------------------------------ #

def write_raw(
    source: str,
    ts: datetime,
    soc: float | None = None,
    voltage: float | None = None,
    current: float | None = None,
    temperature: float | None = None,
    solar_power: float | None = None,
    charge_state: str | None = None,
    daily_yield: float | None = None,
    cell_voltages: list[float] | None = None,
):
    cells = (cell_voltages or []) + [None, None, None, None]
    with _conn() as con:
        con.execute(
            """
            INSERT INTO readings_raw
              (ts, source, soc, voltage, current, temperature,
               solar_power, charge_state, daily_yield,
               cell_v1, cell_v2, cell_v3, cell_v4)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                ts.isoformat(),
                source,
                soc, voltage, current, temperature,
                solar_power, charge_state, daily_yield,
                cells[0], cells[1], cells[2], cells[3],
            ),
        )


# ------------------------------------------------------------------ #
# Rollups                                                               #
# ------------------------------------------------------------------ #

def rollup_hourly(hour: datetime):
    """Aggregate raw readings for a given UTC hour into readings_hourly."""
    hour_start = hour.replace(minute=0, second=0, microsecond=0)
    hour_end   = hour_start + timedelta(hours=1)
    hour_ts    = hour_start.isoformat()

    with _conn() as con:
        row = con.execute(
            """
            SELECT
                AVG(soc)        avg_soc,
                MIN(soc)        min_soc,
                MAX(soc)        max_soc,
                AVG(voltage)    avg_voltage,
                AVG(current)    avg_current,
                AVG(temperature)avg_temp,
                AVG(solar_power)avg_solar,
                MAX(solar_power)peak_solar,
                COUNT(*)        cnt
            FROM readings_raw
            WHERE ts >= ? AND ts < ?
            """,
            (hour_start.isoformat(), hour_end.isoformat()),
        ).fetchone()

        if not row or not row["cnt"]:
            return

        con.execute(
            """
            INSERT INTO readings_hourly
              (hour_ts, avg_soc, min_soc, max_soc, avg_voltage,
               avg_current, avg_temp, avg_solar, peak_solar, sample_count)
            VALUES (?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(hour_ts) DO UPDATE SET
              avg_soc=excluded.avg_soc, min_soc=excluded.min_soc,
              max_soc=excluded.max_soc, avg_voltage=excluded.avg_voltage,
              avg_current=excluded.avg_current, avg_temp=excluded.avg_temp,
              avg_solar=excluded.avg_solar, peak_solar=excluded.peak_solar,
              sample_count=excluded.sample_count
            """,
            (
                hour_ts,
                row["avg_soc"], row["min_soc"], row["max_soc"],
                row["avg_voltage"], row["avg_current"], row["avg_temp"],
                row["avg_solar"], row["peak_solar"], row["cnt"],
            ),
        )
    logger.debug("Hourly rollup: %s (%d samples)", hour_ts, row["cnt"])


def rollup_daily(day: datetime):
    """Aggregate hourly readings for a given UTC day into readings_daily."""
    day_ts    = day.strftime("%Y-%m-%d")
    day_start = datetime(day.year, day.month, day.day, tzinfo=timezone.utc)
    day_end   = day_start + timedelta(days=1)

    with _conn() as con:
        # Use hourly table for daily rollup
        row = con.execute(
            """
            SELECT
                AVG(avg_soc)   avg_soc,
                MIN(min_soc)   min_soc,
                MAX(max_soc)   max_soc,
                AVG(avg_voltage)avg_voltage,
                AVG(avg_current)avg_current,
                AVG(avg_temp)  avg_temp,
                AVG(avg_solar) avg_solar,
                MAX(peak_solar)peak_solar,
                SUM(sample_count) cnt
            FROM readings_hourly
            WHERE hour_ts >= ? AND hour_ts < ?
            """,
            (day_start.isoformat(), day_end.isoformat()),
        ).fetchone()

        # Get total yield from last raw reading of the day (MPPT resets daily)
        yield_row = con.execute(
            """
            SELECT daily_yield FROM readings_raw
            WHERE source = 'mppt' AND ts >= ? AND ts < ?
            ORDER BY ts DESC LIMIT 1
            """,
            (day_start.isoformat(), day_end.isoformat()),
        ).fetchone()

        if not row or not row["cnt"]:
            return

        con.execute(
            """
            INSERT INTO readings_daily
              (day_ts, avg_soc, min_soc, max_soc, avg_voltage,
               avg_current, avg_temp, avg_solar, peak_solar, total_yield, sample_count)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(day_ts) DO UPDATE SET
              avg_soc=excluded.avg_soc, min_soc=excluded.min_soc,
              max_soc=excluded.max_soc, avg_voltage=excluded.avg_voltage,
              avg_current=excluded.avg_current, avg_temp=excluded.avg_temp,
              avg_solar=excluded.avg_solar, peak_solar=excluded.peak_solar,
              total_yield=excluded.total_yield, sample_count=excluded.sample_count
            """,
            (
                day_ts,
                row["avg_soc"], row["min_soc"], row["max_soc"],
                row["avg_voltage"], row["avg_current"], row["avg_temp"],
                row["avg_solar"], row["peak_solar"],
                yield_row["daily_yield"] if yield_row else None,
                row["cnt"],
            ),
        )
    logger.debug("Daily rollup: %s", day_ts)


def rollup_monthly(month: datetime):
    """Aggregate daily readings for a given UTC month into readings_monthly."""
    month_ts    = month.strftime("%Y-%m")
    month_start = datetime(month.year, month.month, 1, tzinfo=timezone.utc)
    next_month  = (month_start + timedelta(days=32)).replace(day=1)

    with _conn() as con:
        row = con.execute(
            """
            SELECT
                AVG(avg_soc)   avg_soc,
                MIN(min_soc)   min_soc,
                AVG(avg_voltage)avg_voltage,
                AVG(avg_current)avg_current,
                AVG(avg_temp)  avg_temp,
                AVG(avg_solar) avg_solar,
                MAX(peak_solar)peak_solar,
                SUM(total_yield)total_yield,
                SUM(sample_count) cnt
            FROM readings_daily
            WHERE day_ts >= ? AND day_ts < ?
            """,
            (month_start.strftime("%Y-%m-%d"), next_month.strftime("%Y-%m-%d")),
        ).fetchone()

        if not row or not row["cnt"]:
            return

        con.execute(
            """
            INSERT INTO readings_monthly
              (month_ts, avg_soc, min_soc, avg_voltage, avg_current,
               avg_temp, avg_solar, peak_solar, total_yield, sample_count)
            VALUES (?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(month_ts) DO UPDATE SET
              avg_soc=excluded.avg_soc, min_soc=excluded.min_soc,
              avg_voltage=excluded.avg_voltage, avg_current=excluded.avg_current,
              avg_temp=excluded.avg_temp, avg_solar=excluded.avg_solar,
              peak_solar=excluded.peak_solar, total_yield=excluded.total_yield,
              sample_count=excluded.sample_count
            """,
            (
                month_ts,
                row["avg_soc"], row["min_soc"],
                row["avg_voltage"], row["avg_current"], row["avg_temp"],
                row["avg_solar"], row["peak_solar"],
                row["total_yield"], row["cnt"],
            ),
        )
    logger.debug("Monthly rollup: %s", month_ts)


# ------------------------------------------------------------------ #
# Pruning                                                               #
# ------------------------------------------------------------------ #

def prune(now: datetime | None = None):
    """Remove old raw and hourly data beyond retention windows."""
    now = now or datetime.now(timezone.utc)
    raw_cutoff    = (now - timedelta(days=RAW_RETAIN_DAYS)).isoformat()
    hourly_cutoff = (now - timedelta(days=HOURLY_RETAIN_DAYS)).isoformat()

    with _conn() as con:
        raw_del = con.execute(
            "DELETE FROM readings_raw WHERE ts < ?", (raw_cutoff,)
        ).rowcount
        hourly_del = con.execute(
            "DELETE FROM readings_hourly WHERE hour_ts < ?", (hourly_cutoff,)
        ).rowcount

    if raw_del or hourly_del:
        logger.info("Pruned %d raw, %d hourly rows", raw_del, hourly_del)


# ------------------------------------------------------------------ #
# Query helpers                                                         #
# ------------------------------------------------------------------ #

def query_raw(hours: int = 24, source: str | None = None, max_points: int = 300) -> list[dict]:
    """
    Raw readings from the last N hours, optionally filtered by source and
    bucket-averaged down to at most ~max_points rows per source.

    Charts render into ~900px, so shipping every 30s sample (≈2880 rows/day
    /source) is wasted bandwidth. Bucketing server-side cuts the payload by
    roughly 20x while preserving the shape of the curve. Row shape is
    unchanged, so callers and the frontend RawReading type still line up.

    Pass max_points=0 to disable downsampling and get every row.
    """
    now = datetime.now(timezone.utc)
    cutoff = (now - timedelta(hours=hours)).isoformat()

    where = "ts > ?"
    params: list = [cutoff]
    if source:
        where += " AND source = ?"
        params.append(source)

    if max_points <= 0:
        with _conn() as con:
            rows = con.execute(
                f"SELECT * FROM readings_raw WHERE {where} ORDER BY ts ASC",
                params,
            ).fetchall()
        return [dict(r) for r in rows]

    # Bucket width in minutes. Never go below the ~30s sample interval,
    # otherwise short windows get grouped pointlessly.
    bucket_min = max(0.5, (hours * 60) / max_points)

    sql = f"""
        SELECT
            MIN(id)           AS id,
            MIN(ts)           AS ts,
            source,
            AVG(soc)          AS soc,
            AVG(voltage)      AS voltage,
            AVG(current)      AS current,
            AVG(temperature)  AS temperature,
            AVG(solar_power)  AS solar_power,
            charge_state,
            MAX(daily_yield)  AS daily_yield,
            AVG(cell_v1)      AS cell_v1,
            AVG(cell_v2)      AS cell_v2,
            AVG(cell_v3)      AS cell_v3,
            AVG(cell_v4)      AS cell_v4
        FROM readings_raw
        WHERE {where}
        GROUP BY source,
                 CAST((julianday(ts) - julianday(?)) * 1440.0 / ? AS INTEGER)
        ORDER BY ts ASC
    """
    with _conn() as con:
        rows = con.execute(sql, params + [cutoff, bucket_min]).fetchall()
    return [dict(r) for r in rows]


def query_hourly(days: int = 7) -> list[dict]:
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    with _conn() as con:
        rows = con.execute(
            "SELECT * FROM readings_hourly WHERE hour_ts > ? ORDER BY hour_ts ASC",
            (cutoff,),
        ).fetchall()
    return [dict(r) for r in rows]


def query_daily(days: int = 30) -> list[dict]:
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
    with _conn() as con:
        rows = con.execute(
            "SELECT * FROM readings_daily WHERE day_ts > ? ORDER BY day_ts ASC",
            (cutoff,),
        ).fetchall()
    return [dict(r) for r in rows]


def query_monthly() -> list[dict]:
    with _conn() as con:
        rows = con.execute(
            "SELECT * FROM readings_monthly ORDER BY month_ts ASC"
        ).fetchall()
    return [dict(r) for r in rows]
