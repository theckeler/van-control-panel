# Rebuilding the Pi from scratch

Recovery checklist for a dead SD card or a fresh Pi. Written as an ordered
walkthrough rather than a script, because several steps need a token, a
password, or a decision that cannot be committed to the repo.

**Added 2026-08-28: `scripts/pi-setup.sh` now automates everything below
that doesn't genuinely need a human — steps 1, 2, 4, 5, 6, 7, 8. It's
idempotent (safe to re-run after any failure) and every check in it came
from something that actually went wrong during a real rebuild, not a
guess. Also runnable as the "Pi: run full setup script" VS Code task.**

```bash
scp scripts/pi-setup.sh todd@van-pi.local:~/
ssh todd@van-pi.local
chmod +x pi-setup.sh && ./pi-setup.sh
```

Steps 3 (WiFi/Starlink), 9 (backups — mostly automated by the script, one
manual trust step), 10 (GitHub Actions runner) still need you directly — the
script prints exactly which ones and why when it finishes. This walkthrough
stays the reference for understanding *why* each step exists, debugging when
something's genuinely different from a normal rebuild, or running any single
step in isolation.

Budget about an hour, most of it waiting on installs.

## What you need first

- The `backend/.env` values. A copy lives on the Mac at
  `~/websites/van-control-panel/backend/.env`, and the Victron key can be
  re-read from VictronConnect → the SmartSolar → Product info if that is lost.
- WiFi passwords for `Sir Salettelot` (Starlink) and `OHeck`.
- A Tailscale login.
- A GitHub personal access token, only if re-registering the Actions runner.
- The most recent `van_power-*.db.gz` from `~/van-backups` on the Mac, if you
  want the history back.

## Reference

| Thing | Value |
|---|---|
| Hostname | `van-pi` |
| User | `todd` |
| Tailscale IP | `100.87.126.98` |
| Python | 3.13.5 |
| Node | v20.20.2 |
| OS | Debian Trixie (arm64), Raspberry Pi OS |
| Repo | `https://github.com/theckeler/van-control-panel` |

---

## 1. Flash the OS

Raspberry Pi Imager, 64-bit Raspberry Pi OS. In the imager's advanced options
set hostname `van-pi`, username `todd`, enable SSH, and add the OHeck WiFi
credentials. Starlink gets configured properly in step 3.

Boot it, then:

```bash
ssh todd@van-pi.local
sudo apt update && sudo apt full-upgrade -y
```

## 2. System packages

```bash
sudo apt install -y git python3-venv python3-pip sqlite3 \
                    bluez bluez-tools avahi-daemon avahi-utils \
                    network-manager
```

Node 20 is not in Debian's default repos at the right version:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version   # expect v20.x
```

## 3. WiFi: Starlink preferred, OHeck fallback

```bash
sudo nmcli device wifi connect "Sir Salettelot" password "<starlink-pass>" name starlink
sudo nmcli connection modify starlink connection.autoconnect-priority 100
sudo nmcli connection modify starlink 802-11-wireless.powersave 2
```

Then whatever the OHeck profile ended up called (the imager creates it via
netplan, so expect `netplan-wlan0-OHeck`):

```bash
nmcli -f NAME,TYPE connection show
sudo nmcli connection modify <oheck-profile> connection.autoconnect-priority 50
sudo nmcli connection modify <oheck-profile> 802-11-wireless.powersave 2
```

Verify:

```bash
nmcli -f NAME,AUTOCONNECT-PRIORITY connection show
iwconfig wlan0 | grep -E "ESSID|Signal level|Power Management|Tx excessive"
```

Want `Power Management:off`, `Tx excessive retries:0`, and a 5GHz association.
Signal around -55 dBm is normal. See `CLAUDE.md` → Networking for the band and
subnet details, and for why NetworkManager will not roam back to Starlink on
its own after an outage.

## 4. Tailscale

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

Follow the printed URL to authenticate. Confirm the address:

```bash
tailscale ip -4    # expect 100.87.126.98 if the machine name is reused
```

If the IP differs, update `frontend/vite.config.ts` on the Mac, which proxies
`/api` to that address.

## 5. Clone and build

```bash
cd ~
git clone https://github.com/theckeler/van-control-panel.git
cd van-control-panel
```

Backend:

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

Frontend:

```bash
cd ../frontend
npm install --include=dev
npm run build
```

`--include=dev` matters. If `NODE_ENV=production` is set in the shell, or npm
has `omit=dev` configured, a plain `npm install` **silently skips
devDependencies** — including `typescript`, which then fails the build with
`sh: tsc: command not found` while `package.json` still lists it. Check with:

```bash
echo "NODE_ENV=$NODE_ENV"; npm config get omit
```

`npm run build` matters too — `dist/` is gitignored, and `server.mjs` throws
`ENOENT ... dist/index.html` without it.

## 6. Secrets

`backend/.env` — copy from the Mac, or recreate:

```
VICTRON_MAC=E8:18:52:D1:81:B7
VICTRON_KEY=<32-char hex, VictronConnect → SmartSolar → Product info>
VAN_API_KEY=<generate, see below>
```

**`VAN_API_KEY` is not optional in practice.** uvicorn binds `0.0.0.0:8000`,
so an empty key leaves the API open to anyone on the same WiFi — including
`/system/shutdown`. It fails open deliberately so a bad deploy cannot lock you
out, which means an empty value silently gives you no protection.

```bash
python3 - <<'EOF'
import secrets, pathlib, re
key = secrets.token_hex(32)
p = pathlib.Path.home() / "van-control-panel/backend/.env"
s = p.read_text()
s = re.sub(r'^VAN_API_KEY=.*$', f'VAN_API_KEY={key}', s, flags=re.M) \
    if 'VAN_API_KEY' in s else s + f'\nVAN_API_KEY={key}\n'
p.write_text(s)
print(key)
EOF
```

Put the same value in `frontend/.env.local` **on the Mac** — the Vite dev proxy
reaches the Pi over Tailscale rather than loopback, so it needs the header or
every request 401s:

```
VAN_API_KEY=<same value>
```

`frontend/.env` on the Pi — the dashboard password and the cookie signing key.
The secret can be regenerated freely; it only invalidates existing browser
sessions.

```bash
echo "VAN_PASSWORD=<your dashboard password>" >> ~/van-control-panel/frontend/.env
echo "VAN_SESSION_SECRET=$(openssl rand -hex 32)" >> ~/van-control-panel/frontend/.env
```

Auth uses a stateless signed cookie, not `express-session`, so sessions survive
service restarts and redeploys. See `CLAUDE.md` → Auth.

## 7. Restore the database (optional)

Skip this and the logger starts a fresh history. To keep the old readings:

On the Mac:

```bash
scp ~/van-backups/van_power-<date>.db.gz todd@100.87.126.98:~/
```

On the Pi:

```bash
gunzip ~/van_power-<date>.db.gz
mv ~/van_power-<date>.db ~/van-control-panel/backend/van_power.db
```

Sanity check:

```bash
sqlite3 ~/van-control-panel/backend/van_power.db \
  "SELECT COUNT(*), MIN(ts), MAX(ts) FROM readings_raw;"
```

## 8. Systemd services

```bash
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
sudo systemctl status van-api van-frontend --no-pager
```

`van-frontend` binds port 80, which normally needs root. It runs as `todd`, so
if it fails with a permissions error:

```bash
sudo setcap 'cap_net_bind_service=+ep' /usr/bin/node
```

## 9. Backups

Generate a key and authorise it on the Mac so the transfer runs unattended:

```bash
ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519
cat ~/.ssh/id_ed25519.pub
```

On the Mac — enable System Settings → General → Sharing → **Remote Login**,
then:

```bash
mkdir -p ~/.ssh ~/van-backups && chmod 700 ~/.ssh
echo "<the pi's public key>" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

Test from the Pi before going further:

```bash
ssh -o StrictHostKeyChecking=accept-new toddheckeler@100.100.169.71 "echo connected"
```

Then the script:

```bash
# The script is versioned in the repo — don't paste a copy, it will drift.
install -m 755 ~/van-control-panel/scripts/van-backup.sh ~/van-backup.sh
~/van-backup.sh
```

Daily timer:

```bash
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
```

`Persistent=true` runs a missed job on next boot rather than skipping the day.
Runs fail when the Mac is asleep; the snapshot is held on the Pi and the next
successful run catches up. Only worth investigating after several days.

Retention runs on the Mac after each successful send: everything from the last
45 days is kept, then thinned to the 1st of each month. Steady state is ~50
files, ~8MB.

You can also pull a snapshot on demand from the dashboard — settings drawer →
Backup → Download database. That path does not need the Mac at all, which
makes it the quicker option mid-rebuild.

## 10. GitHub Actions runner (optional)

Only needed if you want pushes to `main` to auto-deploy. Everything works
without it; you would just pull and rebuild by hand.

Get a fresh token from the repo → Settings → Actions → Runners → New
self-hosted runner. The token in any old config is single-use and expired.

```bash
mkdir -p ~/actions-runner && cd ~/actions-runner
# grab the arm64 tarball URL from the page above
curl -o actions-runner.tar.gz -L <url-from-github>
tar xzf actions-runner.tar.gz
./config.sh --url https://github.com/theckeler/van-control-panel --token <token>
sudo ./svc.sh install todd
sudo ./svc.sh start
```

The deploy workflow uses `git fetch && git reset --hard origin/main` rather
than `git pull`, because the Pi may have locally modified files from rsync
during development.

**A push to `backend/**` restarts `van-api` on the live van. There is no
staging environment.**

## 11. Verify

```bash
systemctl status van-api van-frontend --no-pager | grep Active
curl -s localhost:8000/battery/ | python3 -m json.tool | head -5
curl -s localhost:8000/mppt/    | python3 -m json.tool | head -5
curl -s localhost:8000/shelly/  | python3 -m json.tool
avahi-browse -art | grep -i "_shelly._tcp" | sort -u
```

Then load `http://van-pi.local` from a machine on the same network, or the
Tailscale address from anywhere.

Expect the battery card to show offline for up to five minutes after a fresh
start — `STARTUP_DELAY` plus the BMS reconnect cooldown. That is normal, not a
failure.

---

## Things that will not survive a rebuild

- **BMS bond state.** The Power Queen may need a power cycle before it accepts
  the new Pi. See `TROUBLESHOOTING.md` for the disconnect-switch procedure.
- **Shelly config.** The Shellys hold their own WiFi credentials and are
  unaffected by a Pi rebuild, but if they were also reset, see `CLAUDE.md` →
  Networking for the `sta`/`sta1` provisioning calls.
- **Browser sessions.** A new `VAN_SESSION_SECRET` logs everyone out.

## Known gotchas

- `dist/` is gitignored. Forgetting `npm run build` produces
  `ENOENT ... dist/index.html` from a server that otherwise looks healthy.
- `nmcli` property syntax is `<setting>.<property>` with a dot —
  `802-11-wireless.powersave`, not a hyphen.
- Both routers used to hand out `192.168.1.0/24`. Starlink is now
  `192.168.4.0/24`. If a rebuild lands on a Starlink that has been factory
  reset, re-apply that change or the ambiguity comes back.
- `nmap` is not installed. To sweep a subnet:
  ```bash
  for i in $(seq 1 254); do (ping -c 1 -W 1 192.168.4.$i >/dev/null 2>&1 &) ; done
  sleep 5; ip neigh | grep -v FAILED
  ```
