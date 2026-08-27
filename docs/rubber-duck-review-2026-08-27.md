# Rubber Duck Review — Dometic CFX5, EcoFlow Telemetry, Garmin PowerSwitch

**Date:** 2026-08-27

Three questions drove this session:

1. The ESP32-S3 bridge connects to the CFX5 and writes successfully but never
   receives a single notification. Is the current "it needs bonding" theory
   right, and what is the actual next move?
2. The EcoFlow integration returns battery percentage only. Can it return
   state of charge detail, watts, port states, and connection status?
3. Can the Garmin PowerSwitch be reached at all, or is it effectively closed?

All three turned out to have concrete, citable answers. The short version: the
bonding theory is correct but incomplete, the EcoFlow ceiling is real for the
current approach but not for the device, and the PowerSwitch is probably
reachable for exactly the reason the fridge turned out to be.

---

# Part 1 — Dometic CFX5

## The existing work holds up

Worth saying first, because the conclusion below reads like a setback and it
is not. The debugging session that produced the current state was sound:

- The CFX3-vs-CFX5 UUID gap was found and fixed correctly. Service `537a0400`,
  write `537a0401`, notify `537a0402` is confirmed right for a CFX5 by an
  independent implementation's constants file, not just by local observation.
- Ruling out `product_type` by testing SZ, SZI and DZ with identical results
  was the correct experiment, and it eliminated the obvious suspect properly.
- Backing off the BLE scanner from 320ms/320ms to 1100ms/30ms was a real fix
  for a real problem and is unrelated to the fridge blocker.

The 537a04xx patch is not wasted work. Every implementation that talks to a
CFX5 uses those exact UUIDs.

## The bonding theory is correct, and the mechanism is now documented

`philippe-a11y/home-assistant-dometic-cfx` reverse-engineered the Dometic
Mobile Cooling app from HCI snoop logs and documents the behaviour precisely:

> The HCI snoop of the Mobile Cooling app shows that on bonded reconnects the
> central proactively issues LE Start Encryption ~270ms after the connection
> comes up; the CFX neither sends a Security Request nor returns ATT security
> errors, so neither BlueZ nor the kernel would ever encrypt on their own.

That is an exact description of the observed symptom. The fridge:

- accepts unencrypted GATT writes without complaint, which is why
  `ESP_GATTC_WRITE_CHAR_EVT` fires three times every session;
- never sends a Security Request, so the ESP32 is never prompted to pair;
- never returns an ATT authentication error, so nothing surfaces as a failure;
- simply declines to send any notification until the link is encrypted.

The central has to initiate encryption unprompted. Nothing in the current
setup ever does. `BLEClientBase::pair()` exists in ESPHome and calls
`esp_ble_set_encryption(bda, ESP_BLE_SEC_ENCRYPT)`, but the vendored
`dometic_cfx_ble` component never calls it, and ESPHome's own GAP handler only
reacts to peripheral-initiated security requests — which the CFX5 never sends.

This is validated on a CFX5 35 specifically, which is our exact model. It is
also the documented resolution of `andrewbackway/esphome-dometic_cfx_ble`
issue #3, where another user patched the UUIDs to 537a04xx, got the same
silence, and was pointed at the bonding-aware fork.

## The part the current theory misses: there are two protocols, not one

This is the finding that changes the plan. `537a03xx` and `537a04xx` are not
the same protocol at different addresses. They are different protocol
generations, and the vendored component only implements the older one.

| | DDM1 | DDM2 |
|---|---|---|
| Service base | `537a03xx` | `537a04xx` |
| Models | CFX3 | CFX5, CFX2 (`MC1`, `MC2`, `MC3`) |
| Opcodes | PUB `0x00`, SUB `0x01`, PING `0x02` | PUB `0x10`, SET `0x11`, SUB `0x12` |
| Handshake | PING → ACK → HELLO → ACK, then subscribe | subscribe directly, no PING, no HELLO |
| Value encoding | one byte per switch/enum | 32-bit little-endian integers |

Our fridge advertises as `MC1_8d87f4`. `MC1` is DDM2.

So the subscribe payload currently being written — `[0x01, product_type, 0x00,
0x00, 0x81]`, a DDM1 SUB frame — would be meaningless to the fridge even over
an encrypted link. Similarly, the PING heartbeat every 3s does not exist in
DDM2 at all. This also explains, more satisfyingly than bonding alone, why the
product-type byte made no difference: it is a field in a frame the fridge was
never going to parse.

**Revised diagnosis: two independent blockers, both of which must be fixed.**
Bonding is necessary but not sufficient. Fixing bonding alone would most
likely produce an encrypted link that is still silent, which would be a
confusing and demoralising result to hit without knowing this in advance.

## Recommended next move: stop vendoring the CFX3 component

The current plan of record — "add real bonding support to the vendored
component, that's new C++ work, a separate project" — is now the wrong plan.
It solves one of the two problems, in a component whose entire protocol layer
targets the wrong fridge generation.

`philippe-a11y/esphome-dometic-cfx5` is an ESPHome fork that already handles
both: DDM2 opcodes and encoding, plus the bonding sequence. It is the sister
project to the HA integration that was validated against a CFX5 35. Swapping
the `external_components` source to it is a config change, not a C++ project,
and it should be tried before writing any code.

**Suggested sequence, cheapest first:**

1. Put the fridge into Bluetooth PAIR mode. The first bond requires it. This
   is a prerequisite for every path below and costs nothing to do.
2. Point `external_components` at the CFX5 fork, keep the local patched copy
   on disk as a fallback, and flash. Watch for `ESP_GAP_BLE_AUTH_CMPL_EVT`
   with success, then for RX frames.
3. Keep `esp32_ble: io_capability: none`. That is already the default and it
   is the correct value — the CFX5 uses Just Works, so NoInputNoOutput is what
   the phone app presents too. This is one setting that does not need changing.
4. Only if the fork fails, port the two changes into the vendored component by
   hand: call `esp_ble_set_encryption` on `ESP_GATTC_OPEN_EVT` before service
   discovery and gate discovery on auth completion, then replace the DDM1
   frame builder with DDM2 opcodes and 32-bit values.

## Two things to verify while debugging

- **`ESP_GATTC_WRITE_DESCR_EVT` in the logs.** The vendored component calls
  `esp_ble_gattc_register_for_notify()` directly and handles
  `ESP_GATTC_REG_FOR_NOTIFY_EVT` in its own handler without calling up to
  `BLEClientBase`, so ESPHome's automatic CCCD (0x2902) write never runs for
  it. Whether ESP-IDF writes the descriptor itself is worth confirming from
  the logs rather than assuming. It requires logger level VERBOSE. The notify
  characteristic is NOTIFY, not INDICATE, so the value should be `0x0001`.
  This is probably not the blocker — the fridge would be silent regardless on
  an unencrypted link — but it is free to check and would be embarrassing to
  discover later.
- **Bond durability across reflashes.** The bond lives in the ESP32's NVS and
  in the fridge. Reflashing or clearing NVS drops it and requires PAIR mode
  again. This is the root cause of issue #4 on the upstream repo and will
  otherwise look like a regression during iteration.

## Repository finding, unrelated to the protocol

`esp32-dometic/components/` is not in git. `git ls-files esp32-dometic`
returns only `dometic-bridge.yaml`, and the directory is not covered by
`.gitignore` either — it was simply never added.

That means the patched C++ containing the confirmed 537a04xx work, and the
commentary describing what is verified versus extrapolated, exists on exactly
one machine with no backup. It also means the committed YAML cannot build as
checked out, because `external_components` points at `type: local, path:
components`.

This is worth fixing regardless of which protocol path is taken. If the fork
in step 2 works, the vendored copy can be deleted rather than committed — but
that should be a decision, not an accident.

---

# Part 2 — EcoFlow River 2 Max

## The current decode is correct, and it is also the ceiling

The existing implementation is right. Manufacturer ID `0xB5B5`, 16-byte ASCII
serial at bytes 1–16 of the value, battery percentage at byte 17. Independent
hardware measurement on an R613 confirms the same layout.

The open question in the `ecoflow_ble.py` docstring — bytes 18–24, "possibly
watts in/out or status flags, not decoded" — now has an answer, and it is no.
Those bytes were observed constant across sessions and across two different
River 2 units. The final byte varies between units and is most likely a
checksum.

> Watts / input / output / remaining time are not in the advertisement (all
> the trailing bytes are constant or a checksum). They require the GATT
> session.

So the honest statement is stronger than the current docstring: this is not
undecoded data waiting for a better capture. There is no more data in the
advertisement. Passive scanning gets battery percent and nothing else, ever.
That is worth writing down so nobody spends another evening on it.

## But yes — everything asked for is available, two ways

State of charge detail, charge and discharge watts, per-port states, remaining
time, temperature, cycles, and connection status all exist. Both paths require
leaving passive scanning behind.

### Option A — Official cloud API over MQTT

Keys are self-serve and instant at `developer.ecoflow.com`; no approval queue
for personal use. `GET /iot-open/sign/certification` returns temporary broker
credentials and a `userId`, then the device pushes state to
`/open/{userId}/{sn}/quota` over TLS MQTT. Push-based, so no polling loop and
no rate-limit exposure. Roughly 200 lines of `requests` plus `paho-mqtt`.

Fields relevant to what was asked, from the River 2 Max field map in
`tolwi/hassio-ecoflow-cloud`:

| Field | Meaning |
|---|---|
| `bms_bmsStatus.soc` | Battery percentage |
| `bms_emsStatus.chgState` | Charging state |
| `bms_emsStatus.chgRemainTime` / `dsgRemainTime` | Minutes to full / to empty |
| `bms_emsStatus.maxChargeSoc` / `minDsgSoc` | Charge limits |
| `bms_bmsStatus.temp` | Battery temperature |
| `bms_bmsStatus.soh` / `cycles` | Health and cycle count |
| `pd.wattsInSum` / `pd.wattsOutSum` | Total in / out watts |
| `pd.carWatts` / `pd.carState` | 12V port watts and state |
| `pd.typec1Watts` / `pd.usb1Watts` | USB-C / USB-A watts |
| `inv.inputWatts` / `inv.outputWatts` | AC in / out watts |
| `inv.acInVol` / `invOutVol` / `outTemp` | AC voltages, inverter temp |
| `mppt.inWatts` / `inVol` / `inAmp` / `chgType` | Solar and DC input |

The obvious problem: it is cloud-only. In a van that is regularly offline,
this is a dashboard that goes blank exactly when it matters most.

### Option B — Local BLE GATT, fully offline

`rabits/ha-ef-ble` supports our device explicitly — `device_mappings.py` lists
`"R613": {"name": "EcoFlow RIVER 2 Max", "packets": "v2"}`, and our serial is
`R613ZAB6XG1P0314`. Its `eflib/` subdirectory has no Home Assistant
dependency and is portable into `services/`.

It yields about twenty fields: SOC, cell temperature, input and output power,
AC in/out, 12V, USB-A, USB-C, solar and car input, both remaining-time values,
AC and DC port booleans, charge limits, AC charging speed, and DC mode. That
covers everything asked for except state of health and cycle count.

The cost is real but bounded and mostly one-time:

- The GATT link is encrypted. Curve25519 ECDH, HKDF-SHA256 session keys,
  AES-CBC packets, protobuf payloads.
- It needs an EcoFlow account `userId`, fetched once from
  `api.ecoflow.com/auth/login` while online, then cached forever. That is the
  only online step.
- The key table extracted from the vendor app is already bundled in the
  library. It does not need extracting.
- Dependencies are `bleak`, `PyCryptodome`, `protobuf`, `fastcrc`, `ecdsa` —
  all pip-installable on ARM, no problematic C extensions.

Two caveats that matter specifically for this project:

- **The EcoFlow allows one BLE central at a time.** While the Pi holds the
  connection, the phone app cannot connect. This mirrors the BMS situation and
  argues for the same treatment: a Release/Connect control, or a persistent
  connection with a documented way to hand the radio back.
- **This adds a third persistent-ish BLE consumer.** The Pi already holds the
  BMS connection and scans for Victron and EcoFlow. Given how recently
  2.4GHz contention was root-caused for the ESP32, adding a connected session
  should be treated as a change that needs the same before-and-after check on
  Pi responsiveness and BMS link stability.

### Recommendation

Option B, with Option A as an optional enrichment later. The van's defining
constraint is that it is often offline, and BLE keeps working when Starlink
does not. It also matches every existing pattern in the codebase — BLE service
in `services/`, cached reading, staleness-based `connected`, thin router.

The cloud path is genuinely easier and returns slightly more, but a power
dashboard that requires internet to show local battery state is the wrong
tradeoff for this project.

Whichever is chosen, the passive advertisement scan is worth keeping as a
cheap liveness signal: it is the one thing that works with no connection, no
auth and no radio cost, and it answers "is the unit powered on and nearby".

---

---

# Part 3 — Garmin PowerSwitch

Added later the same day, after the fridge and EcoFlow questions were
answered. The question was simply: can we get a connection, or is this
impossible?

## The standing theory is wrong

`README.md` says the PowerSwitch "won't bond with anything but its own app",
and `rubber-duck-review.md` says it is "likely bonded to a Garmin head unit or
the Garmin Drive app and refusing additional centrals". Garmin's own support
documentation contradicts this directly: the PowerSwitch supports **up to four
simultaneous controllers**, and being able to drive it from a phone and a head
unit at the same time is an advertised feature, not an edge case.

If fewer than four controllers are bonded — and in this van there is at most
one, the phone app — the device has no documented reason to refuse the Pi.

The error is also the wrong shape for a refusal. `le-connection-abort-by-local`
is a *local* abort: the host stack gave up. A peripheral rejecting an unknown
central surfaces as an HCI rejection code instead. And the fridge advertises
`ADV_IND`, fully connectable, throughout.

## It is the same BlueZ problem as the fridge

The symptom is identical to the Dometic: link establishes, then aborts during
service discovery, on every attempt, regardless of scan state, signal
strength, or whether van-api is running. The PowerSwitch sits at -18 to -38
dBm — this was never a range problem.

`prebsit/dometic-fjx7-ha` documents the mechanism for its own device:

> The FJX7's Microchip BLE module has a firmware quirk: it requires encrypted
> BLE (Just Works bonding) and does not send ATT Write Responses to Linux's
> BlueZ stack. This breaks every Linux-based BLE implementation [...] Apple's
> CoreBluetooth handles this silently (macOS works fine), and Espressif's
> ESP-IDF/NimBLE stack also handles it correctly.

That is the same conclusion already reached for the CFX5, from the same
evidence, and it is now the better explanation for the PowerSwitch too.

**Caveat, and it is a real one:** Garmin is not Dometic. There is no
confirmation that the PowerSwitch uses the same Microchip module. The symptom
match is strong circumstantial evidence, not proof — exactly the same standard
of evidence the CFX5 conclusion was originally held to.

**So: a connection is probably achievable from the ESP32.** That is the honest
answer to the question asked.

## But connecting is not controlling

This is where it stops being encouraging. There is **no public reverse
engineering of the PowerSwitch BLE protocol at all**. Not a repository, not a
packet capture, not a forum thread with byte offsets. Searches across GitHub,
the Home Assistant and ESPHome forums, Hackaday and Reddit return nothing.
This project's own `rubber-duck-review.md` is currently the most detailed
public writeup of what happens when you try.

The protocol is most likely Garmin's Multi-Link (ML) / GFDI framing, which
Gadgetbridge has documented for wearables — binary payloads under service
`6A4E2800-...`, with an authenticated service-registration handshake that must
complete before functional commands are accepted. Whether the PowerSwitch uses
the same service UUIDs as a watch is unverified and cannot be settled without
sniffing a live session from the official app.

Realistic effort: enumerate the GATT tree from an ESP32 in an evening, then
weeks of work starting from an iOS `btsnoop` capture to learn the handshake
and command format — with live exterior circuits on the other end throughout.

## The wired path makes most of that unnecessary

The PowerSwitch has **two physical control inputs**, documented by Garmin,
accepting a **3.3V to 18V** signal, each mappable in the app to any subset of
the six output channels. Applying voltage activates the assigned outputs. No
pairing, no protocol, no BLE.

There is already a spare Shelly 1 Gen4 at `192.168.1.104`, and `shelly.py`
already has the HTTP control pattern. Wiring the spare's NO contact from a
fused 12V source to Control Input 1 gives van-api real control in roughly the
time it takes to run the wire.

The limitation is honest: two inputs means two groups, not six independent
channels. Whether that is sufficient depends entirely on the use case. It also
fails safe — the Shelly defaults open on power loss.

## Safety: the circuit list in both docs was wrong

Confirmed 2026-08-27, the PowerSwitch actually controls:

- accessory lights
- light bar
- **EcoFlow** — used to toggle charging on and off from the driver's seat
- **Starlink**
- KC lights

Both existing docs were wrong in ways that understated the risk.
`rubber-duck-review.md` lists only light bar, KC SlimLites and rock lights —
all exterior lighting, which is why its safety note frames the danger as
"blind writes can energise real exterior circuits". `HARDWARE.md` was closer
but missed the accessory lights and the EcoFlow's purpose.

The corrected list changes the risk profile materially. **Starlink is on this
device.** A blind write that cuts the Starlink channel takes out Tailscale,
the dashboard, and any remote path back into the van — potentially while
mid-experiment and away from the vehicle. The EcoFlow channel controls
charging behaviour on the unit Part 2 is about integrating.

Revised safety rule for any future PowerSwitch work: enumeration and reads
remain safe. Writes must be done from inside the van, in person, with the
lights in view **and with the understanding that losing Starlink is a possible
outcome**. Do not attempt protocol experiments remotely.

Two further points from Garmin's documentation:

- Below 11V the device turns **all** outputs off to protect the battery, and
  they come back on above 12V. Worth knowing before attributing an unexplained
  Starlink or EcoFlow dropout to software.
- After a power loss, outputs stay **off** — state is not restored. Which is
  another argument for the wired input path: a relay-driven control input is
  arguably more predictable than the device's own state handling.

## Recommendation

Do the wired experiment first. One spare Shelly, a short run of wire, and a
one-time mapping in the Garmin app answers whether two groups are enough. If
they are, the BLE work is weeks of effort and live-circuit risk for a problem
already solved.

Keep the ESP32 BLE path as a genuine option rather than a closed door, because
the blocker is now believed to be BlueZ rather than the device refusing us —
but sequence it behind the fridge. The fridge has a known protocol, a
validated reference implementation, and no ability to disconnect the van from
the internet if a write goes wrong. The PowerSwitch has none of those things.

If the BLE path is ever taken up, the first step is not code. It is an iOS
Bluetooth HCI capture of the official app performing a single channel toggle.

---

## Suggested doc corrections

Applied on this branch except where noted:

- `services/ecoflow_ble.py` docstring: bytes 18–24 resolved as
  constant/checksum, not "possibly watts in/out". Applied — the open question
  is replaced with the closed answer so it does not invite a repeat
  investigation.
- `services/ecoflow_ble.py` said "one-shot passive scan", but
  `BleakScanner(_callback)` defaults to active scanning, which transmits scan
  requests. Comment corrected to match the code. **The behaviour was
  deliberately left alone** — switching to true passive scanning on BlueZ
  requires `or_patterns` and would change discovery reliability, which is a
  decision to make with the radio-contention measurements in hand, not a
  drive-by fix.
- `CLAUDE.md` Known Issues, Dometic entry: now names the DDM1/DDM2 protocol
  mismatch alongside bonding, and the planned direction changed from "add
  bonding to the vendored component" to "try the CFX5 fork first". Applied.
- `CLAUDE.md` EcoFlow entry: now points at the two reachable paths instead of
  reading as a dead end. Applied.
- `docs/esp32-dometic-bridge.md`: rewritten. It described the original CFX3
  component and framed "does it work on a CFX5" as the open question. That
  question is answered, so the guide now covers DDM2 and bonding.
- `docs/rubber-duck-review.md` and `README.md`: the "bonded to its own app and
  refusing additional centrals" claim about the PowerSwitch is corrected, and
  the incomplete circuit list in the safety note is fixed. Applied.
- `docs/HARDWARE.md`: PowerSwitch circuit list corrected. Applied.
- `esp32-dometic/dometic-bridge.yaml`: switched to the CFX5 fork.
  **Unvalidated** — needs a flash with the fridge in PAIR mode to confirm.
- **Not applied, still outstanding:** `esp32-dometic/components/` is untracked
  and exists on one machine only. Left alone deliberately, because if the fork
  works the right move is to delete it rather than commit it. That is a
  decision to make after the next flash, not before.

## Sources

- `philippe-a11y/home-assistant-dometic-cfx` — DDM1/DDM2 constants, bonding
  sequence, HCI snoop analysis; validated on CFX5 25 and CFX5 35
- `philippe-a11y/esphome-dometic-cfx5` — ESPHome fork with DDM2 and bonding
- `andrewbackway/esphome-dometic_cfx_ble` issues #3, #4, #11 — the identical
  symptom, bond loss on reflash, and an nRF Connect capture confirming the
  notify characteristic is NOTIFY with a CCCD
- `esphome/esphome` `esp32_ble_client/ble_client_base.cpp` — `pair()`,
  automatic CCCD write, MTU request, auth-complete handling
- `tolwi/hassio-ecoflow-cloud` `docs/devices/RIVER_2_MAX.md` — quota field map
- `rabits/ha-ef-ble` `eflib/` — R613 support, BLE field list, encryption stack
- `lightheaded/bledash-esp32` `docs/protocols/ecoflow.md` — advertisement byte
  map measured on real R613 hardware
- Garmin PowerSwitch owner's manual and support FAQs — BLE-only transport, up
  to four simultaneous controllers, two 3.3–18V control inputs, and the
  sub-11V all-outputs-off behaviour
- `prebsit/dometic-fjx7-ha` — the BlueZ/Microchip ATT Write Response quirk,
  and the reason ESP-IDF/NimBLE succeeds where BlueZ cannot
- `gadgetbridge.org/internals/specifics/garmin-protocol/` — Garmin ML/GFDI
  framing, documented for wearables and only inferred for the PowerSwitch
