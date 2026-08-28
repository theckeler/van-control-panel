#!/usr/bin/env bash
set -euo pipefail

# Idempotent Pi rebuild script — safe to re-run after any failure, since
# every step checks before acting instead of assuming a clean slate.
# Every check in here came from something that actually went wrong during
# the 2026-08-28 rebuild, not a hypothetical.
#
# Prereqs, set in Raspberry Pi Imager before first boot (not here):
#   hostname: van-pi, username: todd, SSH enabled, WiFi: OHeck ONLY.
# Do not add Starlink credentials in the Imager — see the summary this
# script prints at the end for why, and the follow-up steps.
#
# Usage:
#   scp scripts/pi-setup.sh todd@van-pi.local:~/
#   ssh todd@van-pi.local
#   chmod +x pi-setup.sh && ./pi-setup.sh

log()  { echo -e "\n\033[1;36m==> $1\033[0m"; }
warn() { echo -e "\033[1;33mWARNING: $1\033[0m"; }
die()  { echo -e "\033[1;31mERROR: $1\033[0m"; exit 1; }

# --- 0. Passwordless sudo ---------------------------------------------------
log "Passwordless sudo"
if ! sudo -n true 2>/dev/null; then
  echo "One-time password prompt to set up NOPASSWD sudo:"
  echo "todd ALL=(ALL) NOPASSWD:ALL" | sudo tee /etc/sudoers.d/010_todd-nopasswd >/dev/null
fi

# --- 1. System update -------------------------------------------------------
log "System update"
sudo apt update
if ! sudo apt full-upgrade -y; then
  die "full-upgrade failed. Check for a corrupted package download:
  sudo rm -f /var/cache/apt/archives/*.deb
  sudo apt clean
  sudo apt --fix-broken install
  Then re-run this script."
fi

if [ -f /var/run/reboot-required ]; then
  warn "A reboot is required (new kernel installed but not running yet)."
  echo "This was a confirmed source of odd mDNS/service flakiness on the"
  echo "2026-08-28 rebuild. Run: sudo reboot"
  echo "Then re-run this script — everything above this point is done."
  exit 0
fi

# --- 2. System packages ------------------------------------------------------
log "System packages"
sudo apt install -y git python3-venv python3-pip sqlite3 \
                    bluez bluez-tools avahi-daemon avahi-utils \
                    network-manager

if ! command -v node >/dev/null 2>&1 || [[ "$(node --version)" != v20* ]]; then
  log "Installing Node 20"
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt install -y nodejs
fi
echo "Node: $(node --version)"

# --- 3. Tailscale -------------------------------------------------------
# WiFi stays OHeck-only here, deliberately — Starlink is added as a
# separate, explicit step after the heavy installs are done (see the
# summary at the end). Confirmed 2026-08-28: Starlink's real signal
# obstruction turned a 36MB package into a 20+ minute ordeal; OHeck did
# the same install in under a minute.
log "Tailscale"
if ! command -v tailscale >/dev/null 2>&1; then
  # Starlink's own router DNS can hang even when raw IP connectivity is
  # fine (confirmed 2026-08-28) — but we're on OHeck here by design, so
  # this check is just a safety net in case OHeck's DNS ever misbehaves.
  if ! curl -s -m 8 -o /dev/null https://tailscale.com; then
    warn "DNS resolution failed — applying a public resolver override"
    ACTIVE_CONN=$(nmcli -t -f NAME,DEVICE connection show --active | grep wlan0 | cut -d: -f1 || true)
    if [ -n "$ACTIVE_CONN" ]; then
      sudo nmcli connection modify "$ACTIVE_CONN" ipv4.dns "1.1.1.1 8.8.8.8"
      sudo nmcli connection modify "$ACTIVE_CONN" ipv4.ignore-auto-dns yes
      sudo nmcli connection up "$ACTIVE_CONN"
    fi
  fi
  curl -fsSL https://tailscale.com/install.sh | sh
fi
sudo systemctl enable --now tailscaled

if ! tailscale ip -4 >/dev/null 2>&1; then
  echo ""
  echo "Not logged in to Tailscale yet — needs your browser, not automatable:"
  echo "  sudo tailscale up"
  echo "Then re-run this script; everything above this point is done."
  exit 0
fi
echo "Tailscale IP: $(tailscale ip -4)"
echo "If this differs from docs/SETUP.md's Reference table, that table and"
echo "five other files need updating — see the note in SETUP.md step 4."

# --- 4. Clone or update the repo --------------------------------------------
log "Repo"
cd ~
if [ -d van-control-panel/.git ]; then
  echo "Already cloned — pulling instead"
  git -C van-control-panel fetch origin main -q
  git -C van-control-panel reset --hard origin/main -q
else
  git clone https://github.com/theckeler/van-control-panel.git
fi
cd van-control-panel

# --- 5. Backend --------------------------------------------------------------
log "Backend"
cd backend
if [ ! -d .venv ]; then
  python3 -m venv .venv
fi
.venv/bin/pip install --upgrade pip -q
.venv/bin/pip install -r requirements.txt

if [ ! -f .env ]; then
  log "Creating backend/.env"
  touch .env
  echo "# VICTRON_KEY and VAN_API_KEY are optional — add manually if a copy" >> .env
  echo "# exists on the Mac at ~/websites/van-control-panel/backend/.env" >> .env
  echo "backend/.env created empty. It's fine to leave VICTRON_KEY/VAN_API_KEY unset —"
  echo "config.py defaults both to empty strings."
else
  echo "backend/.env already exists, leaving it alone"
fi
cd ..

# --- 6. Frontend ---------------------------------------------------------
log "Frontend"
cd frontend
npm install --include=dev
npm run build

if [ ! -f .env ]; then
  log "Creating frontend/.env"
  SECRET=$(openssl rand -hex 32)
  echo "VAN_SESSION_SECRET=$SECRET" > .env
  echo ""
  echo "Dashboard login password, typed hidden:"
  read -rsp "VAN_PASSWORD: " VAN_PW
  echo ""
  echo "VAN_PASSWORD=$VAN_PW" >> .env
  echo "frontend/.env created — this is what server.mjs actually reads in"
  echo "production, not backend/.env. Confused these once already tonight."
else
  echo "frontend/.env already exists, leaving it alone"
fi
cd ..

# --- 7. systemd services -----------------------------------------------------
log "systemd services"
sudo tee /etc/systemd/system/van-api.service > /dev/null <<'EOF'
[Unit]
Description=Van Control Panel API
After=network.target bluetooth.target

[Service]
Type=simple
User=todd
WorkingDirectory=/home/todd/van-control-panel/backend
ExecStart=/home/todd/van-control-panel/backend/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo tee /etc/systemd/system/van-frontend.service > /dev/null <<'EOF'
[Unit]
Description=Van Dashboard Frontend
After=network.target van-api.service

[Service]
Type=simple
User=todd
WorkingDirectory=/home/todd/van-control-panel/frontend
EnvironmentFile=/home/todd/van-control-panel/frontend/.env
ExecStart=/usr/bin/node server.mjs
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now van-api van-frontend

# Bluetooth is soft-blocked by default on a fresh Raspberry Pi OS Lite
# install — confirmed 2026-08-28. Nothing BLE-related (BMS, Victron,
# EcoFlow) works until this is unblocked. Doing it here rather than
# expecting it to just work.
log "Unblocking Bluetooth"
sudo rfkill unblock bluetooth
sudo systemctl restart bluetooth
sleep 2
if bluetoothctl show | grep -q "Powered: yes"; then
  echo "Bluetooth adapter is on"
else
  warn "Bluetooth still showing as off — check rfkill list manually"
fi

# NetworkManager dispatcher: makes the Pi proactively return to Starlink
# when it reappears, instead of sitting on OHeck indefinitely after a
# Starlink outage. Without this, autoconnect-priority is only evaluated
# at boot or after a disconnect — confirmed missing from this rebuild on
# 2026-08-28, which is why the dashboard felt slow when the Pi was stuck
# on a marginal OHeck signal with Starlink unavailable.
log "Network dispatcher"
sudo install -o root -g root -m 755 \
  ~/van-control-panel/scripts/90-prefer-starlink \
  /etc/NetworkManager/dispatcher.d/90-prefer-starlink
echo "dispatcher installed"

log "Verifying services actually came up"
sleep 3
if ! curl -s -m 8 http://localhost:8000/health | grep -q '"status"'; then
  die "van-api isn't answering. Check: sudo journalctl -u van-api -n 50 --no-pager"
fi
if ! curl -s -m 8 -o /dev/null -w "%{http_code}" http://localhost:3000/ | grep -q "200"; then
  die "van-frontend isn't answering. Check: sudo journalctl -u van-frontend -n 50 --no-pager"
fi
echo "Both services confirmed responding, not just 'started'."

# nginx as a reverse proxy on :80 so the dashboard is reachable without
# a port number. The config already exists in the repo — this just deploys
# it. Confirmed missing from pi-setup.sh on 2026-08-28, added manually.
log "nginx on :80"
sudo apt install -y nginx
sudo cp ~/van-control-panel/nginx.conf.example /etc/nginx/sites-available/van-control-panel
sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -sf /etc/nginx/sites-available/van-control-panel /etc/nginx/sites-enabled/van-control-panel
sudo nginx -t && sudo systemctl enable --now nginx
echo "nginx serving on :80"

# --- 8. Backup to the Mac ----------------------------------------------------
log "Backup script + timer"
install -m 755 ~/van-control-panel/scripts/van-backup.sh ~/van-backup.sh

if [ ! -f ~/.ssh/id_ed25519 ]; then
  ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519
fi
echo ""
echo "The backup script needs this Pi's key trusted on the Mac. Confirm the"
echo "Mac's actual username first (todd vs toddheckeler bit us tonight —"
echo "check with 'whoami' in a Mac terminal), then:"
echo "  ssh-copy-id <mac-username>@<mac-tailscale-ip>"
echo "This needs the Mac's password, typed interactively — not automatable."

sudo tee /etc/systemd/system/van-backup.service > /dev/null <<'EOF'
[Unit]
Description=Back up van_power.db to the Mac over Tailscale
After=network-online.target tailscaled.service

[Service]
Type=oneshot
User=todd
ExecStart=/home/todd/van-backup.sh
EOF

sudo tee /etc/systemd/system/van-backup.timer > /dev/null <<'EOF'
[Unit]
Description=Daily van_power.db backup

[Timer]
OnCalendar=daily
Persistent=true
RandomizedDelaySec=30m

[Install]
WantedBy=timers.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now van-backup.timer

# --- Done. Everything below here is deliberately manual --------------------
echo ""
echo "======================================================================"
echo " Automated setup complete. van-api and van-frontend are confirmed"
echo " actually responding, not just started."
echo ""
echo " Real, deliberate manual steps left — each needs either your browser,"
echo " your password, or a decision this script shouldn't make for you:"
echo ""
echo " 1. Restore the database, if you have a backup on the Mac:"
echo "    (run FROM the Mac, not here — see docs/SETUP.md step 7)"
echo ""
echo " 2. Add Starlink WiFi now that heavy installs are done:"
echo "    see docs/SETUP.md step 3 — do this now, not before, or you'll"
echo "    repeat tonight's 20-minute-download problem"
echo ""
echo " 3. GitHub Actions runner (optional) — needs a fresh token generated"
echo "    in the GitHub UI each time, can't be scripted:"
echo "    see docs/SETUP.md step 10"
echo ""
echo " 4. Copy VICTRON_KEY / VAN_API_KEY into backend/.env if you have them"
echo "    saved on the Mac"
echo "======================================================================"
