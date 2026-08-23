#!/usr/bin/env bash
# Daily snapshot of van_power.db to the Mac over Tailscale.
#
# Installed at ~/van-backup.sh, driven by van-backup.timer.
# See CLAUDE.md → Backups and SETUP.md §9.

set -euo pipefail

DB="$HOME/van-control-panel/backend/van_power.db"
DEST_HOST="toddheckeler@100.100.169.71"
DEST_DIR="van-backups"
KEEP_LOCAL=3          # failed sends held on the Pi
KEEP_DAILY_DAYS=45    # keep every snapshot this recent on the Mac
KEEP_MONTHLY=true     # beyond that, keep only the 1st of each month

STAMP=$(date +%F)
TMP="/tmp/van_power-$STAMP.db"

# .backup rather than cp — the logger writes every 30s, so copying the
# file directly can capture a torn write.
sqlite3 "$DB" ".backup '$TMP'"
gzip -f "$TMP"

if ! scp -o ConnectTimeout=15 -o BatchMode=yes "$TMP.gz" "$DEST_HOST:$DEST_DIR/"; then
    # Mac asleep or off-network. Hold it and try again tomorrow.
    mkdir -p "$HOME/van-backups-pending"
    mv "$TMP.gz" "$HOME/van-backups-pending/"
    ls -1t "$HOME/van-backups-pending"/*.gz 2>/dev/null \
        | tail -n +$((KEEP_LOCAL+1)) | xargs -r rm -f
    echo "send failed, held locally"
    exit 1
fi

echo "backup sent: $(basename "$TMP.gz")"
rm -f "$TMP.gz"

# --- Retention on the Mac -------------------------------------------------
# Without this the folder grows forever. At ~150KB/day that is 55MB a year,
# which is not a disk problem but does make the folder useless to scan.
# Keep everything recent, then thin to monthly. Steady state ~50 files.
#
# Note the live DB prunes raw readings at 30 days, so snapshots older than
# that hold detail the Pi itself has discarded. That is the argument for
# thinning rather than deleting.
ssh -o ConnectTimeout=15 -o BatchMode=yes "$DEST_HOST" \
  "python3 - <<'PY'
import re, time, pathlib
KEEP_DAYS = $KEEP_DAILY_DAYS
d = pathlib.Path.home() / '$DEST_DIR'
now = time.time()
removed = 0
for f in sorted(d.glob('van_power-*.db.gz')):
    m = re.search(r'(\d{4})-(\d{2})-(\d{2})', f.name)
    if not m:
        continue
    y, mo, day = m.groups()
    age_days = (now - f.stat().st_mtime) / 86400
    if age_days <= KEEP_DAYS:
        continue
    if day == '01':          # keep the first of each month
        continue
    f.unlink()
    removed += 1
print(f'retention: removed {removed}, kept {len(list(d.glob(\"*.gz\")))}')
PY" || echo "retention step failed (non-fatal)"
