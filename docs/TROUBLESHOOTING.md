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

### Fix — Physical power cycle (most reliable)

**Important:** The Pi runs off the house battery. Shut it down gracefully before cutting power.

**Step 1 — Shut down the Pi:**
```bash
ssh todd@van-pi.local 'sudo shutdown now'
# Wait ~15 seconds for full shutdown
```

Or if on Tailscale:
```bash
ssh todd@100.87.126.98 'sudo shutdown now'
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
Add the Pi's IP to your Mac's hosts file:
```bash
echo "192.168.1.99 van-pi.local" | sudo tee -a /etc/hosts
```

Find the correct IP first if it's changed:
```bash
ping van-pi.local
```

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
iwconfig wlan0
```
Look at:
- **Tx excessive retries** — climbing into the hundreds means the link is struggling
- **Signal level** — below about -65 dBm is marginal
- **Bit Rate** — the radio falls back to a low rate (e.g. 13-14 Mb/s) when the link is unstable

### Fix
**Switch to 5GHz if the router supports it.** 2.4GHz is more congested and shorter-range-tolerant but noisier. Reconnecting the Pi to a 5GHz SSID (same network, different band) has resolved this outright — retries dropped from 300+ to 0 and bit rate roughly doubled.

If power management is on, turn it off too (can cause latency spikes independent of signal strength):
```bash
sudo iwconfig wlan0 power off
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

# Tailscale IP (if mDNS not working)
ssh todd@100.87.126.98 'echo connected'
```
