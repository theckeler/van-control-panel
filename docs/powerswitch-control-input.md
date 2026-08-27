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
| Control 1 | Van start / ignition sense | Ignition-switched 12V, under-seat tap via signal busbar | Wired |
| Control 2 | Door-open project | Dome light circuit | Planned |

### The under-seat signal busbar

A fused line runs from an under-seat connection to a small busbar, which feeds
two destinations:

- the Orion-Tr's **remote on/off terminal** (not its main input)
- the PowerSwitch **Control Input 1**

Both therefore come up when the van is running.

**The topology is correct.** This is one source fanning out to two
destinations, which needs no diode isolation — the diode-OR pattern described
below applies only in the reverse case, where several *sources* drive a single
input. Nothing here carries load current: the Orion-Tr's real input remains its
own 8AWG/30A feed, and the PowerSwitch's heavy supply remains its own direct
battery feed.

**The fuse is the thing to check.** Recollection is roughly 12AWG wire on a
40A or 20A fuse. If that is accurate, it is oversized on both counts:

- *Against the load* — this line drives two high-impedance signal inputs
  drawing milliamps. Nothing on it will ever pull an amp.
- *Against the wire* — a fuse protects the conductor, not the device. 12AWG in
  this kind of run is generally treated as good for ~20–25A. A 40A fuse on it
  means a chafed-through wire can pass 40A and heat the insulation without the
  fuse ever clearing, which is the failure mode fuses exist to prevent.

**Suggested change:** confirm the actual fuse rating, and if it is above about
5A, drop it to 5A (or 3A). Nothing on this circuit needs more, and a smaller
fuse clears a fault far sooner. The 12AWG itself is oversized for a signal run
but harmless — mechanically robust and negligible volt-drop, which is fine.

**Label the busbar.** This is the less obvious risk. A busbar fed by 12AWG on a
large fuse *looks* like a power distribution point. Someone later — including
the person who built it — could reasonably tap it for a real load, and it is
not built for that. A physical label reading something like "SIGNAL ONLY — mA,
no loads" removes that possibility permanently and costs nothing.

### Interaction with the override question

With Control 1 on ignition, every channel assigned to it is forced on whenever
the van is running. **Confirmed 2026-08-27:** those channels can still be
switched off from the app while the input is active — the input asserts a
state, it does not lock one in. Assignment is therefore a convenience decision,
not a safety one.

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

## Resolved: the input does NOT lock out the app

**Confirmed on the actual unit, 2026-08-27.** With Control 1 held active by the
van's ignition, the assigned channel could still be switched off from the
Garmin app.

Garmin's documentation reads as though an active input *overrides* app and BLE
control. On this hardware it does not — the input asserts a state, and the app
can still take it back.

This matters more than it sounds, because it removes the main safety objection
to the whole approach. The feared failure mode was a stuck-on input or shorted
trigger wire pinning a channel into a state the app could not recover — which
for **Starlink or the EcoFlow charge toggle** would have meant a wiring fault
taking out remote access to the van with no way to recover it from the phone.
That risk does not exist. The app remains the final authority.

Practical consequences:

- Starlink and the EcoFlow toggle are no longer off-limits for input
  assignment. Assign them on their merits.
- A stuck input is now a nuisance rather than a lockout.
- Bench test 6 below is answered; it is kept for the record and because the
  behaviour is worth re-confirming after any Garmin firmware update.

Still worth knowing: the *reverse* case is untested. Whether an app-off state
survives a fresh rising edge on the input — i.e. whether re-triggering
re-asserts on — has not been checked. With Control 1 on ignition that is every
engine start, so it will answer itself in normal use.

---

## The door-open project: dome light tap

The plan is **not** to use door pin switches. Instead, tap the existing dome
light circuit: doors open, the interior lamp comes on, and that same signal
drives Control Input 2.

This is a better starting point than a door pin, because a lamp circuit is
already a switched 12V source rather than a bare switch contact. But it needs
the same verification, because on a VS30 the interior lighting is driven by
the body computer and two behaviours are common:

- **Ground-side switching.** The lamp sits at a constant +12V and the SAM
  switches the *ground* side. If yours is wired this way, tapping the hot side
  gives permanent 12V — the channel would simply be on always — and the
  switched side is a ground path, which will not drive a voltage-high input at
  all. This is the same trap as a door pin, just relocated.
- **Soft fade.** VS30 dome lamps typically ramp on and off rather than
  switching hard. A voltage ramping slowly through the input's ~3.3V threshold
  could produce brief chatter at each transition. Probably harmless, but worth
  observing rather than discovering later.

**Measure before wiring.** At the dome circuit, with a multimeter:

- Probe the lamp's switched conductor to ground, doors open and doors closed.
- ~12V with doors open and ~0V closed: voltage-switching, and it can drive the
  input through a blocking diode directly.
- Constant ~12V in both states: the SAM is switching ground. Use the Shelly's
  `SW` terminal to sense that circuit and drive the PowerSwitch from the
  relay output instead.
- Watch whether the voltage steps or ramps, to see the fade behaviour.

### What the signal actually means

Worth being precise, because the project name is slightly misleading. The dome
circuit means *interior lamp active*, which is not the same as *door open*:

- it also activates on unlock, and on the manual dome switch;
- it times out on its own, typically after 10–15 minutes;
- it generally goes out when the van is locked or driven off.

That may be perfectly acceptable, or even preferable, for triggering lighting.
It is not a reliable door-state sensor, so it should not later be treated as
one on the dashboard. If genuine door state is wanted for van-api, that is a
separate sensor.

Using a Shelly to sense the circuit rather than wiring straight through has a
secondary benefit: it puts the state on the network, which is what the
dashboard would want anyway.

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

## Can the Pi's GPIO drive the input directly?

Physically, yes. It is still the wrong way to do it in this van, for four
reasons that compound.

**1. 3.3V is the bottom of the spec, not a comfortable point in it.**
The input accepts 3.3–18V. A Pi GPIO pin is 3.3V *nominal* and sags under
load, before any drop across the run from the Pi to the PowerSwitch. You would
be sitting exactly on the threshold and hoping. 12V through a relay contact
sits in the middle of the range with margin on both sides.

**2. Pi GPIO can source ~16mA absolute maximum**, and the control input's
actual current draw is not documented. It is probably small. "Probably" is
carrying weight there, and exceeding it damages the SoC, not a $20 part.

**3. No galvanic isolation — this is the real objection.**
A direct GPIO connection ties the Pi's 3.3V logic to the 12V system that also
carries 100A. Two consequences:

- **Ground offset.** Under heavy load, the PowerSwitch's ground reference and
  the Pi's ground are not at the same potential. That difference appears
  across the GPIO pin.
- **Transients.** Vehicle electrical systems produce load-dump spikes far
  above 12V when the alternator is running. A relay contact or optocoupler
  absorbs that. A GPIO pin conducts it into the SoC.

The failure mode is a dead Pi — which takes the dashboard, Tailscale, and all
remote access with it.

**4. Indeterminate state on boot and reboot.**
GPIO pins default to floating inputs at power-on and during reboot. This
project has a reboot poller, so reboots happen. A floating pin next to a
threshold-voltage input is an unpredictable channel state.

### If you want to use GPIO anyway, isolate it

The correct shape keeps the Pi on the logic side of a barrier:

```
Pi GPIO (3.3V) → optocoupler or relay module → switched 12V → Control Input
```

The GPIO drives only the LED side of an opto or a relay coil. The input sees a
clean 12V, and no 12V path ever reaches the Pi. A relay HAT or an opto board
is a few dollars and removes objections 1 through 3 outright.

### Why the Shelly is still the better fit here

A GPIO relay does have one genuine advantage: it works with WiFi down, whereas
the Shelly does not.

Against that, the spare Shelly is **already bought, already isolated by
design** (dry contact rated for vehicle loads), already addressable by
`shelly.py`, and already rendered on the dashboard. It needs no new backend
code, no new failure modes, and no wire run from the Pi to the PowerSwitch.

Given that Control 1 is on ignition — a path that does not involve the Pi at
all — losing Shelly control when WiFi is down is not a serious exposure. The
critical function already runs on hardware.

Use GPIO if the wire run is short and you specifically want independence from
WiFi. Otherwise use the Shelly. Either way, **do not wire GPIO straight to the
control input.**

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

- **Confirm the under-seat signal fuse rating and downsize it if it is above
  ~5A.** Cheapest safety improvement available here.
- Label the signal busbar so it is not mistaken for a power distribution point.
- Is the input level-triggered or edge-triggered? (bench test 5)
- Does an active input override app/BLE control? **Answered 2026-08-27: no.**
  Confirmed on Control 1 with the ignition active — the channel still switched
  off from the app.
- Is activation voltage-high on this unit, or is any variant ground-switching?
  Confirm against the Garmin manual for this specific model before wiring.
- Is the dome light circuit voltage-switched or ground-switched, and does it
  ramp? (multimeter, before any door wiring)
- Both inputs are now spoken for. Any further van-api-driven switching would
  have to share Control 2 through the diode OR — worth deciding whether that
  is desirable before it becomes necessary.
