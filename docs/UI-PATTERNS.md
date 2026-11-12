# UI Patterns

**Last updated:** 2026-11-12

**Status: Proposed** (Claude, 2026-11-12), for Todd to shape. How screens, drawers and menus are put together from the component set in `docs/DESIGN-SYSTEM.md`. When you build a screen, check here first and reuse a pattern rather than inventing one.

## Naming: one key, every hook
Each component has one key, and every hook for it contains that key, so one search finds the file, the markup hook and the CSS.

| What | Key | File | Markup | CSS (only if needed) |
|---|---|---|---|---|
| Primitive | `switch-tile` | `ui/SwitchTile.tsx` | `data-vc="switch-tile"` | `.vc-switch-tile`, children `.vc-switch-tile__label`, variants `--offline` |
| Feature card | `battery-card` | `cards/BatteryCard.tsx` | `data-vc="battery-card"` | `.vc-battery-card` |
| Drawer | `drawer-wifi` | `drawers/WifiDrawer.tsx` | `data-vc="drawer-wifi"` | |
| Part inside one | `drawer-wifi-scan` | | `data-vc="drawer-wifi-scan"` | |

- Utilities stay in the markup. `.vc-*` CSS exists only for things utilities can't say.
- No abbreviations: `switch-tile`, not `sw-tile`.

## Page layout
Mobile first, one column, `max-w-2xl` centered. From `md` two columns where it helps.

1. **Header:** van name, clock, network badges, then the action row.
2. **Battery:** the hero. SOC as `display`, a `Progress`, three `Stat` chips (volts, watts, temp). Offline state dims it and shows the last reading with its age.
3. **Switches:** a grid of `SwitchTile`s from `/shelly`. Two across on phones, three from `md`.
4. **Sources and devices:** charge sources, then EcoFlow, Starlink and the fridge, each a `DeviceRow` in its own card (three separate components, even where laid out side by side).
5. **Camera:** the latest frame, a timestamp and the camera controls.

Keep the existing order of importance for now: what is on, what is charging, what's cold, what I can see. Changing it is a design decision, not a cleanup.

## Header and the action row
The mock puts the Mode chip and a gear in the header, and repeats Mode, WiFi, Camera, Backup and Power as a row of icon buttons. Proposed, to remove the duplication:

| Where | Control | Opens |
|---|---|---|
| Header | Mode `Badge` (current mode) | Mode drawer |
| Header | Gear `IconButton` | System drawer |
| Action row | WiFi `IconButton` (green when connected, orange when not) | WiFi drawer |
| Action row | Camera `IconButton` (orange when the camera is off) | Camera drawer |
| Action row | Backup `IconButton` | Backup drawer |
| Action row | Power `IconButton` | Power flow (see below) |

Each icon button has an `aria-label` and a text label under it on phones if there's room. Color alone never carries the state.

## Drawers: one per concern
Today everything is in one Settings drawer, with the history charts, and the Power modal opens on top of it. The new rule: **one drawer per concern, one `Drawer` component.** Contents come from what exists now.

| Drawer | Contents | From today |
|---|---|---|
| WiFi | Current network, signal, IP, hotspot on/off, scan and connect | `WifiCard`, `NetworkDetailsDrawer`, `WifiScanCard`, Settings "WiFi settings" |
| Camera | Capture interval, history grid, download | `CameraHistoryDrawer`, `Cameras` controls |
| Mode | Mode picker, with what each mode changes | `ModeSelector` (built but not rendered today) |
| Backup | Database size, readings, nightly job, unsent files, download | Settings "Backup" rows, "Download database" |
| System | Pi health (temp, load, memory, disk, uptime, throttle), release or reconnect BMS | Settings "Pi Health", "Release BMS" |
| History | SOC 24h and solar 30d charts | `HistoryCard`, now buried in Settings |

Rules:
- **No drawer opens another drawer.** Navigation is back to the dashboard.
- **Drawer anatomy:** title, close button, then `Section`s of `KeyValue` rows and `Button`s. Destructive and rare actions sit at the bottom.
- **Phones:** a full-height sheet. **From `md`:** a right-hand panel, 24rem wide.
- **Behavior (native `<dialog>`):** focus moves in on open and back to the trigger on close, Esc closes, tapping the backdrop closes, the page behind doesn't scroll.
- **Content loads on open**, not at page load, so the dashboard's 5s poll stays light.

## Power: confirm, then progress
**Constraint:** Restart API is the only way to unstick a frozen card when Todd isn't at a terminal (`docs/CLAUDE.md` → Recovery). Power stays within two taps of the dashboard, renders with no data fetched, and keeps working when a poll is hung. Refusing a second restart inside 2 minutes (BMS lockout protection) stays in the backend and the UI says why.

`PowerModal` is the biggest hand-built dialog (297 lines). Proposed: the Power button opens a small `Drawer` with three actions (Restart API, Reboot, Shut down). Each opens a `Dialog` to confirm, then the same `Dialog` shows progress and the result.

- Restart API: `outline`, since the Pi stays on.
- Reboot: `outline`, with a confirm that says the dashboard will be unreachable for about a minute.
- Shut down: `danger`, with a confirm that says **the Pi won't come back until someone powers it on in the van**.
- Todd to settle: Power as a `Drawer` or as a single `Dialog` with three buttons. Three buttons in a Dialog is simpler.

## Offline and last-known value
Confirmed correct in `docs/CLAUDE.md`, kept in the new design. When a source drops: the card keeps its last reading, dims it, shows "last seen 4 min ago" and a muted `StatusDot` with the word "offline". The Figma shows an offline variant for each card. Never blank a card on one missed poll.

## Relay tiles
`SwitchTile` states: **on** (`on` fill, "ON"), **off** (surface, "OFF"), **offline** (muted, "unreachable"), **busy** (spinner, taps ignored). A tap toggles and waits for the backend's confirmed state before showing the new one: the UI never claims on until the Shelly said so. The mock's "Door Lights" tile is a placeholder and is not built.

## Feedback
- **Toast** for the result of a quick action ("Garage on", "Hotspot off"). Errors say what failed and what to try.
- **`Dialog`** for anything that can lose connectivity or power.
- **No `alert()`**, no silent failures. A rejected relay command shows an error tile state and a toast.

## Accessibility checklist (applies to every pattern)
- Icon-only controls have `aria-label`. Decorative icons are `aria-hidden`.
- State is text or icon as well as color.
- Contrast: text 4.5:1, icons and borders 3:1 (token table in `docs/DESIGN-SYSTEM.md`).
- Visible focus on everything, in a logical order. Drawers trap and restore focus.
- Dialog labels point at their own title with a unique id (`Modal.tsx` hardcodes one id today).
- Inputs are 16px. Tap targets are 44px.
- Respect `prefers-reduced-motion`.

## Open questions for Todd
1. Power: a `Drawer` with three actions, or one `Dialog` with three buttons?
2. Mode chip color: keep fuchsia as a one-off, or fold it into the palette?
3. History charts: their own drawer opened from the battery card (proposed), or a card on the dashboard?
4. Camera controls: the mock shows five icons. Build capture and light now, and the rest later?
5. Icon buttons at 44px instead of the mock's 38px, same look?
6. Dark theme: skip for now (proposed)?
