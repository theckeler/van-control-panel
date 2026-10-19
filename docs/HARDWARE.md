# Hardware Reference — Van Control Panel


**Last updated:** 2026-10-19
## Vehicle

**2023 Mercedes Sprinter VS30 AWD 144" High Roof** — cargo conversion.

---

## Compute

| Component | Model | Notes |
|---|---|---|
| Single board computer | Raspberry Pi 4B 1GB (Rev 1.5) | Main server. FastAPI, BLE, WiFi AP, camera. Raspberry Pi OS 64-bit (Debian 13 trixie), Python 3.13, Node 20 |
| Storage | SanDisk Endurance 32GB microSD (29.1GB usable) | Rated for 24/7 continuous write. journald is persistent on it, so log volume matters |
| Cooling | Aluminum passive heatsink kit | Cabinet gets warm — heatsink required |
| Power supply | EcoFlow River 2 Max, 100W USB-C port | **Not** the house battery / buck converter path below — see note |
| Enclosure | DIN rail mount case | Mounts on HDPE panel DIN rail |
| WiFi uplink | MediaTek MT7612U USB adapter, external antenna (`wlan1`) | In a USB 3.0 port, driver `mt76x2u`. See "USB devices" below |
| Backup drive | SanDisk Cruzer USB stick, exFAT, label `VAN-PI-BKUP` | Holds the SD-card image. See "USB devices" below |
| Fridge bridge | ESP32-S3 running ESPHome | Plugged into a Pi USB port (shows up as an Espressif USB JTAG/serial unit), joins TwitchWiFi. Firmware in `esp32-dometic/` |

**Power draw:** ~3-5W at load. If it were on the 12V house bank that is ≈ 6-10Ah/day, under 3% of a 300Ah battery; today it comes out of the EcoFlow instead (below).

**Actual power path, confirmed 2026-09-07:** the Pi draws from the EcoFlow
River 2 Max's 100W USB-C port, not from the house battery (Power Queen) via a
12V-to-USB-C buck converter. The buck converter row two tables down (Charge
Sources) describes the originally-planned path, not what's wired today.

This matters because the EcoFlow is a portable, finite battery, not the
300Ah house bank — during a multi-day trip it can run down (seen at 19%
after a few hot days, partly from its own cooling fans), and low EcoFlow
charge has been directly correlated with Pi WiFi instability: `vcgencmd
get_throttled` showed undervoltage/throttling and `dmesg` showed
"Undervoltage detected!" cycling starting the morning after Todd left on
the 2026-09-04 AT hike. The Pi itself never crashed (no gaps in
`readings_raw`), but the USB WiFi dongle was destabilized. Treat EcoFlow
charge level as a live suspect for any future "Pi unreachable" or "WiFi
dropped" troubleshooting. Moving Pi power to the house battery is under
consideration but not simple — the EcoFlow also runs the fridge and shows
its own voltage warnings, an open question not yet resolved.

---

## Cameras

**Only one camera is physically installed: interior, at `/dev/video0`.** A
**Logitech C922 Pro Stream Webcam** (`046d:085c`, USB UVC), in place by
2026-10-19. It replaced a cheap "HD USB Camera" (`32e4:9520`) that kept
freezing on one identical frame, even through a held 15-second USB port power
cycle. Not the originally-planned CSI module — see below. `camera.py`
still has an `exterior` device slot (`/dev/video2`) wired up in code, but
there's no hardware behind it yet; requests for it 400 with "exterior camera
not connected" rather than failing silently.

**Two capture paths.** A background loop (`services/camera_loop.py`) takes a
photo every `camera_interval_min` of the active operating mode (60s floor, see
MODES.md) and keeps 24 hours of them. Separately, `GET /photos/latest`
captures fresh on every call rather than serving the loop's last frame.

**Why `ffmpeg` and the CSI module got abandoned, 2026-08-31:** the original
plan was the Pi Camera Module 3 (CSI, via `rpicam-still`/`libcamera`) for
interior and `fswebcam`/`ffmpeg` for a USB exterior camera. Installing
ffmpeg's dependency chain (mesa, gtk3, vulkan, etc.) **OOM-crashed the Pi's
1GB RAM twice mid-install** — not a runtime failure, the install itself was
too heavy. Switched to `v4l2-ctl` for both cameras instead: it's already on
the box, and this UVC camera does its own onboard MJPEG encoding, so
`v4l2-ctl --stream-to=<path>` writes one already-complete JPEG frame
straight to disk — no transcoding process, no extra package, no ffmpeg at
all. Also switched the interior camera itself from CSI to USB UVC in the
process (simpler, one code path for both camera slots instead of two).

**UVC control tuning** (interior camera, applied fresh before every capture
since USB controls reset on unplug/reboot — see `camera.py`'s
`CAMERA_TUNING`). Fitted to the C922 on 2026-10-19: `focus_automatic_continuous=0`
and `focus_absolute=0` (manual, infinity), `brightness=128` (the default),
`auto_exposure=3` (auto) and `backlight_compensation=1`.

Why those, measured on the real interior scene:

- **Brightness:** the C922 is 0-255 with a default of 128, and **0 is the
  darkest setting**, not a reset. At 0 the interior was nearly black (mean
  luma ~26); at 128 it is ~76 (~86 with backlight compensation).
- **Exposure:** the camera only accepts `1` (manual) or `3` (aperture
  priority, i.e. auto). `0` fails with `Invalid argument`.
- **Focus:** fixed focus 0-20 is sharp and 30+ is soft. Continuous autofocus
  came out *blurry*, so it stays off.
- **Backlight compensation:** the scene is lit from the window, so this lifts
  the interior at the cost of some window highlight. Remove that line from
  `CAMERA_TUNING` if the window matters more than the interior.

The numbers do not transfer between cameras: the previous camera's ranges were
brightness 0-15 (default 8), so values tuned for it (`brightness=4`,
`focus_absolute=5`) mean something entirely different on this one. Re-check
`v4l2-ctl -d /dev/video0 --list-ctrls-menus` after any camera swap. See
TROUBLESHOOTING.md, "Camera photos too dark".

**Persistent USB device name — not applied, and the current setup depends on luck.**
`camera.py` hardcodes `/dev/video0` and nothing guarantees that number. With the
previous camera the node moved to `/dev/video14` across reboots (2026-08-31), and
the C922 exposes **two** nodes: `video0` (capture, `index` 0) and `video1`
(metadata only, `index` 1). No camera udev rule is installed today. A rule that
pins the capture node would be:
```bash
# /etc/udev/rules.d/99-van-cam.rules
SUBSYSTEM=="video4linux", ATTRS{idVendor}=="046d", ATTRS{idProduct}=="085c", ATTR{index}=="0", SYMLINK+="van-interior-cam"
```
and `DEVICE_MAP["interior"]` would then point at `/dev/van-interior-cam`. A second
camera would need its own `idProduct` (from `lsusb`) and, if it is the same model,
a USB-port path match, since two identical cameras share one ID.

---

## Electrical System Components (monitored)

### Battery
| Item | Model | Interface |
|---|---|---|
| House battery | Power Queen 100Ah LiFePO4 (Group 24) | Bluetooth BLE |
| Spring upgrade | 300Ah single LiFePO4 (TBD) | Bluetooth BLE — verify BMS BLE before buying |

### Charge Sources
| Item | Model | Interface | Fuse |
|---|---|---|---|
| Solar MPPT | Victron SmartSolar 75/15 | BLE advertisements (read, every 30s) | Blue Sea 285 series 20A |
| Shore charger | Victron Blue Smart IP22 12/15A | Has BLE instant readout, **not read yet** (shore is inferred). See `VICTRON-BLE-PLAN.md` | Blue Sea 285 series 20A |
| DC-DC charger | Victron Orion-Tr 12/12-18 (non-smart) | Static only | Blue Sea 5196 MRBF 30A |
| DC-DC upgrade | Victron Orion XS 50A (planned spring) | BLE instant readout (planned) | Blue Sea 5196 MRBF 50A |

### Protection (lower panel, near battery)
| Item | Model | Rating |
|---|---|---|
| Main fuse at battery | Blue Sea 5191 MRBF terminal fuse block | 200A MRBF |
| Main disconnect | Blue Sea 6006 rotary | 300A |
| Distribution block | Blue Sea 5196 MRBF 3-circuit | 30A per position |
| Positive bus bar | Simple 100A bus bar | Feeds 285 breaker circuits |
| Negative bus bar | Simple 100A bus bar | All negative returns |

### Distribution (upper panel)
| Item | Model | Rating |
|---|---|---|
| Fuse block | Blue Sea 5046 12-circuit | ATC blade fuses per circuit |
| Switch controller | Garmin PowerSwitch | Accessory lights, light bar, KC lights, Starlink, EcoFlow charge toggle |
| Breaker/switch — MPPT | Blue Sea 285 series 7180 | 20A |
| Breaker/switch — IP22 | Blue Sea 285 series 7180 | 20A |
| Breaker/switch — fuse block | Blue Sea 285 series 7182 | 40A |

---

## Smart Relays (Shelly)

All installed units live on TwitchWiFi (10.42.0.0/24, the Pi's own hotspot
on wlan0) and are addressed by mDNS hostname, not a fixed IP — see
`backend/app/routers/shelly.py`'s `SHELLY_UNITS`. Scheduling (the "Schedule"
column below) isn't implemented yet — see `docs/FUTURE-FEATURES.md`; the
Shellys are toggled manually today.

| Unit ID | Model | Circuit | Hostname | Schedule |
|---|---|---|---|---|
| `usb` | Shelly 1 Gen4 | USB outlets | `shelly1g4-d885acec6aac.local` | Manual |
| `garage` | Shelly 1 Gen4 | Garage | `shelly1g4-d885acf36a28.local` | Manual |
| `ps-input-1` | Shelly 1 Gen4 | PowerSwitch Input 1 | `shelly1g4-98a31677ca34.local` | Manual |
| `ps-input-2` | Shelly 1 Gen4 | PowerSwitch Input 2 | `shelly1g4-48f6eed0a89c.local` | Manual |

`maxxfan` was evaluated and rejected as a Shelly-controlled circuit — see
`docs/rubber-duck-review-2026-08-27.md`. There's no `lights` or `spare` unit
in code.

**Physical control:** none installed. A Shelly BLU RC Button 4 (Bluetooth, no internet needed) was considered; the design notes are in `docs/FUTURE-FEATURES.md`.
**Matter:** All Gen4 units support Matter for Apple Home / Siri integration

### Shelly 1 Gen4 — 12V DC Wiring
```
Terminal layout: O | I | SW | 12V+ | L | N

12V positive  → 12V+ terminal
12V negative  → L terminal  (⊥ ground symbol — NOT N)
Load positive → I terminal  (relay input)
Load output   → O terminal  (to load)
N terminal    → LEAVE EMPTY (AC neutral only)
SW terminal   → LEAVE EMPTY (no physical switch on these circuits)

Jumper: short wire from 12V+ to I, or insert two wires into 12V+
```

---

## Victron connectivity

**No VE.Direct cables are used or planned.** An earlier version of this section
listed VE.Direct-to-USB cables for the MPPT and the IP22 on `/dev/ttyUSB0` and
`/dev/ttyUSB1`; none of that exists. Every Victron device is read over Bluetooth:
each broadcasts an encrypted "instant readout" advertisement that the `victron-ble`
library decrypts with a per-device key (VictronConnect → the device → Product info).

| Device | Status |
|---|---|
| SmartSolar MPPT 75/15 | Read live, every 30s. MAC and key in `backend/.env` / `config.py` |
| Blue Smart IP22 | Not read. Needs firmware 3.61+ and instant readout enabled in VictronConnect. Plan: `docs/VICTRON-BLE-PLAN.md` |
| Orion-Tr 12/12-18 | Non-smart: no telemetry exists, so `orion.py` returns static values |
| Orion XS (spring) | Planned. The parser is reverse-engineered, so treat it as experimental |

Opening VictronConnect on a phone silences that device's advertisements while the
app is connected, so expect a temporary stale reading.

---|---|---|
| MPPT 75/15 | Victron VE.Direct to USB (ASS030530010) | USB port 1 |
| IP22 12/15A | Victron VE.Direct to USB (ASS030530010) | USB port 2 |

Both appear as `/dev/ttyUSB0` and `/dev/ttyUSB1`. Assign persistent names via udev if needed.

---

## USB devices on the Pi

Verified live 2026-10-19 (`lsusb`):

| Device | USB ID | Port | Notes |
|---|---|---|---|
| Logitech C922 Pro Stream Webcam | `046d:085c` | USB 2.0 hub | Interior camera, `/dev/video0` |
| ESP32-S3 (Dometic fridge bridge) | `303a:1001` | USB 2.0 hub | Powered/serial from the Pi |
| MediaTek MT7612U WiFi adapter | `0e8d:7612` | **USB 3.0** (`5000M`) | `wlan1`, the uplink radio |
| SanDisk Cruzer USB stick | `0781:5530` | USB 2.0 hub | Backup drive. **Not plugged in on 2026-10-19** |

**Backup drive.** exFAT (not FAT32, whose 4GB file limit is smaller than a
compressed image of the card), label `VAN-PI-BKUP`, mounted at `/mnt/van-pi-bkup`
by `LABEL=VAN-PI-BKUP /mnt/van-pi-bkup exfat defaults,nofail,uid=1000,gid=1000 0 2`
in `/etc/fstab`. `nofail` lets the Pi boot without it. The SD-card image job
(Settings → create image) refuses to start if the drive is not mounted, because
writing to an unmounted `/mnt/van-pi-bkup` would silently fill the card being imaged.

**WiFi adapter placement — open problem.** The adapter sits in a USB 3.0 port on
the same aluminum plate as the Pi. USB 3.0 signalling is a known source of
interference for nearby radios, and a metal plate next to an antenna detunes it.
At a public library on 2026-10-19 the Pi's link was `-74` to `-78 dBm` on a single
5GHz access point and moved only 0.9-1.9 Mbps, while a MacBook beside it got
100+ Mbps on the same network: a far weaker receiver at the same signal level, not
a driver or USB fault (no resets, negligible packet loss). A 5 ft USB extension
cable was ordered to move the antenna clear of the plate; **the result is not
recorded yet.** To compare before and after, from the Mac:
`ssh todd@van-pi.local "curl -o /dev/null -s -w 'speed: %{speed_download} B/s\n' http://speedtest.tele2.net/10MB.zip"`

---

## Network

Starlink was renumbered off `192.168.1.0/24` in **Aug 2026** — both routers
were handing out the same range, which made an IP meaningless as an
identifier. `CLAUDE.md` holds the authoritative subnet table.

| Network | Range | Router |
|---|---|---|
| Starlink | `192.168.4.0/24` | `192.168.4.1` |
| OHeck (home) | `192.168.1.0/24` | `192.168.1.1` |

Uplink addresses are DHCP and `shelly.py` addresses units by `.local` name rather
than IP, so nothing needed reconfiguring after the renumber. The hotspot side is
different: the Shellys and the fridge bridge have **fixed DHCP reservations**
(`known-devices.conf`) and their names are **pinned in `/etc/hosts`** by
`scripts/70-hotspot-nat`; see ARCHITECTURE.md, Network Architecture. The range now
tells you which network a device is on.

| Device | Notes |
|---|---|
| Starlink Mini | Router/gateway on the Starlink network. Dish itself is at `192.168.100.1`, reachable only via a static route — see `starlink-status.md` |
| Raspberry Pi 4B | Two radios, not one: `wlan1` (USB dongle, external antenna) is the uplink client — Starlink primary, OHeck fallback, DHCP. `wlan0` (onboard) is the dedicated TwitchWiFi hotspot AP, not a client — see `CLAUDE.md`'s Networking section |
| Shellys | All four on TwitchWiFi (`10.42.0.0/24`), fixed reservations, addressed by pinned `.local` name — see the Smart Relays table above, not this Starlink/OHeck table |

**Tailscale:** Pi runs Tailscale for remote access. IP assigned by Tailscale (100.x.x.x).

---

## Wire Sizing Reference

| Circuit | Gauge | Fuse |
|---|---|---|
| Battery to 5191 MRBF | 2 AWG | 200A MRBF (at terminal) |
| 5191 to 6006 disconnect | 2 AWG | Protected by 5191 |
| Bus bar to upper panel | 8 AWG | Per circuit 285 breaker |
| MPPT output | 8 AWG | 20A |
| Orion-Tr input | 8 AWG | 30A MRBF |
| IP22 output | 8 AWG | 20A |
| Branch circuits | 12 AWG | 10-15A blade fuse |
| Shelly power feed | 18 AWG | 3A at fuse block |
| Solar PV | 10 AWG UV | None (single panel) |
| Shore power AC | 14 AWG SJOOW | 15A inline AC |
