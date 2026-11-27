# UI Patterns

**Last updated:** 2026-11-27

**Status: Built** (2026-11-13). How screens, drawers and menus are put together from the component set in `docs/DESIGN-SYSTEM.md`. When you build a screen, check here first and reuse a pattern rather than inventing one. `case-study/decisions.md` records which calls Todd made and which are still Claude's proposals.

## Naming: one key, every hook
Each component has one key, and every hook for it contains that key, so one search finds the file, the markup hook and the CSS.

| What | Key | File | Markup | CSS (only if needed) |
|---|---|---|---|---|
| Primitive | `switch-tile` | `ui/SwitchTile.tsx` | `data-vc="switch-tile"` | `.vc-switch-tile`, children `.vc-switch-tile__label`, variants `--offline` |
| Feature card | `battery-card` | `cards/BatteryCard.tsx` | `data-vc="battery-card"` | `.vc-battery-card` |
| Drawer | `drawer-wifi` | `drawers/WifiDrawer.tsx` | `data-vc="drawer-wifi"` | |
| Part inside one | `drawer-wifi-scan` | `drawers/WifiScan.tsx` | `data-vc="drawer-wifi-scan"` | |

- Utilities stay in the markup. No `.vc-*` CSS has been needed so far; it exists only for things utilities can't say.
- No abbreviations: `switch-tile`, not `sw-tile`.

## Page layout
Mobile first, one column, `max-w-2xl` centered. From `md` the page widens to `max-w-4xl` and pairs cards into two columns.

1. **Header:** van name, a Demo badge in demo mode, the time and current mode name under it, then two round buttons: Mode and System (gear).
2. **Battery** (paired with the actions card from `md`): SOC as `display` with a lime circle (the live indicator) and a round History button, a `Progress`, then three `Stat` chips for volts, watts and temp. The chips tint when out of range (below). Offline dims the card and shows "Offline · last seen".
3. **Actions card:** a 2x2 grid of `TileButton`s (WiFi, Camera, Backup, Power) beside a `StatusList` of the WiFi uplink, the hotspot and the Ethernet rescue port.
4. **Circuits:** `SwitchTile`s from `/shelly`. Two across on phones, four from `md`.
5. **Charging** and **Devices** (side by side from `md`): Solar and Shore rows, then EcoFlow, Starlink and fridge rows. `EcoflowCard`, `StarlinkCard` and `FridgeCard` each render one `DeviceRow` and stay three components; the dashboard groups them in one card.
6. **Camera:** the latest frame (16:9), the capture time, and three round buttons: photo history, take a photo, camera on/off.

Keep the existing order of importance: what is on, what is charging, what's cold, what I can see. Changing it is a design decision, not a cleanup.

## Header and the action tiles
| Where | Control | Opens |
|---|---|---|
| Header | Mode `IconButton` (sliders icon, label "Mode: Camp. Change mode") | Mode drawer |
| Header | System `IconButton` (gear) | System drawer |
| Action tile | WiFi (lime when connected, orange when not) | WiFi drawer |
| Action tile | Camera (lime when on, orange and labelled "Camera off" when off) | Camera drawer |
| Action tile | Backup | Backup drawer |
| Action tile | Power | Power dialog |
| Battery card | History (round, clock icon) | History drawer, SOC tab |
| Camera card | Photo history (round, images icon) | History drawer, Photos tab |

Tile state is a border and tint plus a word in the label, never color alone. The icon-only round buttons have an `aria-label`.

## Stat chips tint when out of range
`Stat` has tones `neutral` (blue outline), `good` (lime), `warn` (amber) and `bad` (red), and a `hint` word beside the value. Thresholds sit at the top of `BatteryCard.tsx`. They are starting points for a 12V LiFePO4 pack, not manufacturer limits, and are Claude's guesses until Todd confirms them: voltage under 12.8V warn and under 12.0V bad ("low"), over 14.6V bad ("high"); watts green when charging, 150W or more drawn warn ("high"), 300W or more bad ("heavy"); temp 45°C or more warn ("hot"), 55°C or more bad, 0°C or less warn ("cold").

## Drawers: one per concern
**One drawer per concern, one `Drawer` component.** Only one is open at a time, and none opens another (`Dashboard.tsx` holds which).

| Drawer | Contents |
|---|---|
| WiFi | Uplink (SSID, band, signal, IP), hotspot (status, on/off with a confirm dialog), scan and connect |
| Camera | Camera on/off, take a photo now |
| Mode | Storage / Camp / Trail / In Town, and what the current mode does |
| Backup | Database size, readings, nightly job, unsent files, download |
| System | Pi health (temp, load, memory, disk, uptime, throttle), release or reconnect the BMS |
| History | Tabs: SOC 24h, Solar, Photos. Photos is the last 24 hours, and a tap opens the full-size frame in a dialog |

Rules:
- **Drawer anatomy:** title, close button, then `Section`s of `KeyValue` rows and `Button`s. Destructive and rare actions go in the footer.
- **Phones:** a full-height sheet. **From `md`:** a right-hand panel, 24rem wide.
- **Behavior (native `<dialog>`):** focus moves in on open and back to the trigger on close, Esc closes, tapping the backdrop closes, the page behind doesn't scroll.
- **Content loads on open**, not at page load, so the dashboard's 5s poll stays light. Drawers mount their children only while open.

## Power: two taps to Restart API
**Constraint:** Restart API is the only way to unstick a frozen card when Todd isn't at a terminal (`docs/CLAUDE.md` → Recovery). Power stays within two taps of the dashboard, renders with no data fetched, and keeps working when a poll is hung. Refusing a second restart inside 2 minutes (BMS lockout protection) stays in the backend and the dialog says why.

The Power tile opens one `Dialog` with the three actions stacked, the primary at the top:
- **Restart API** (lime): runs on the second tap with no confirm. The dialog explains it, including not to repeat it quickly. The Pi stays on.
- **Reboot…** (outline): confirms first, saying the dashboard will be unreachable for about a minute.
- **Shut down…** (`danger`): confirms first, saying **the Pi won't come back until someone powers it on in the van**.
- While it works the dialog is `busy` (spinner, ignores Esc and the backdrop). Restart API and Shut down leave a Close button, because the Pi is still up or already off.

## Offline and last-known value
Confirmed correct in `docs/CLAUDE.md`, kept in the new design. When a source drops: the card keeps its last reading, dims it, and says "Offline · last seen 4 min ago". Device rows go to a dashed border with "Offline". Circuit tiles go dashed with "Unreachable". Never blank a card on one missed poll.

## Relay tiles
`SwitchTile` states: **on** (lime fill, "ON"), **off** (white, "OFF"), **offline** (dashed, "Unreachable", or "Offline" below 1024px because the longer word does not fit; the whole tile is the "check again" button), **checking** ("Checking…" with a spinning mark, taps ignored, until the unit answers or three tries fail), **busy** (taps ignored). A tap toggles and waits for the backend's confirmed state before showing the new one: the UI never claims on until the Shelly said so. The mock's "Door Lights" tile is a placeholder and is not built.

## Check again
An offline source that can be asked again is one big button: the tile or row itself, with a `RetryGlyph` as the sign. Never put a small button inside it. A tap tries up to three times, 2s apart (`RECHECK_TRIES` in `store/van.ts`), showing "Checking…", then a toast says whether it came back. A relay tile that comes back ignores taps for 1s (`SETTLE_MS`), because the same spot now switches a real load. The battery is the exception: it keeps a separate "Retry now" button and tries once, because retrying the BMS too fast can lock it up.

## Feedback
- **Toast** for the result of a quick action ("Found 4 networks", "Hotspot off"). Dark, red for errors, never green, because it floats over the lime tiles. It is a popover so it sits above open drawers; while a modal is open the page behind it is inert, so a toast over a drawer can't be tapped (it times out on its own).
- **`Dialog`** for anything that can lose connectivity or power.
- **No `alert()`**, no silent failures. A rejected relay command shows an error tile state and a toast.

## Accessibility checklist (applies to every pattern)
- Icon-only controls have `aria-label`. Decorative icons are `aria-hidden`. The live circle is `role="img"` with a name.
- State is text or an icon as well as color.
- Contrast: text 4.5:1, icons and borders 3:1 (token table in `docs/DESIGN-SYSTEM.md`).
- Visible focus on everything, in a logical order. Drawers trap and restore focus.
- Dialog labels point at their own title with a unique id (`useId`).
- Inputs are 16px. Tap targets are 44px.
- Respect `prefers-reduced-motion`.

## Not built
- The Figma's camera light and options buttons: there is no API for either.
- A per-relay overflow menu (timers), from `docs/FUTURE-FEATURES.md`.
- Dark theme.

## Open questions for Todd
1. Are the Stat chip thresholds right for the Power Queen pack? Check them against its datasheet and real draws.
2. The live indicator is a lone lime circle: its meaning is in the accessible name and tooltip, and every other state is spelled out in words. Fine, or add the word "Live" beside it?
