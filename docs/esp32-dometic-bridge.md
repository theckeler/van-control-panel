# ESP32-S3 → Dometic CFX5 BLE Bridge — Setup Guide

**Goal:** Get an ESP32-S3 talking to the Dometic CFX5 over BLE (bypassing the
Pi's BlueZ stack, which can't hold a stable connection to it), publishing
fridge state to `van-api` over WiFi like every other device.

**Status:** Component source confirmed —
[`andrewbackway/esphome-dometic_cfx_ble`](https://github.com/andrewbackway/esphome-dometic_cfx_ble),
16 stars, actively maintained. It's tagged `cfx3` on its own repo, and ours
is a CFX5 — that's the real unverified assumption. This guide's first goal
is finding out whether it works on a CFX5 at all before building anything
further on top of it.

---

## 1. Install ESPHome (one-time, on your Mac)

```bash
pip install esphome --break-system-packages
```

or via Homebrew:

```bash
brew install esphome
```

Verify:

```bash
esphome version
```

---

## 2. Plug in the board and find its port

Connect the ESP32-S3 to your Mac via USB-C, then:

```bash
ls /dev/tty.usbserial-* /dev/tty.usbmodem* 2>/dev/null
```

Note the device path that shows up (e.g. `/dev/tty.usbmodem14201`) — you'll
need it in step 4.

---

## 3. Create the starter config

Make a working directory and the YAML config:

```bash
mkdir -p ~/websites/esp32-dometic
cd ~/websites/esp32-dometic
```

Create `dometic-bridge.yaml`:

```yaml
esphome:
  name: dometic-bridge
  friendly_name: Dometic Bridge

esp32:
  board: esp32-s3-devkitc-1
  framework:
    type: esp-idf

# Fill in with your actual WiFi credentials before flashing.
wifi:
  ssid: "YOUR_SSID"
  password: "YOUR_PASSWORD"
  fast_connect: true

  ap:
    ssid: "Dometic-Bridge-Fallback"
    password: "fallback123"

logger:
  level: DEBUG

api:
  encryption:
    key: "GENERATE_ME"   # esphome will prompt to generate on first run

ota:
  - platform: esphome

esp32_ble_tracker:
  scan_parameters:
    active: true

# This is the untested part — dometic_cfx_ble targets CFX3 (confirmed via
# its own repo topics tag). First goal is just seeing whether it discovers
# and reads anything from a CFX5 at all.
external_components:
  - source: github://andrewbackway/esphome-dometic_cfx_ble
    components: [dometic_cfx_ble]

dometic_cfx_ble:
  mac_address: "88:13:BF:8D:87:F6"   # your fridge's known MAC from earlier scans
```

**Before flashing:**
- Replace `YOUR_SSID` / `YOUR_PASSWORD` with real WiFi credentials
- Component source confirmed: `andrewbackway/esphome-dometic_cfx_ble`
  (https://github.com/andrewbackway/esphome-dometic_cfx_ble), 16 stars,
  actively maintained. Its own repo topics tag it `cfx3` specifically — that's
  the real open question, not the repo location
- `mac_address` is already the correct one from earlier BLE scans

---

## 4. Flash it

```bash
esphome run dometic-bridge.yaml
```

This compiles, flashes over USB, and then attaches to the serial log so you
can watch it live. First compile will take a few minutes.

If it can't find the port automatically, specify it:

```bash
esphome run dometic-bridge.yaml --device /dev/tty.usbmodem14201
```

---

## 5. What to watch for in the logs

- **WiFi connects** — confirms basic setup is right
- **BLE scan finds the fridge's MAC** — confirms range/visibility (should be
  easy given it's only a few feet away)
- **Whether `dometic_cfx_ble` successfully connects and reads anything** —
  this is the real test. If it works, you'll see decoded values (temp,
  battery, compressor state) in the log. If it fails to interpret CFX5 data
  even after connecting, the CFX3-only assumption was wrong and this
  particular component won't work as-is.

---

## 6. If it works

Next steps, not yet started:
- Add a small HTTP endpoint or `api:` service call so `van-api` can poll it
- New `services/dometic.py` on the backend, same shape as `shelly.py`
- Add a fridge card to the frontend

## If it doesn't work

- Confirm the fridge MAC is still current (`bluetoothctl` scan from the Pi)
- Check GitHub issues on the `dometic_cfx_ble` repo for CFX5 reports
- Fall back to capturing raw BLE traffic (Wireshark + a BLE sniffer, or
  `esp32_ble_tracker`'s raw advertisement logging) to see what the CFX5
  actually broadcasts, and go from there
