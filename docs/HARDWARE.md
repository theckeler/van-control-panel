# Hardware Reference — Van Control Panel


**Last updated:** 2026-09-04
## Vehicle

**2023 Mercedes Sprinter VS30 AWD 144" High Roof** — cargo conversion.

---

## Compute

| Component | Model | Notes |
|---|---|---|
| Single board computer | Raspberry Pi 4B 1GB | Main server. FastAPI, BLE, VE.Direct, cameras |
| Storage | SanDisk Endurance 32GB microSD | Rated for 24/7 continuous write |
| Cooling | Aluminum passive heatsink kit | Cabinet gets warm — heatsink required |
| Power supply | 12V to USB-C 5V 3A buck converter | Steps van 12V to Pi USB-C. Fused 3A at fuse block |
| Enclosure | DIN rail mount case | Mounts on HDPE panel DIN rail |

**Power draw:** ~3-5W at load. At 12V ≈ 6-10Ah/day. Less than 3% of 300Ah battery.

---

## Cameras

**Only one camera is physically installed: interior, at `/dev/video0`.** A
USB UVC camera, not the originally-planned CSI module — see below. `camera.py`
still has an `exterior` device slot (`/dev/video2`) wired up in code, but
there's no hardware behind it yet; requests for it 400 with "exterior camera
not connected" rather than failing silently.

**Capture is on-demand, not a timer.** `GET /photos/latest` captures fresh on
every call — there's no background capture loop or systemd timer driving
this today, regardless of what the operating mode's `camera_interval_min`
says (see MODES.md).

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
`CAMERA_TUNING`): `focus_absolute=5` (manual, swept and scored via Laplacian
variance — sharpest for this camera's close, backlit mounting position),
`brightness=15` (max — default crushed shadows against the window's
backlight), `auto_exposure=3` (kept automatic across day/night).

**Persistent USB device name**, if/when a second camera is actually
installed:
```bash
# /etc/udev/rules.d/99-van-cam.rules
SUBSYSTEM=="video4linux", ATTRS{idVendor}=="046d", ATTRS{idProduct}=="0825", SYMLINK+="van-exterior-cam"
```
Replace `idVendor` and `idProduct` with the webcam's values from `lsusb`.

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
| Solar MPPT | Victron SmartSolar 75/15 | VE.Direct → USB | Blue Sea 285 series 20A |
| Shore charger | Victron Blue Smart IP22 12/15A | VE.Direct → USB | Blue Sea 285 series 20A |
| DC-DC charger | Victron Orion-Tr 12/12-18 (non-smart) | Static only | Blue Sea 5196 MRBF 30A |
| DC-DC upgrade | Victron Orion XS 50A (planned spring) | VE.Direct + BLE | Blue Sea 5196 MRBF 50A |

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

**Physical control:** Shelly BLU RC Button 4 (Bluetooth, no internet needed)
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

## VE.Direct Connections

| Device | Cable | Pi USB Port |
|---|---|---|
| MPPT 75/15 | Victron VE.Direct to USB (ASS030530010) | USB port 1 |
| IP22 12/15A | Victron VE.Direct to USB (ASS030530010) | USB port 2 |

Both appear as `/dev/ttyUSB0` and `/dev/ttyUSB1`. Assign persistent names via udev if needed.

---

## Network

Starlink was renumbered off `192.168.1.0/24` in **Aug 2026** — both routers
were handing out the same range, which made an IP meaningless as an
identifier. `CLAUDE.md` holds the authoritative subnet table.

| Network | Range | Router |
|---|---|---|
| Starlink | `192.168.4.0/24` | `192.168.4.1` |
| OHeck (home) | `192.168.1.0/24` | `192.168.1.1` |

Everything is DHCP and `shelly.py` addresses units by `.local` hostname rather
than IP, so nothing needed reconfiguring after the renumber — but it does mean
**the fixed addresses below are historical and no longer reliable as
identifiers.** Use hostnames. The range now tells you which network a device is
on.

| Device | Notes |
|---|---|
| Starlink Mini | Router/gateway on the Starlink network. Dish itself is at `192.168.100.1`, reachable only via a static route — see `starlink-status.md` |
| Raspberry Pi 4B | Two radios, not one: `wlan1` (USB dongle, external antenna) is the uplink client — Starlink primary, OHeck fallback, DHCP. `wlan0` (onboard) is the dedicated TwitchWiFi hotspot AP, not a client — see `CLAUDE.md`'s Networking section |
| Shellys | All four on TwitchWiFi (`10.42.0.0/24`), addressed by mDNS hostname — see the Smart Relays table above, not this Starlink/OHeck table |

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
