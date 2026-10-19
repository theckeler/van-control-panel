"""
Last-resort recovery from a frozen event loop.

On 2026-10-19 the whole API stopped answering for 20+ minutes while the process
stayed "active": a subprocess spawn deadlocked and the event loop sat in a
synchronous read forever. Every other safety net in this codebase (the BMS
watchdog, the timeouts) is a coroutine, so a frozen loop disables all of them,
and systemd could not help either — it only restarts a service that has exited,
and a frozen loop cannot even act on SIGTERM.

So this runs on a plain thread, which keeps working when the loop does not. A
coroutine updates a heartbeat every few seconds; if the heartbeat goes stale
the thread writes every thread's stack to stderr (so the journal shows exactly
where it was stuck) and exits non-zero, which van-api.service's
Restart=on-failure turns into a restart.
"""
import asyncio
import faulthandler
import os
import sys
import threading
import time

BEAT_EVERY = 5
# Nothing here legitimately blocks the loop for anywhere near this long. The
# slowest synchronous work is SQLite rollups, which take seconds.
FROZEN_AFTER = 60
EXIT_CODE = 70  # EX_SOFTWARE; any non-zero code triggers Restart=on-failure

_last_beat = time.monotonic()
_stopping = threading.Event()


async def _beat() -> None:
    global _last_beat
    while True:
        _last_beat = time.monotonic()
        await asyncio.sleep(BEAT_EVERY)


def _write(msg: str) -> None:
    # os.write, not logging: if the frozen thread died holding the logging
    # lock, logging from here would deadlock the watchdog too.
    try:
        os.write(sys.stderr.fileno(), msg.encode())
    except OSError:
        pass


def _watch() -> None:
    while not _stopping.wait(BEAT_EVERY):
        stalled = time.monotonic() - _last_beat
        if stalled > FROZEN_AFTER:
            _write(
                f"CRITICAL loop_watchdog: event loop has not run for {stalled:.0f}s. "
                "Dumping every thread's stack, then exiting so systemd restarts van-api.\n"
            )
            faulthandler.dump_traceback(file=sys.stderr, all_threads=True)
            os._exit(EXIT_CODE)


def start() -> "asyncio.Task[None]":
    """Call from the running loop (the lifespan). Returns the heartbeat task."""
    global _last_beat
    _last_beat = time.monotonic()
    _stopping.clear()
    threading.Thread(target=_watch, name="loop-watchdog", daemon=True).start()
    return asyncio.create_task(_beat())


def stop() -> None:
    """Shutdown path: a slow but deliberate stop must not look like a freeze."""
    _stopping.set()
