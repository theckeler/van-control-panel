# Case study: Van Control Panel

**Last updated:** 2026-11-18

This project is a case study of building a real hardware dashboard with an AI workspace around it. It sits beside LiteAF and Boots Off in Todd's `Ai-Workspace-Playbook`, as a personal project rather than a client one.

## The angle
A solo developer, one Raspberry Pi in a van, hardware that has side effects, and no staging. What did the workspace (context, skills, guardrails, decision log) change about how the work went? The UI and design system redo that began 2026-11-12 is the first chapter: the app was built feature by feature, then rebuilt on a standard component set.

## Files
- `log.md`: one entry per working session, newest last.
- `decisions.md`: every decision, with options, why, and who agreed.
- `baseline.md`: the frozen "before". Never overwrite; add dated files instead.
- `assets/`: dated screenshots. `before-2026-11-12/` is the pre-redo UI and `after-2026-11-13/` the rebuilt one (demo mode, 2x). In six of the before images the Pi's hotspot name is covered with a dark bar, because the demo data used the real name at the time. The originals are still in git history.

## Publishing
**Nothing is cleared for publishing yet.** Todd decides, and records it here.

Before anything leaves this repo, remove or generalise:
- the van's location, routes and where it parks;
- Tailscale addresses, hostnames and device names;
- WiFi network names and the Pi's IP addresses;
- anything in the photos folder or camera frames (the camera looks inside the van).

Screenshots in `assets/` use demo data, so they are mostly safe by default. Check any new screenshot was taken in demo mode, **and read it**: until 2026-11-13 the demo data used the real WiFi names, so the `before-2026-11-12/` WiFi screenshots may show them.
