# Rebuilding the Pi from scratch


**Last updated:** 2026-10-19
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
script prints exactly which ones and why when it finishes.

**The script does not cover the van's network topology.** It installs the
`90-prefer-starlink` dispatcher and nginx, but not the TwitchWiFi hotspot, the NAT
and `/etc/hosts` dispatcher (`70-hotspot-nat`), the fixed DHCP addresses for the
Shellys, the eth0 rescue port, or the USB backup drive. Without them the Pi comes
up and the dashboard loads, but the Shellys and the fridge bridge cannot be
reached. Those are steps 12 and 13 below, and they are manual. This walkthrough
stays the reference for understanding _why_ each step exists, debugging when
something's genuinely different from a normal rebuild, or running any single
step in isolation.

Budget about an hour, most of it waiting on installs.

## What you need first

- The `backend/.env` values. A copy lives on the Mac at
  `~/websites/van-control-panel/backend/.env`, and the Victron key can be
  re-read from VictronConnect → the SmartSolar → Product info if that is lost.
- WiFi passwords for `Sir Salettelot` (Starlink) and `OHeck`.
- The **TwitchWiFi SSID and password** the van already uses. Reuse them exactly:
  the Shellys and the ESP32 fridge bridge store them and will not rejoin a hotspot
  with a different name or password. On a still-working Pi:
  `sudo nmcli -s -g 802-11-wireless-security.psk connection show TwitchWiFi`.
- A Tailscale login.
- A GitHub personal access token, only if re-registering the Actions runner.
- The most recent `van_power-*.db.gz` from `~/van-backups` on the Mac, if you
  want the history back.

## Reference

| Thing        | Value                                                        |
| ------------ | ------------------------------------------------------------ |
| Hostname     | `van-pi`                                                     |
| User         | `todd`                                                       |
| Tailscale IP | Changes on each rebuild — run `tailscale ip -4` after step 4 |
| Python       | 3.13.5                                                       |
| Node         | v20.20.2                                                     |
| OS           | Debian Trixie (arm64), Raspberry Pi OS                       |
| Repo         | `https://github.com/theckeler/van-control-panel`             |

---

**Do every download-heavy step on OHeck, not Starlink, then switch over at the
end (step 3 covers Starlink; only make it primary once the heavy installs are
done).** Learned the hard way on the 2026-08-28 rebuild: Starlink had real,
measured signal obstruction that turned Tailscale's ~36MB package into a
20+ minute ordeal — the second attempt only failed at all because the first
one's `apt-get` never exited cleanly after a mid-download TLS drop (see the
dpkg lock gotcha below). OHeck did the same install in under a minute. Steps
2 (Node), 4 (Tailscale), and 5 (`npm install`) are the heavy ones.

## 1. Flash the OS

Raspberry Pi Imager, 64-bit Raspberry Pi OS. In the imager's advanced options
set hostname `van-pi`, username `todd`, enable SSH, and add the OHeck WiFi
credentials. Starlink gets configured properly in step 3.

Boot it, then:

```bash
ssh todd@van-pi.local
sudo apt update && sudo apt full-upgrade -y
```

**Rebuilding on the same hostname?** SSH will refuse to connect — the new
Pi has a fresh host key that doesn't match the old one saved in
`~/.ssh/known_hosts`. Clear it first:

```bash
ssh-keygen -R van-pi.local
ssh-keygen -R <old-tailscale-ip>   # if the Tailscale IP is reused too
```

Only after that will `ssh-copy-id` actually work — run it _after_ clearing
the old key, not before. Running it while the old key is still saved fails
with the same host-key-changed error and silently does **not** install your
key, which is easy to miss since password auth still works fine on its own
and papers over the failure.

```bash
ssh-copy-id todd@van-pi.local
```

**`sudo` may ask for a password by default now** — this Imager version
doesn't always set up passwordless sudo for the default user the way older
Raspberry Pi OS releases did. Fix it once, from an interactive session where
you can type the password yourself (not automatable):

```bash
echo "todd ALL=(ALL) NOPASSWD:ALL" | sudo tee /etc/sudoers.d/010_todd-nopasswd
```

**`full-upgrade` usually installs a new kernel you're not running yet** —
check `uname -r` against what apt just installed. A pending kernel upgrade
that hasn't been rebooted into was a real, confirmed source of odd,
intermittent service flakiness (mDNS resolution dropping in and out) on the
2026-08-28 rebuild. Reboot before continuing if they don't match:

```bash
sudo reboot
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

`<starlink-pass>` below is a placeholder to replace with the real password —
copy-pasting it literally breaks the command two ways at once: `nmcli` sees a
literal string it can't use, and `<`/`>` are shell redirection operators, so
the shell mangles the command before `nmcli` even runs.

If a `starlink` connection profile already exists from an earlier attempt —
common if this is a redo, not a first run — connecting again fails with
`802-11-wireless-security.key-mgmt: property is missing`, a genuinely
confusing error for what's actually just a stale/conflicting profile. Delete
it first:

```bash
sudo nmcli connection delete starlink   # only if one already exists
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

Verify (note: on initial setup with no USB dongle, wlan0 is still the client;
after the USB dongle is added, use `wlan1` instead):

```bash
nmcli -f NAME,AUTOCONNECT-PRIORITY connection show
nmcli -f IN-USE,SSID,SIGNAL,SECURITY device wifi list ifname wlan0
ip -4 addr show wlan0 | grep inet
```

`iwconfig` is not installed on this Debian version (neither is `iw`) — the
old verification command silently does nothing rather than erroring, so it
looks like success. The `nmcli`/`ip` combination above actually confirms
signal and the real subnet.

**If installs later hang or DNS-dependent commands time out while genuinely
being able to reach raw IPs**, Starlink's own router (`192.168.4.1`, the
default DNS resolver via DHCP) can have an intermittent resolution problem
even while basic connectivity is fine — confirmed 2026-08-28, `curl
https://1.1.1.1` succeeded instantly while `curl https://tailscale.com`
timed out completely. Point at a public resolver instead:

```bash
sudo nmcli connection modify starlink ipv4.dns "1.1.1.1 8.8.8.8"
sudo nmcli connection modify starlink ipv4.ignore-auto-dns yes
sudo nmcli connection up starlink
```

Want `Power Management:off` (via `nmcli`, not `iwconfig`, on this version) and
a 5GHz association. Signal around -55 dBm is normal. See `CLAUDE.md` →
Networking for the band and subnet details, and for why NetworkManager will
not roam back to Starlink on its own after an outage.

## 4. Tailscale

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --hostname=van-pi
```

Follow the printed URL to authenticate. Confirm the address:

```bash
tailscale ip -4
```

**Do not expect this to match the old address, even with the hostname
reused.** Confirmed 2026-08-28: a fresh OS install gets a genuinely new
Tailscale node identity, not a reused one, so it lands on a new IP from the
pool regardless of hostname. `--hostname=van-pi` pins the _name_ but not the
IP. Delete the old ghost nodes at
[login.tailscale.com/admin/machines](https://login.tailscale.com/admin/machines)
after the new node is registered — otherwise hostname collision gives the new
node a suffix (van-pi-2, etc.).

After registering, note the new IP and update the Reference table above.

**If `curl | sh` dies partway through** (a TLS error, a dropped connection —
more likely on Starlink, see the note at the top of this doc), the `apt-get`
it spawned can be left running and holding the dpkg lock even after the
outer script has exited. Every retry then fails immediately with `Could not
get lock /var/lib/dpkg/lock-frontend`, which looks like a fresh problem but
is actually the previous attempt's orphaned process still alive. Confirmed
2026-08-28 — check for it before assuming anything else is wrong:

```bash
ps aux | grep apt-get
# if something's actually there and stuck (check CPU time isn't climbing):
sudo kill -9 <pid>
sudo rm -f /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/cache/apt/archives/lock
sudo dpkg --configure -a
```

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

**`VAN_API_KEY` is not optional in practice.** It gates the dev proxy path
(Mac → Tailscale → Pi:8000) and any direct curl calls from the Pi itself.
uvicorn binds `127.0.0.1:8000` so port 8000 is not reachable from the network,
but an empty key still fails open — meaning anyone with SSH to the Pi or using
the dev proxy gets unrestricted access including `/system/shutdown`. Set it.

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
scp ~/van-backups/van_power-<date>.db.gz todd@van-pi.local:~/
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
# --no-proxy-headers matters once VAN_API_KEY is set: uvicorn trusts
# X-Forwarded-For from 127.0.0.1 by default, which rewrites request.client
# to the original browser IP (set by nginx, forwarded by Express) instead
# of the real TCP peer. That breaks main.py's LOCAL_HOSTS bypass for every
# legitimately-proxied request — confirmed live 2026-08-31, VAN_API_KEY
# restored after being missing post-reimage, every /api/* call 401'd until
# this flag was added. Without it, request.client.host is always the true
# peer (127.0.0.1 for anything coming through the Express proxy), which is
# what that check actually needs.
ExecStart=/home/todd/van-control-panel/backend/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-proxy-headers
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

`van-frontend` listens on port **3000**. nginx on port 80 proxies to it
(`pi-setup.sh` installs `nginx.conf.example` as the site config), so no
`setcap` is needed. The config's `proxy_read_timeout 10s` is why a hung backend
shows up in the browser as a `504` after exactly 10 seconds. `Restart=on-failure`
on `van-api` is load-bearing: `services/loop_watchdog.py` deliberately exits with
code 70 when the event loop freezes, and that restart is what recovers it. Do not
change it to `Restart=no`.

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

**A push to `backend/**`restarts`van-api` on the live van. There is no
staging environment.\*\*

## 11. TwitchWiFi: fix van-pi.local DNS

By default, dnsmasq (NM's hotspot DNS server) returns NXDOMAIN for `.local`
queries — it treats `.local` as a special mDNS domain and refuses to answer
it even with a static `address=` directive. This means clients on TwitchWiFi
can't reach the dashboard by hostname.

Fix: add a static address record that loads on dnsmasq startup, not reload:

```bash
sudo tee /etc/NetworkManager/dnsmasq-shared.d/van-pi.conf > /dev/null <<'EOF'
address=/van-pi.local/10.42.0.1
EOF
```

Then bounce the hotspot so dnsmasq restarts and reads the new file
(SIGHUP only clears the cache; conf-dir files are only parsed at startup):

```bash
sudo nmcli connection down TwitchWiFi && sudo nmcli connection up TwitchWiFi
```

Verify from the Pi:

```bash
python3 -c "
import socket, struct
def q(srv, name):
    hdr = struct.pack('>HHHHHH',1,0x0100,1,0,0,0)
    enc = b''.join(bytes([len(p)])+p.encode() for p in name.split('.')) + b'\\x00'
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.settimeout(2)
    s.sendto(hdr+enc+struct.pack('>HH',1,1),(srv,53))
    r = s.recvfrom(512)[0]; cnt = struct.unpack('>H',r[6:8])[0]
    pos = 12+len(enc)+4
    for _ in range(cnt):
        rdlen=struct.unpack('>H',r[pos+10:pos+12])[0]; d=r[pos+12:pos+12+rdlen]; pos+=12+rdlen
        if struct.unpack('>H',r[pos-rdlen-2:pos-rdlen])[0]==1 and rdlen==4: print(socket.inet_ntoa(d))
q('10.42.0.1','van-pi.local')
"
```

Should print `10.42.0.1`. The conf file persists across reboots; the hotspot
loads it on every start automatically.

## 12. TwitchWiFi hotspot, NAT, and fixed addresses

Not covered by `pi-setup.sh`. Do this after the USB WiFi adapter is in (it becomes
`wlan1`, the uplink; the onboard radio `wlan0` becomes the hotspot). The full
background, and why each piece exists, is `CLAUDE.md` → Networking and
`docs/ARCHITECTURE.md` → Network Architecture.

**The uplink profiles (wlan1).** Bind them to `wlan1` with `ifname` so they cannot
compete with anything on `wlan0`. The exact commands are in `CLAUDE.md` → Networking,
"Installed and working". Priorities: Starlink 100, OHeck 50 (networks saved later from
the dashboard land at 75).

**The hotspot (wlan0).** `network.py` looks the profile up by the name `TwitchWiFi`:

```bash
sudo nmcli device wifi hotspot ifname wlan0 con-name TwitchWiFi ssid "TwitchWiFi" band bg password "<the same password as before>"
# the old wlan0 client profiles must not fight it for the radio:
sudo nmcli connection modify starlink connection.autoconnect no 2>/dev/null
sudo nmcli connection modify netplan-wlan0-OHeck connection.autoconnect no 2>/dev/null
nmcli -f connection.id,connection.autoconnect,802-11-wireless.mode,802-11-wireless.band connection show TwitchWiFi
```

**The dispatcher scripts.** `70-hotspot-nat` is the important one. Without it the
hotspot has no internet, and after every reboot the Shellys and the fridge bridge go
dark, because their `/etc/hosts` entries are not persistent (this recurred until the
script took over). `90-prefer-starlink` is installed by `pi-setup.sh`. **Do not install
`91-prefer-band-wlan1`**: it is disabled in the repo (it caused connection drops).

```bash
cd ~/van-control-panel
sudo install -o root -g root -m 755 scripts/70-hotspot-nat /etc/NetworkManager/dispatcher.d/70-hotspot-nat
```

**Fixed addresses and DNS for the hotspot** (NetworkManager's dnsmasq reads these at
startup). Keep `known-devices.conf` in sync with `restore_hosts` in `70-hotspot-nat`
and with `SHELLY_UNITS` in `shelly.py`:

```bash
D=/etc/NetworkManager/dnsmasq-shared.d
echo 'address=/van-pi.local/10.42.0.1'  | sudo tee $D/van-pi.conf       # step 11
echo 'address=/van-pi.local/10.55.0.1'  | sudo tee $D/eth0-van-pi.conf  # wired rescue port
sudo tee $D/known-devices.conf >/dev/null <<'DHCPEOF'
dhcp-host=28:84:85:48:12:84,10.42.0.37
dhcp-host=d8:85:ac:ec:6a:ac,10.42.0.102
dhcp-host=d8:85:ac:f3:6a:28,10.42.0.215
dhcp-host=98:a3:16:77:ca:34,10.42.0.27
dhcp-host=48:f6:ee:d0:a8:9c,10.42.0.26
DHCPEOF
# DNS for hotspot clients is forwarded to OHeck's router. How this behaves while the
# uplink is Starlink has not been verified.
echo 'server=192.168.1.1' | sudo tee $D/upstream-dns.conf
sudo nmcli connection down TwitchWiFi && sudo nmcli connection up TwitchWiFi
```

Those five lines are, in order: the ESP32 fridge bridge, USB Outlets, Garage, PS Input 1
and PS Input 2.

**The wired rescue port (eth0)** is separate: follow `scripts/setup-eth0-rescue.md`.

Verify:

```bash
cat /proc/sys/net/ipv4/ip_forward                              # 1
sudo iptables -t nat -S | grep MASQUERADE                      # 10.42.0.0/24 (and 10.55.0.0/24) out wlan1
grep -A6 "known local devices" /etc/hosts                      # the five pinned names
getent hosts shelly1g4-d885acf36a28.local                      # 10.42.0.215
```

## 13. USB backup drive (SD-card image)

Optional, but it is what lets you restore a dead SD card in minutes instead of an hour.
The dashboard's "create image" job writes a gzipped copy of the whole card to this drive.

**Use exFAT, not FAT32.** FAT32 caps a single file at 4GB, and a compressed image of a
29GB card can exceed that. An earlier attempt wrote to `/tmp`, which is a 453MB RAM
disk on this Pi, and could never have completed.

```bash
sudo apt install -y exfatprogs
lsblk -o NAME,SIZE,FSTYPE,LABEL,MODEL          # identify the stick. Get this right: formatting erases it
sudo mkfs.exfat -L VAN-PI-BKUP /dev/sdX1       # replace sdX1 with the stick's partition
sudo mkdir -p /mnt/van-pi-bkup
echo 'LABEL=VAN-PI-BKUP /mnt/van-pi-bkup exfat defaults,nofail,uid=1000,gid=1000 0 2' | sudo tee -a /etc/fstab
sudo systemctl daemon-reload && sudo mount /mnt/van-pi-bkup
findmnt /mnt/van-pi-bkup
```

`nofail` lets the Pi boot with the stick unplugged. The job refuses to start when
`/mnt/van-pi-bkup` is not a real mount: writing to the empty directory underneath
would silently fill the SD card it is imaging. The output is
`/mnt/van-pi-bkup/van-pi-image.img.gz`; write it to a new card with Raspberry Pi
Imager → Use custom.

## 14. Verify

```bash
systemctl status van-api van-frontend --no-pager | grep Active
curl -s localhost:8000/battery/ | python3 -m json.tool | head -5
curl -s localhost:8000/mppt/    | python3 -m json.tool | head -5
curl -s localhost:8000/shelly/  | python3 -m json.tool
getent hosts shelly1g4-d885acf36a28.local       # expect 10.42.0.215, from /etc/hosts (step 12)
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
- **The Shellys' and fridge bridge's view of the hotspot.** They rejoin only if the
  rebuilt hotspot has the same SSID and password and hands them the same addresses
  (step 12). A different password means re-provisioning each one by hand.

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
