# Garmin PowerSwitch — Control Input Wiring and Test Plan

**Status:** planning and bench-test guide. Nothing here is wired yet.

**Related:** `rubber-duck-review-2026-08-27.md` Part 3 for why this path exists
at all, and why BLE control does not.

---

## Why this instead of BLE

Direct protocol control of the PowerSwitch is not currently possible — not
just for this project, but for anyone. There is no public reverse engineering
of its BLE protocol: no repository, no packet capture, no documented handshake.
Reaching it would mean an iOS HCI capture of the official app followed by weeks
of protocol work, with Starlink and the EcoFlow charge toggle on the other end
of any mistake.

The control inputs are not a workaround *around* the device. They are the
manufacturer's supported interface for exactly this — letting external vehicle
logic drive the switch. An ignition-sense wire, a dash switch, or a relay
output are all the intended use.

## What a control input is, and is not

**It is a signal input.** Garmin specifies 3.3V–18V DC to activate. The line
draws milliamps. The PowerSwitch's own internal switching continues to carry
the actual load — the 100A feed and every output circuit stay entirely inside
the PowerSwitch and are untouched by anything described here.

**It is not a load path.** Nothing described in this document should ever be
placed in series with a powered circuit. If a proposed wiring change would put
a relay, switch, or wire in the current path between the battery and a load,
it is the wrong change.

There are **two** inputs, each mappable in the Garmin PowerSwitch app to any
subset of the six output channels.

---

## Current allocation

| Input | Purpose | Source | Status |
|---|---|---|---|
| Control 1 | Van start / ignition sense | Vehicle ignition-switched 12V | Planned, not wired |
| Control 2 | Door-open project | TBD — see below | Planned, not wired |

Nothing is connected to either input today.

---

## Can several sources share one input?

Yes — but **not on a plain busbar.** Joining two sources to one input means
that whenever source A is energised, current also flows backwards down source
B's wire into whatever B is connected to. With the van's ignition circuit as
one of those sources, that means backfeeding vehicle wiring, which is exactly
the kind of fault that is difficult to diagnose later.

The correct pattern is a **diode OR**: each source gets its own blocking
diode, and the cathodes join at the input.

```
  Shelly output  ──▶|── ┐
                 (diode) │
                         ├──── Control Input 2
  Door switch    ──▶|── ┘
                 (diode)

  ▶| = diode, band (cathode) toward the input
```

Any source can then activate the input, and none can feed the others. Schottky
diodes such as a 1N5819 or 1N5822 are appropriate — low forward drop, and
comfortably rated for a milliamp signal line. Orientation matters: the banded
end faces the PowerSwitch.

With diodes in place, a small terminal block or busbar for the joined cathodes
is fine. The diodes are what make it safe, not the bar.

---

## Does the source have to stay energised?

**Yes — assume the input is level-triggered.** Voltage present means the
assigned outputs are active; voltage removed means they turn off. It is not a
toggle that latches on a pulse.

For a Shelly, that means:

- Configure the relay in **toggle / maintained** mode, not momentary or
  auto-off. The contact must stay closed for as long as you want the channel
  on.
- Set the **power-on default** deliberately. This decides what happens after a
  power cycle, and for a channel feeding something like Starlink that is a
  decision worth making on purpose rather than accepting the default.
- Holding a relay closed draws a small continuous current. Negligible against
  a 300Ah bank, but it is not zero, and it is worth knowing it exists before
  wondering where a few milliamps went.

**Verify this before building around it.** It is the single most important
assumption in this document. Bench test step 4 below settles it in about a
minute.

---

## Caveat worth settling early: does the input override the app?

Garmin's documentation indicates that while a control input is active, it
**overrides** app and BLE control for the channels assigned to it.

If that is true, it has a real consequence: a channel driven by a stuck-on
input cannot be turned off from the phone. For lighting that is an
inconvenience. For **Starlink or the EcoFlow charge toggle** it is worse — it
means a failed relay or a shorted trigger wire could pin the van's internet
into a state the app cannot recover, which is precisely the failure mode this
project should avoid.

This is documented behaviour but has not been verified on this unit. Settle it
during the bench test, and do not assign Starlink or the EcoFlow channel to a
control input until it is settled.

---

## A trap specific to the door-open project

Most vehicle door pin switches are **ground-switching**: the switch connects
the circuit to chassis ground when the door opens, rather than supplying 12V.

The PowerSwitch control input wants **voltage present** to activate. A
ground-switching door pin wired directly to it will do nothing, or will read
backwards from what is intended.

Before wiring anything, measure the actual door switch behaviour with a
multimeter:

- Probe between the switch output and ground, with the door open and closed.
- If the output reads ~12V with the door open, it is voltage-switching and can
  drive the input through a diode directly.
- If it reads continuity to ground with the door open, it is ground-switching
  and needs conversion — a small automotive relay, or the Shelly's `SW`
  terminal used as the sense input with the relay output driving the
  PowerSwitch.

The Shelly approach has the advantage of putting the door state on the network
at the same time, which is likely wanted for the dashboard regardless.

---

## Bench test — do this before wiring anything permanently

The goal is to answer the open questions with the PowerSwitch on the bench or
in the van, but with **no channel assigned to Starlink or the EcoFlow**.

**Test with the Shelly bought for the door project. Do not buy hardware
specifically for this test.**

### Preparation

1. In the Garmin PowerSwitch app, assign **Control Input 2 to a single
   harmless channel only** — an accessory light or the light bar. Explicitly
   confirm Starlink and the EcoFlow channel are *not* assigned to either input.
2. Confirm the light responds normally from the app first. This is the control
   case; if the app cannot switch it, nothing below means anything.

### Wiring for the test

3. Wire, in this order, with the van's main disconnect off while working:
   - Fused 12V (1–3A at the fuse block) to the Shelly's `12V+` terminal
   - Shelly `L` terminal to 12V negative — note the Shelly 1 Gen4 uses `L` as
     the DC ground, **not** `N`; see `HARDWARE.md`
   - A jumper from `12V+` to `I` (relay input), as with the existing units
   - Shelly `O` (relay output) through a Schottky diode, band toward the
     PowerSwitch, to **Control Input 2**
   - Confirm the Shelly's supply negative and the PowerSwitch share a common
     ground reference
4. Before connecting to the PowerSwitch, **measure the Shelly output with a
   multimeter**: toggle it and confirm you see roughly 12V when on and near 0V
   when off, at the diode's output side. Only then connect it to the input.

### What to test

5. **Level vs pulse.** Toggle the Shelly on. The light should come on and stay
   on. Toggle off; it should go off. If a brief pulse latches the channel on,
   the input is edge-triggered rather than level-triggered and this whole
   document's assumption needs revisiting.
6. **App override.** With the Shelly holding the input on, try to turn that
   channel off from the Garmin app. Record what happens. This answers the
   override question above and determines whether the pattern is ever safe for
   Starlink.
7. **Power-loss behaviour.** Cut power to the Shelly with the input active.
   The channel should drop. Restore power and confirm the Shelly returns to
   its configured default rather than an unexpected state.
8. **Sub-11V behaviour.** Not worth inducing deliberately, but be aware: below
   11V the PowerSwitch turns **all** outputs off to protect the battery, and
   they return above 12V. Outputs do **not** restore their previous state after
   a power loss. If an output is unexpectedly off, check pack voltage before
   suspecting software.

### Recording results

Log the outcome in `rubber-duck-review-2026-08-27.md` under Part 3, or a new
dated review if it turns into an investigation. In particular, record the
override answer explicitly — it is the finding that determines whether this
approach scales past lighting.

---

## Integrating with van-api once it works

No new integration pattern is needed. The Shelly is controlled exactly like
the existing units:

- Add the unit to `HARDWARE.md` with its DHCP reservation, following the
  existing table
- Add it to `shelly.py` alongside `maxxfan`, `lights`, `usb`, `spare`
- Name it for its function rather than generically, since the semantics differ
  from a normal on/off circuit — this is a trigger, not a load

Worth noting in the router or its docstring that this Shelly drives a *control
signal*, not a load. A future reader seeing a Shelly mapped to "light bar"
could reasonably assume the relay carries the lighting current. It does not,
and the distinction matters if anyone ever reconsiders the wiring.

---

## Open questions

- Is the input level-triggered or edge-triggered? (bench test 5)
- Does an active input override app/BLE control? (bench test 6)
- Is activation voltage-high on this unit, or is any variant ground-switching?
  Confirm against the Garmin manual for this specific model before wiring.
- Is the door pin switch ground-switching or voltage-switching? (multimeter,
  before any door wiring)
- With Control 1 committed to ignition sense and Control 2 to the door
  project, both inputs are spoken for. Any further van-api-driven switching
  would have to share Control 2 through the diode OR — worth deciding whether
  that is desirable before it becomes necessary.
