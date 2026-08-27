# Hardware Reference — Van Control Panel

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

| Component | Model | Interface | Mount |
|---|---|---|---|
| Interior | Raspberry Pi Camera Module 3 Wide | CSI ribbon cable | Fixed interior mount |
| Exterior | Logitech C270 or similar UVC | USB | Suction/gooseneck window mount |

**Capture tools:**
- Interior: `rpicam-still` via `libcamera` stack
- Exterior: `fswebcam` or `ffmpeg` via `/dev/van-exterior-cam` (persistent udev name)

**Persistent USB device name:**
```bash
# /etc/udev/rules.d/99-van-cam.rules
SUBSYSTEM=="video4linux", ATTRS{idVendor}=="046d", ATTRS{idProduct}=="0825", SYMLINK+="van-exterior-cam"
```
Replace `idVendor` and `idProduct` with your webcam's values from `lsusb`.

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

| Unit ID | Model | Circuit | Default IP | Schedule |
|---|---|---|---|---|
| `maxxfan` | Shelly 1 Gen4 | Maxxfan 12V | 192.168.1.101 | Off midnight, on manually |
| `lights` | Shelly 1 Gen4 | Ceiling lights | 192.168.1.102 | Off midnight, on at dusk |
| `usb` | Shelly 1 Gen4 | USB outlets | 192.168.1.103 | Off 11PM, on 7AM |
| `spare` | Shelly 1 Gen4 | Spare | 192.168.1.104 | TBD |

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
| Raspberry Pi 4B | DHCP. Joins over `wlan0` |
| Shelly Maxxfan | `maxxfan.local` |
| Shelly Lights | `lights.local` |
| Shelly USB | `usb.local` |
| Shelly Spare | `spare.local` |

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
