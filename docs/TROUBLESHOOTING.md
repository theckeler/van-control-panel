# Troubleshooting

Common issues and their fixes for the Van Control Panel system.

---

## BMS shows offline / "No data yet"

### Symptoms
- Battery card shows `○ offline` or `○ offline — no data yet`
- `/battery/` endpoint returns `connected: false`
- Journal shows repeated `BMS: — retrying in 300s`

### Cause
The Power Queen BMS firmware has a lockout mechanism. If too many rapid BLE connection attempts are made in a short period, the BMS enters a state where it advertises normally but rejects (or ignores) all incoming connections. This is most commonly triggered by repeated `van-api` restarts during development.

**Observed variant, 2026-08-27: not advertising at all, not just refusing
connections.** After an unusually heavy stretch of development — many
`van-api` restarts across deploys, manual syncs, and WiFi switching in one
long session — the BMS went offline with `BMS: Device ... was not found`,
not the usual "found but rejected." Confirmed via direct `bluetoothctl`
scans (12s and 25s, both zero packets) that it had stopped broadcasting
entirely, not just declining connections. Plausible, not proven: the
correlation with heavy restart activity matches the documented mechanism
closely enough to be worth recording, but this wasn't a controlled test —
treat it as a likely more-severe form of the same lockout rather than a
confirmed separate cause. Same fix applies (physical power cycle below).

### Fix — Physical power cycle (most reliable)

**Important:** The Pi runs off the house battery. Shut it down gracefully before cutting power.

**Step 1 — Shut down the Pi:**
```bash
ssh todd@van-pi.local 'sudo shutdown now'
# Wait ~15 seconds for full shutdown
```

Or if on Tailscale:
```bash
ssh todd@van-pi 'sudo shutdown now'
# (Currently registered as van-pi-2 — see Tailscale hostname entry below)
```

**Step 2 — Flip the Nilight 50A house main disconnect OFF**
Wait 30 seconds. This cuts power to the BMS, clearing its connection state table.

**Step 3 — Flip the disconnect back ON**
The Pi boots automatically. `van-api` and `van-frontend` start via systemd. BMS connects within ~35 seconds (5s startup delay + connection time).

No further action needed.

### Fix — Power Queen app (sometimes works)
If you don't want to power cycle, open the Power Queen app on your phone, let it connect and show full data (SOC, all cells), hold for ~10 seconds, then close it. This can reset the BMS BLE state. Success is not guaranteed if the lockout is severe.

### Prevention
- Do not restart `van-api` repeatedly in quick succession
- In normal operation the persistent connection holds for days
- The 5-minute reconnect cooldown (`RECONNECT_IN = 300` in `battery_ble.py`) prevents hammering
- A long, heavy development session (many deploys, manual syncs, WiFi
  switching) adds up to exactly this pattern even when no single restart
  seems excessive. If the BMS goes quiet partway through a long session,
  it's worth suspecting cumulative restart load before anything else.

---

## BMS connects but Power Queen app can't

### Cause
The Pi holds a persistent BLE connection. Only one device can connect at a time.

### Fix
Use the **Release** button on the Battery card in the dashboard. A confirmation modal will appear. After confirming, the Pi drops its connection and the Power Queen app can connect. When done, tap **Connect** on the dashboard to resume monitoring.

Alternatively via SSH:
```bash
curl -X POST http://localhost:8000/battery/release
# ... use Power Queen app ...
curl -X POST http://localhost:8000/battery/connect
```

---

## Dashboard not loading / all requests pending

### Cause
Usually a DNS resolution issue — `van-pi.local` times out on some Mac setups before falling back to mDNS, adding ~5 seconds per request. The frontend polls every 5 seconds so requests pile up faster than they complete.

> **Distinguishing from the WiFi-signal issue below:** DNS timeout adds a consistent ~5s delay per request, everything else is fast. WiFi signal issues make *everything* crawl, including SSH sessions, not just the browser.

### Fix
Find the Pi's current IP and try a direct connection:
```bash
ping van-pi.local    # get the IP
```

If mDNS resolution itself is failing, see the "mDNS: van-pi.local does not
resolve" section below.

**Do not pin `van-pi.local` in `/etc/hosts`.** The Pi's IP changes between
Starlink (192.168.4.x) and OHeck (192.168.1.x). A stale entry silently breaks
SSH and the dev proxy.

---

## Dashboard slow to load / page hangs but Pi is reachable

### Symptoms
- `van-pi.local` eventually loads but takes 30-60+ seconds
- SSH sessions feel laggy too, not just the browser
- `top` / `free -h` on the Pi show normal CPU and memory (rules out the Pi itself)
- Network tab in dev tools shows requests "Pending" for a long time or very slow transfer times on small files (e.g. a 14KB CSS file taking 30+ seconds)

### Cause
Weak or congested WiFi link between the Pi and the router, not an app or auth issue. Check the radio stats:
```bash
ssh todd@van-pi.local
iwconfig wlan1
```
Look at:
- **Tx excessive retries** — climbing into the hundreds means the link is struggling
- **Signal level** — below about -65 dBm is marginal
- **Bit Rate** — the radio falls back to a low rate (e.g. 13-14 Mb/s) when the link is unstable

*(wlan1 is the uplink client radio — the USB dongle. wlan0 runs the TwitchWiFi
AP and won't show client signal stats.)*

### Fix
**Switch to 5GHz if the router supports it.** 2.4GHz is more congested and shorter-range-tolerant but noisier. Reconnecting the Pi to a 5GHz SSID (same network, different band) has resolved this outright — retries dropped from 300+ to 0 and bit rate roughly doubled.

If power management is on, turn it off too (can cause latency spikes independent of signal strength):
```bash
sudo iwconfig wlan1 power off
```
Note: this resets on reboot/reconnect unless made persistent (see below).

**To make power management off persistent across reboots**, add a systemd service or NetworkManager dispatcher rule — not yet set up as of this writing.

**If neither helps**, consider a USB WiFi adapter with an external antenna. The Pi's onboard WiFi chip is known to be mediocre in marginal signal conditions.

### Quick way to isolate WiFi vs. everything else
Temporarily connect the Pi via Ethernet. If the dashboard loads fast and clean over Ethernet, the problem is confirmed to be WiFi, not the app, auth, or database.

---

## Frontend shows "ENOENT: no such file or directory ... dist/index.html"

### Cause
`van-frontend.service` is running but the built frontend (`frontend/dist/`) is missing or empty. Seen once after an unexpected full Pi reboot (not just a service restart) triggered by an unrelated `systemctl restart van-frontend` call — root cause of *why* the whole box rebooted wasn't confirmed, worth watching if it recurs.

### Fix
```bash
ssh todd@van-pi.local
ls -la /home/todd/van-control-panel/frontend/dist   # confirm it's actually missing/empty
cd /home/todd/van-control-panel/frontend
npm install
npm run build
sudo systemctl restart van-frontend
sudo systemctl status van-frontend
```

### Note
If you see `uptime` showing only a few minutes right after this error, the Pi rebooted rather than the service just restarting. A plain `systemctl restart` on `van-frontend` should not reboot the whole machine — if this happens again, check `journalctl -b -1 -n 50` (previous boot's last log lines) to try to catch the trigger, and rule out a power dip on the Pi's 12V feed around the same time.

---

## Dashboard shows a load with nothing obvious running

### First: it's probably real

The watts figure on the Battery card is measured, not estimated.
`BatteryCard.tsx` computes it as `Math.abs(battery.current * battery.voltage)`
straight from BMS telemetry. It does not come from `system.py`.

Check what's actually on before assuming a bug:

```bash
ssh todd@van-pi.local
curl -s localhost:8000/battery/ | python3 -m json.tool | grep -E "current|voltage|soc"
curl -s localhost:8000/shelly/ | python3 -m json.tool | grep -E "label|on"
```

A Shelly circuit left on is the usual answer. 45W at 13.5V is ~3.3A, well
within range for the Garage circuit. If `current` is near `0.0` there is
genuinely no draw and the card will show ~0W.

*(Aug 2026: this was investigated as a suspected phantom-load bug. It wasn't.
The Garage Shelly was on. See CLAUDE.md "system.py load estimation" for the
full correction.)*

### What is actually unreliable

`system.py`'s `load_watts` and `loads` breakdown, neither of which the frontend
currently displays:

- The `loads` list always claims Starlink 22W and Fridge 40W whether or not
  they're powered.
- `load_watts` is clamped with `max(0.0, ...)`, so during shore charging it
  reports 0W even while loads are running.

Both documented in CLAUDE.md. Neither affects anything you can see on the
dashboard today.

---

## van-api not responding after deploy

### Cause
The GitHub Actions deploy workflow restarts `van-api`. The BMS service has a 5-second startup delay and a 5-minute reconnect cooldown, so the battery card shows offline for up to 5 minutes after every deploy. This is expected.

### Check status
```bash
ssh todd@van-pi.local 'sudo systemctl status van-api --no-pager'
ssh todd@van-pi.local 'sudo journalctl -u van-api --no-pager -n 20'
```

---

## Frontend deploy failed (CI/CD)

### Common causes and fixes

**`npm ci` fails — lock file out of sync:**
Run locally and commit:
```bash
cd frontend && npm install
git add package-lock.json
git commit -m "fix: sync package-lock.json"
git push
```

**Health check fails — service didn't start in time:**
The health check sleeps 5 seconds then pings `:8000/health`. If the Pi is under load it may need more time. Check `deploy-backend.yml` and increase the sleep if needed.

**`git reset --hard` fails:**
SSH in and check:
```bash
ssh todd@van-pi.local 'cd ~/van-control-panel && git status'
```

---

## Camera capture times out ("capture timed out")

### Symptoms
- `/photos/capture` or `/photos/latest` hangs for the full timeout, then
  returns `{"detail": "capture timed out"}`
- A direct `ffmpeg` call against `/dev/video0` also hangs, even fresh from
  the command line
- `v4l2-ctl --list-devices` still lists the camera fine — enumeration works,
  only actual streaming hangs

### Two separate causes, check both

**1. Orphaned `ffmpeg` process holding the device.** A capture started over
SSH without a proper TTY can outlive the SSH session that started it,
leaving it running and holding `/dev/video0` open exclusively. Every
subsequent capture then blocks waiting for a device that's already open.

```bash
ssh todd@van-pi.local
ps aux | grep ffmpeg | grep -v grep
sudo kill -9 <pid>
```

**2. The camera itself wedged at the streaming level.** If killing any
orphaned process doesn't fix it — confirmed by device enumeration succeeding
while a fresh, isolated `ffmpeg` capture still hangs — this looks like the
same class of issue as the earlier USB fuse-trip incident: the camera's
internal streaming state is stuck in a way a software-side reset doesn't
clear. **Needs a physical USB unplug/replug.** Not something to keep
debugging remotely; move to the fix once cause 1 is ruled out.

### Prevention
Avoid backgrounding a raw `ffmpeg &` call over SSH without `nohup`/`disown` or
running it through a process manager — that's specifically what orphans it
when the session ends.

---

## Fridge card shows offline / no data, ESP32 seems fine otherwise

### Symptoms
- `FridgeCard` shows "Offline" or a dimmed last-known reading
- ESP32's own JSON API (`http://dometic-bridge.local/sensor/...`) also
  returns null/empty
- Nothing about the ESP32 or fridge itself has changed

### Cause
Almost always a network split, not a fridge or firmware problem. The Pi and
the ESP32 need to be on the *same* WiFi network for mDNS resolution
(`dometic-bridge.local`) to work at all. The Pi's `prefer-starlink`
dispatcher actively tries to return it to Starlink, and if the ESP32 is on a
different network at that moment, resolution fails cleanly and correctly —
it's just not useful.

### Check
```bash
ssh todd@van-pi.local
ip -4 addr show wlan1 | grep inet      # which uplink network is the Pi on?
getent hosts dometic-bridge.local      # can it even resolve the ESP32?
```

### Fix
Put them back on the same network. Fastest lever, no reflash needed:
```bash
curl -s -X POST http://localhost:8000/system/wifi/switch/oheck-wlan1
# or
curl -s -X POST http://localhost:8000/system/wifi/switch/starlink-wlan1
```

Note this drifts back apart on its own — the ESP32 now has an explicit WiFi
`priority:` favoring Starlink (see CLAUDE.md → Known Limitations), which
fixes *which* network it picks on its next reconnect, but not proactively
abandoning an already-working connection. Full symmetric fix (mirroring the
Pi's own dispatcher) not built yet.

---

## All BLE devices offline at once (BMS, Victron, EcoFlow)

### Symptoms
- `/battery/`, `/mppt/`, `/ecoflow/` all return zeros with `connected: false`
- `van-api` is running fine, no errors in the journal
- Happens immediately after a fresh OS install

### Cause
Bluetooth is **soft-blocked by rfkill** by default on a fresh Raspberry Pi OS
Lite install. `bluetoothctl show` reports `Powered: no` and
`PowerState: off-blocked`. Nothing BLE-related can work regardless of the
services running correctly — they have no radio to talk to.

One root cause explains all three devices at once. If only *one* BLE device is
offline, this is not it.

### Fix
```bash
sudo rfkill unblock bluetooth
sudo systemctl restart bluetooth
bluetoothctl show | grep -E "Powered|PowerState"   # want: Powered: yes
sudo systemctl restart van-api
```

Confirmed 2026-08-28. Now handled automatically by `scripts/pi-setup.sh`; this
entry is for diagnosing an install that predates it or was done by hand.

### Note on the BMS specifically
After unblocking, the BMS may still show `connected: false` with a
`retry_in` countdown. That is the normal 5-minute `RECONNECT_IN` cooldown, not
a failure. Confirm it is genuinely advertising rather than restarting anything:

```bash
(echo "scan on"; sleep 20; echo "scan off"; echo "exit") | bluetoothctl \
  | grep -i "C8:47:80:5D:08:6F"
```

If it appears, wait the cooldown out. Restarting `van-api` repeatedly to force
a retry is the documented cause of BMS lockout — the cooldown exists precisely
to prevent that.

---

## Tailscale hostname is van-pi-2, not van-pi

### Symptoms
- `van-pi.tailba93b9.ts.net` does not resolve
- `tailscale status` shows `van-pi-2` as the active node, with `van-pi` and
  `van-pi-1` listed as offline

### Cause
Every fresh OS install registers a **new** Tailscale node. The old ones keep
the good hostname, so the new install gets suffixed. Rebuilding twice in one
day produced `van-pi`, `van-pi-1`, and `van-pi-2`.

Same collision-avoidance behaviour as mDNS, at a different layer.

### Fix
Delete the stale offline machines at
[login.tailscale.com/admin/machines](https://login.tailscale.com/admin/machines),
then rename or re-register the current one. The CLI cannot delete nodes — this
is admin-console only.

Until then, use the suffixed name or the numeric IP. Note the address is
**`http://`, not `https://`** — nothing in this stack listens on 443 and no
TLS cert is configured. Tailscale can provision one via Funnel, but that is
separate setup that has not been done.

---

## van-pi.local doesn't resolve when connected to TwitchWiFi

### Symptoms
- `http://van-pi.local` fails to load on a phone or laptop connected to TwitchWiFi
- The Pi is reachable by its IP (`10.42.0.1`) but not by hostname

### Cause
NM's hotspot runs dnsmasq for DHCP and DNS on TwitchWiFi clients. dnsmasq
treats `.local` as a special mDNS domain and returns NXDOMAIN even with an
explicit `address=` directive — it never looks up `.local` names in its own
address table. The fix requires a static conf file in `conf-dir` that loads at
dnsmasq startup.

This is a different path from Avahi mDNS — dnsmasq on the hotspot serves DNS
via DHCP, so clients never send an mDNS multicast. Avahi works fine from other
LANs; this is hotspot-only.

### Fix
Create the conf file on the Pi:

```bash
sudo tee /etc/NetworkManager/dnsmasq-shared.d/van-pi.conf > /dev/null <<'EOF'
address=/van-pi.local/10.42.0.1
EOF
```

Restart the hotspot to force a dnsmasq restart (SIGHUP only clears the cache;
conf-dir files are only read at startup):

```bash
sudo nmcli connection down TwitchWiFi && sudo nmcli connection up TwitchWiFi
```

This is persistent — the file survives reboots and the hotspot loads it every time.

---

## mDNS: van-pi.local does not resolve

### Symptoms
- `ping van-pi.local` → "cannot resolve"
- The Pi is definitely up and reachable by IP

### Cause
Avahi renamed itself to avoid a collision. Check what it actually claimed:

```bash
sudo systemctl status avahi-daemon --no-pager | grep "running \["
```

If it shows `running [van-pi-2.local]`, a stale advertisement from a previous
install is still being defended somewhere on the network.

### Fix
```bash
sudo systemctl restart avahi-daemon
sudo systemctl status avahi-daemon --no-pager | grep "running \["   # want van-pi.local
```

Confirmed 2026-08-28: a single restart reclaimed the correct name.

**Before assuming mDNS is broken, rule out packet loss.** Heavy WiFi loss looks
identical from the application layer. `dscacheutil -q host -a name van-pi.local`
on the Mac will return the correct IP even while everything feels broken — see
CLAUDE.md → Networking → Signal quality.

---

## van-pi.local resolves but the browser hangs (IPv6 first)

### Symptoms
- `van-pi.local` works on Tailscale but is flaky on OHeck — "sometimes loads,
  sometimes doesn't"
- `ping van-pi.local` is fast and clean (it uses IPv4)
- But the browser hangs or takes many seconds before loading

### Cause
Avahi was advertising **both** an IPv4 and an IPv6 (`fd87:...` ULA) address for
`van-pi.local`, returning the IPv6 record first. Browsers prefer IPv6 when
offered, and the IPv6 path across these subnets was badly degraded — measured
2026-08-30 at **738ms latency and 33% loss over IPv6 versus 6ms clean over
IPv4** to the same Pi. `ping` looked fine because it used IPv4; the browser
tried IPv6 first and stalled. This is the real "sometimes works" cause, not
the collision case above.

### Fix
Stop Avahi advertising IPv6 over mDNS — nothing in this stack needs it, and
Tailscale has its own separate addressing:

```bash
sudo sed -i 's/^use-ipv6=yes/use-ipv6=no/' /etc/avahi/avahi-daemon.conf
sudo systemctl restart avahi-daemon
```

Then flush the client's DNS cache so it drops the stale AAAA record (on macOS):

```bash
sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder
```

Confirmed 2026-08-30. Persists across reboots (it's a config file change).

### The bigger cause: avahi advertising on the hotspot interface

The IPv6 fix above helped but wasn't the whole story. With `wlan0` running the
`VanControlPanel` hotspot (`10.42.0.1`) and `wlan1` on the OHeck uplink, avahi
by default advertises `van-pi.local` on **every** interface. A client on OHeck
would get two answers: the correct `192.168.1.206` from `wlan1`, and a
`0.0.0.0` / "No Such Record" from the isolated hotspot interface. When the
browser picked the `0.0.0.0` answer it hung forever on a null address — the
real "long hang."

Confirmed via `dns-sd -timeout -Q van-pi.local A` on the Mac, which showed both
answers. Fix — restrict avahi to the interfaces that actually route to clients:

```bash
sudo sed -i 's/^#allow-interfaces=.*/allow-interfaces=wlan1,tailscale0/' /etc/avahi/avahi-daemon.conf
sudo systemctl restart avahi-daemon
```

Verify with `curl -m 8 -o /dev/null -w "%{http_code} %{time_total}s\n"
http://van-pi.local/` on the Mac — a fast `302` means it's fixed even if
`dscacheutil` still lists a cached address. **Fully quit and reopen the
browser** (or use a private window) — it caches the failed connection
separately from the OS resolver.

**Note if the hotspot subnet ever needs `van-pi.local` too:** this
deliberately stops advertising there. Hotspot clients use the dnsmasq
`address=/van-pi.local/10.42.0.1` file instead (see the TwitchWiFi entry
above), which is the correct answer for that subnet — so both paths still
work, each via the right mechanism.

---

## Tailscale not connecting

```bash
# On Mac
tailscale status
tailscale ping van-pi

# On Pi
ssh todd@van-pi.local 'sudo systemctl status tailscaled'
ssh todd@van-pi.local 'sudo tailscale up'
```

---

## Pi SSH commands reference

```bash
# Shutdown gracefully (before cutting power)
ssh todd@van-pi.local 'sudo shutdown now'

# Reboot
ssh todd@van-pi.local 'sudo reboot'

# Service status
ssh todd@van-pi.local 'sudo systemctl status van-api van-frontend'

# Restart services
ssh todd@van-pi.local 'sudo systemctl restart van-api'
ssh todd@van-pi.local 'sudo systemctl restart van-frontend'

# Live logs
ssh todd@van-pi.local 'sudo journalctl -u van-api -f'

# Check SQLite data
ssh todd@van-pi.local 'sqlite3 ~/van-control-panel/backend/van_power.db "SELECT COUNT(*), source FROM readings_raw GROUP BY source;"'

# Tailscale IP (if mDNS not working — currently van-pi-2 until ghost nodes cleaned up)
ssh todd@van-pi 'echo connected'
```
