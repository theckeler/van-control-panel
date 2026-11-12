# Design System

**Last updated:** 2026-11-12

**Status: Proposed** (Claude, 2026-11-12), for Todd to shape. Tokens and the component set for the UI redo. The Figma file ([Van Control Panel, Dashboard UI](https://www.figma.com/design/793FjJIPcg092uFJuGnVe6/Van-Control-Panel-%E2%80%94-Dashboard-UI)) is a guide for how buttons and the UI look, not a spec (`case-study/decisions.md`, 2026-11-12). Screens and drawers are in `docs/UI-PATTERNS.md`.

## Principles
1. **One source for every value.** Colors, type, radius and spacing are defined once (`tailwind.config.ts`, CSS variables in `index.css`). Components use semantic tokens, never raw hex or raw palette classes.
2. **Color is never the only signal.** Every green or orange state also has text or an icon, because lime on white fails contrast (below).
3. **Standard set first.** A screen uses a component from `ui/` or adds one to it. No one-off buttons or hand-built dialogs.
4. **Phone first.** The dashboard is used one-handed on a phone in a moving or parked van: 44px tap targets, one primary action, nothing important behind hover.
5. **Offline is a state, not an error.** Cards keep the last known value, dimmed, with its age.

## Palette note: Figma is Tailwind v4, this app is Tailwind v3
The Figma variables are Tailwind v4 colors (lime-500 is `#7CCF00`). This app ships Tailwind 3.4, where lime-500 is a different green (`#84CC16`). So **tokens are defined as explicit hex in the config**, not borrowed from Tailwind's built-in scale, and they match the Figma values.

## Color tokens
Contrast ratios computed 2026-11-12 (WCAG relative luminance). Text needs 4.5:1 (3:1 for 24px bold or 19px+ bold), icons and borders need 3:1.

### Surfaces and text
| Token | Hex | Source | Use | Contrast |
|---|---|---|---|---|
| `page` | `#F3F4F6` | gray-100 | App background | |
| `surface` | `#FFFFFF` | white | Cards, drawers, dialogs | |
| `line` | `#E5E7EB` | gray-200 | Borders, dividers | |
| `ink` | `#101828` | gray-900 | Primary text, text on colored fills | 17.8 on surface, 16.1 on page |
| `ink-muted` | `#4A5565` | gray-600 | Secondary text, labels | 7.6 on surface |
| `ink-subtle` | `#6A7282` | gray-500 | Tertiary text, **on `surface` only** | 4.8 on surface, 4.4 on page (fails) |
| `disabled` | `#99A1AF` | gray-400 | Disabled text and icons (exempt from the ratio) | 2.6 on surface |
| `control` | `#525252` | neutral-600 | Icon button fill, white icon | 7.8 |

### State fills (always paired with `ink` text)
| Token | Hex | Source | Meaning | Text on it |
|---|---|---|---|---|
| `on` | `#7CCF00` | lime-500 | On, charging, connected, healthy | `ink`: 9.1. **White fails (1.95)** |
| `off` | `#FF6900` | orange-500 | Off, camera off, needs attention | `ink`: 6.2. **White fails (2.9)** |
| `info` | `#00BCFF` | sky-400 | Neutral stat chips | `ink`: 8.1 |
| `warn` | `#FFB900` | amber-400 | Caution (low SOC, hot Pi) | `ink`: 10.3 |
| `danger` | `#E7000B` | red-600 | Destructive actions (reboot, shutdown) | white: 4.8 |

### State text (for colored words on a light surface)
Lime-500 text on white is 1.95:1, so green text **cannot** use the fill color. The current app has the same problem with lime-600 (3.06:1) on small labels.

| Token | Hex | Source | On `surface` |
|---|---|---|---|
| `on-text` | `#497D00` | lime-700 | 5.0 |
| `off-text` | `#C53C00` | orange-700 | 5.2 |
| `warn-text` | `#B75000` | amber-700 | 5.1 |
| `danger-text` | `#C10007` | red-700 | 6.4 |
| `info-text` | `#0069A8` | sky-700 | 5.9 |

### Open
- `mode` `#E12AFB` (fuchsia-500, `ink` text 5.0) appears only on the Figma Mode chip. Keep as a one-off accent or fold into `info`? Todd to choose.
- **Dark theme.** The Figma is light only and the current toggle is disabled. Tokens are CSS variables so a dark set can be added, but none is designed. Light only for now.

## Type
System font stack, no web fonts (`system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`). Numbers use `tabular-nums` so values don't jitter on each poll.

| Token | Size / weight | Use |
|---|---|---|
| `display` | 36 / 700 | Battery percentage |
| `title` | 20 / 700 | Van name, drawer title |
| `value` | 18 / 600 | Card headline values |
| `body` | 14 / 400 | Default |
| `label` | 12 / 600, uppercase, tracked | Card and section labels |
| `caption` | 12 / 400 | Timestamps, "last seen" |
| `input` | 16 / 400 | Every input, select, textarea, at every width |

Retire arbitrary sizes (`text-[11px]`, 12 uses today). Nothing below 12px.

## Space, radius, elevation
- **Spacing:** 4px base. Page gutter 16px on phones, 24px from `md`. Card padding 16px. Gap between cards 12px. Today the spacing comes from a store (`spacing`, `gap` in `store/settings.ts`); the new set uses fixed tokens.
- **Radius:** `sm` 6px (tiles, chips), `md` 12px (cards, drawers), `full` (icon buttons, dots). Match the mock by eye; Todd to confirm.
- **Elevation:** cards are flat with a `line` border. Drawers and dialogs get one shadow. No other shadows.
- **Tap targets:** 44px minimum. The Figma icon buttons are 38px; the build uses 44px and keeps the look (Todd to confirm).
- **Focus:** a 3px outline in `info-text` on every interactive element, never removed.

## Component set
All live in `frontend/src/components/ui/`. Each has one key used in the file name, `data-vc` and any CSS (`docs/UI-PATTERNS.md`). "Replaces" lists what exists today.

| Key | Component | What it is | States | Replaces / Figma |
|---|---|---|---|---|
| `button` | `Button` | Text button. Variants `solid`, `outline`, `ghost`, `danger`. Sizes `sm`, `md`. | default, hover, focus, disabled, busy | `Button`, 8 raw `<button>`s |
| `icon-button` | `IconButton` | 44px round icon button. `aria-label` required. Tones `control`, `on`, `off`. | default, active, disabled, with badge | Figma "Button w/ Icon" (Options, Camera on/off, WiFi, Mode, Power, Backup, Photos, Light on/off) |
| `switch-tile` | `SwitchTile` | A relay: name, big ON/OFF, state dot. Tap toggles. | on, off, offline, busy | `ShellyCard` tiles, Figma "Switch Button" |
| `stat` | `Stat` | Label and value, as a chip or a row. | default, offline (dimmed, last seen) | Figma "Stat", battery chips |
| `device-row` | `DeviceRow` | Dot, name, value and detail on the right. For charge sources, EcoFlow, Starlink, CFX5. | default, offline | Figma "Source", "EcoFlow", "Starlink", "CFX5", `ChargeSourcesCard` rows |
| `card` | `Card` | Container with an optional title and header action, and an offline treatment (dim plus "last seen"). | default, offline | `Panel` |
| `progress` | `Progress` | Bar for SOC and EcoFlow, with a text value beside it. | default, low, offline | inline bars in `BatteryCard`, `EcoflowCard` |
| `badge` | `Badge` | Small pill: network, DEMO, mode. | tones `neutral`, `on`, `off`, `warn` | `WifiBadge`, `EthBadge`, the demo tag |
| `status-dot` | `StatusDot` | 8px dot. Never used without text beside it. | on, off, warn, unknown | `StatusDot` |
| `key-value` | `KeyValue` | Label and value list rows, with tone. | default, warn, bad | `Row`, `Label` |
| `drawer` | `Drawer` | Native `<dialog>`. Right-hand panel from `md`, full-height sheet on phones. Title, close button, scrolling body, optional footer. Focus trap, Esc, backdrop. | open, closed | `SettingsDrawer`, `NetworkDetailsDrawer`, `CameraHistoryDrawer`, `BackDrop` |
| `dialog` | `Dialog` | Native `<dialog>` for confirm, progress and result, with a fixed button layout. Destructive confirms use `danger`. | confirm, busy, success, failed | `Modal`, `ConfirmModal`, `ProgressModal`, `PowerModal` |
| `toast` | `Toast` | Existing toaster, restyled. | info, success, error | `Toaster` |
| `spinner` | `Spinner` | Existing. | | `Spinner` |
| `icon` | `Icon` | One component, one SVG set. Decorative icons are `aria-hidden`. | | 9 inline `<svg>`s |
| `section` | `Section` | Titled group inside a drawer. | | the repeated `<section>` plus `Label as="h3"` |

**Later, not in the first pass:** `Menu` (overflow menu per relay, for timers and per-relay actions, from `docs/FUTURE-FEATURES.md`), `Tabs` (history ranges), `Select` and `TextField` (WiFi connect form, 16px).

## Rules for using the set
- A component takes tokens through props like `tone="on"`, never a color class.
- `className` is for layout (margin, grid placement), never for color or size overrides. If a call site needs a color override, the set is missing a variant: add it.
- Feature cards (`BatteryCard`, `FridgeCard` and so on) compose these and stay separate components.
- New component or variant: add it to `ui/`, add a row here and in `docs/UI-PATTERNS.md`, and add a line to `decisions.md`.
- Every component has a demo-mode state for each of its states, so it can be checked without the van.
