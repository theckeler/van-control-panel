# ESP32-S3 → Dometic CFX5 BLE Bridge — Setup Guide

**Goal:** Get an ESP32-S3 talking to the Dometic CFX5 over BLE (bypassing the
Pi's BlueZ stack, which can't hold a stable connection to it), publishing
fridge state to `van-api` over WiFi like every other device.

**Status (2026-08-27):** The BLE layer works — the ESP32 connects to the
fridge reliably and enumerates its GATT tree, which the Pi never managed. Two
blockers were found above that layer and both are now understood. See
`rubber-duck-review-2026-08-27.md` for the full investigation.

---

## What was wrong, and what changed

### Blocker 1: wrong protocol generation

The original component (`andrewbackway/esphome-dometic_cfx_ble`) targets CFX3.
The obvious-looking fix was to patch its service UUIDs from `537a03xx` to
`537a04xx`, which was confirmed correct for a CFX5 by reading the real
hardware.

That patch was necessary but not sufficient. `537a03xx` and `537a04xx` are not
the same protocol at two addresses — they are different generations:

| | DDM1 | DDM2 |
|---|---|---|
| Service base | `537a03xx` | `537a04xx` |
| Models | CFX3 | CFX5, CFX2 (`MC1`, `MC2`, `MC3`) |
| Opcodes | PUB `0x00`, SUB `0x01`, PING `0x02` | PUB `0x10`, SET `0x11`, SUB `0x12` |
| Handshake | PING → ACK → HELLO → ACK, then subscribe | subscribe directly |
| Values | one byte per switch/enum | 32-bit little-endian |

Our fridge advertises as `MC1_8d87f4`, so it is DDM2. The patched component
was writing DDM1 frames to a DDM2 device.

This is also why testing all three `product_type` values changed nothing: the
product type is a field inside a frame the fridge was never going to parse.

### Blocker 2: no bonding

The CFX requires an encrypted link before it will send notifications, and it
does not ask for one. It never sends a Security Request, never returns an ATT
authentication error, and accepts unencrypted writes without complaint — it
simply stays silent. The central has to call for encryption itself, roughly
270ms after connect, which is what the official Mobile Cooling app does.

Nothing in the original setup ever did that. ESPHome has
`BLEClientBase::pair()` (`esp_ble_set_encryption`), but the component never
called it, and ESPHome's own GAP handler only reacts to peripheral-initiated
security requests.

### The fix

`dometic-bridge.yaml` now uses `philippe-a11y/esphome-dometic-cfx5`, a fork
that implements DDM2 and the bonding sequence. That fork is the sister project
to a Home Assistant integration validated against real CFX5 hardware,
including a CFX5 35 — our exact model.

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

Note the device path that shows up (e.g. `/dev/tty.usbmodem14201`).

---

## 3. Secrets

`dometic-bridge.yaml` reads WiFi credentials and the fallback AP password from
`secrets.yaml`, which is gitignored. Create it alongside the YAML:

```yaml
wifi_ssid: "YOUR_SSID"
wifi_password: "YOUR_PASSWORD"
fallback_ap_password: "something-long"
```

The `api:` encryption key is already in the YAML and is not a WiFi secret.

---

## 4. Put the fridge into PAIR mode — do this first

**This is required for the first bond and is easy to forget.** Hold the
fridge's Bluetooth button until it enters PAIR mode, then flash. Without it
the ESP32 cannot establish the bond, and the failure looks identical to the
old silent-RX symptom.

The bond is stored in the ESP32's NVS and on the fridge. Reconnects afterwards
do not need PAIR mode — but **reflashing or erasing NVS drops the bond**, and
you will need PAIR mode again. This is a known upstream issue (#4) and will
otherwise look like a regression while iterating.

---

## 5. Flash it

```bash
esphome run dometic-bridge.yaml
```

This compiles, flashes over USB, then attaches to the serial log. First
compile takes a few minutes.

If it can't find the port automatically:

```bash
esphome run dometic-bridge.yaml --device /dev/tty.usbmodem14201
```

**On the first run with the fork, expect possible config errors.** The sensor
`type:` names and component keys in our YAML came from the old component's
schema. If ESPHome rejects them, check the fork's README and rename — that is
a config fix, not a protocol problem.

---

## 6. What to watch for in the logs

In order:

- **WiFi connects** — basic setup is right.
- **BLE connects to the fridge** — expected to work; this part already did.
- **`ESP_GAP_BLE_AUTH_CMPL_EVT` with success** — the bond. This is the new
  step and the one that matters. If it fails, the fridge was probably not in
  PAIR mode, or a stale bond exists on one side.
- **`ESP_GATTC_WRITE_DESCR_EVT`** — the CCCD (0x2902) write enabling
  notifications. Requires logger level `VERBOSE`. The notify characteristic is
  NOTIFY, not INDICATE, so the value should be `0x0001`.
- **Decoded values** — temperature, battery voltage, cooler power, door state.
  This is the thing that has never once happened. If it does, the bridge works.

---

## 7. If it works

- Add `services/dometic.py` to the backend, same shape as `shelly.py`, polling
  the ESP32's `web_server` JSON endpoints (`/sensor/<id>` etc.) over WiFi.
- Add a fridge card to the frontend.
- Decide what to do with `esp32-dometic/components/` — the old vendored CFX3
  copy. It is currently untracked and exists on one machine only. If the fork
  works, delete it rather than committing it.

## If it doesn't work

- Confirm the bond actually completed rather than assuming — look for the auth
  event explicitly, not just "connected".
- Erase NVS (`esphome clean`, or flash with erase) and redo PAIR mode, to rule
  out a half-bonded state on either side.
- Confirm the fridge MAC is still current (`bluetoothctl` scan from the Pi).
- Toggle Bluetooth fully off on any phone in the van. The fridge stops
  advertising while connected, and iOS can hold or re-establish a link with
  the app swiped away — this previously made it look like a silent device.
- Check open issues on the fork and on `andrewbackway/esphome-dometic_cfx_ble`
  (#3 is the identical UUID-patched-but-silent case).

---

## Radio contention note

The scanner is deliberately set to `interval: 1100ms` / `window: 30ms`, not
the near-100%-duty-cycle settings it originally had. The ESP32 and the Pi
share the same van and the same 2.4GHz spectrum that the Pi's BLE link to the
BMS depends on. Aggressive scanning here was root-caused as a likely source of
Pi slowness on 2026-08-27. Leave it eased unless there's a measured reason.

Keep `logger:` out of `VERY_VERBOSE` for the same reason once debugging is
done.
