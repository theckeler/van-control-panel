# Design System

**Last updated:** 2026-11-27

**Status: Built** (2026-11-13). Tokens and the component set are in `frontend/`, and the screens use them. Todd directed most of the visual calls during the build; `case-study/decisions.md` records which are agreed and which are still Claude's proposals. The Figma file ([Van Control Panel, Dashboard UI](https://www.figma.com/design/793FjJIPcg092uFJuGnVe6/Van-Control-Panel-%E2%80%94-Dashboard-UI)) is a guide for how buttons and the UI look, not a spec. Screens and drawers are in `docs/UI-PATTERNS.md`.

## Principles
1. **One source for every value.** Colors, type and radius are defined once (`tailwind.config.ts`, CSS variables in `index.css`). Components use semantic tokens, never raw hex or raw palette classes.
2. **Color is never the only signal.** Every green or orange state also has text or an icon, because lime on white fails contrast (below).
3. **Lime means "on".** Saturated fills are for things that are on (an ON circuit tile, a lit action tile, the live circle). Everything else is white with a border, so state stands out. This came from Todd's feedback that large green blocks hurt readability.
4. **Standard set first.** A screen uses a component from `ui/` or adds one to it. No one-off buttons or hand-built dialogs.
5. **Phone first.** The dashboard is used one-handed on a phone in a moving or parked van: 44px tap targets, one primary action, nothing important behind hover.
6. **Offline is a state, not an error.** Cards keep the last known value, dimmed, with its age.

## Palette note: Figma is Tailwind v4, this app is Tailwind v3
The Figma variables are Tailwind v4 colors (lime-500 is `#7CCF00`). This app ships Tailwind 3.4, where lime-500 is a different green (`#84CC16`). So **tokens are defined as explicit hex in the config**, not borrowed from Tailwind's built-in scale, and they match the Figma values.

## Color tokens
Each is a CSS variable holding an `r g b` triplet (`index.css`), so Tailwind opacity works (`bg-on/20`) and a dark set can be added later. Contrast ratios computed 2026-11-12 (WCAG relative luminance). Text needs 4.5:1 (3:1 for 24px bold or 19px+ bold), icons and borders need 3:1.

### Surfaces and text
| Token | Hex | Source | Use | Contrast |
|---|---|---|---|---|
| `page` | `#F3F4F6` | gray-100 | App background | |
| `surface` | `#FFFFFF` | white | Cards, drawers, dialogs | |
| `line` | `#E5E7EB` | gray-200 | Borders, dividers | |
| `ink` | `#101828` | gray-900 | Primary text, text on colored fills | 17.8 on surface, 16.1 on page |
| `ink-muted` | `#4A5565` | gray-600 | Secondary text, labels | 7.6 on surface |
| `ink-subtle` | `#6A7282` | gray-500 | Tertiary text, placeholders, **on `surface` only** | 4.8 on surface, 4.4 on page (fails) |
| `disabled` | `#99A1AF` | gray-400 | Disabled text and icons (exempt from the ratio) | 2.6 on surface |
| `control` | `#525252` | neutral-600 | Icon button fill, white icon | 7.8 |

### State fills
| Token | Hex | Source | Meaning | Text on it |
|---|---|---|---|---|
| `on` | `#7CCF00` | lime-500 | On, charging, connected, healthy | `ink`: 9.1. **White fails (1.95)** |
| `off` | `#FF6900` | orange-500 | Off, camera off, needs attention | `ink`: 6.2. **White fails (2.9)** |
| `info` | `#00BCFF` | sky-400 | Neutral stat chip outline | |
| `warn` | `#FFB900` | amber-400 | Caution (low SOC bar, hot, heavy draw) | `ink`: 10.3 |
| `danger` | `#E7000B` | red-600 | Destructive actions, errors | white: 4.8 |

### State text (for colored words on a light surface)
Lime-500 text on white is 1.95:1, so green text **cannot** use the fill color. The pre-redo app had the same problem with lime-600 (3.06:1) on small labels.

| Token | Hex | Source | On `surface` |
|---|---|---|---|
| `on-text` | `#497D00` | lime-700 | 5.0 |
| `off-text` | `#C53C00` | orange-700 | 5.2 |
| `warn-text` | `#B75000` | amber-700 | 5.1 |
| `danger-text` | `#C10007` | red-700 | 6.4 |
| `info-text` | `#0069A8` | sky-700 | 5.9 (also the focus ring) |

### Open
- **Mode chip color.** The Figma Mode chip is fuchsia (`#E12AFB`). Not built: the Mode control is now a round dark icon button like the rest, so the question is moot unless it comes back as a chip.
- **Dark theme.** The Figma is light only and the toggle is disabled. Tokens are CSS variables so a dark set can be added, but none is designed. Light only.

## Type
System font stack, no web fonts. Numbers use `tabular-nums` so values don't jitter on each poll. Nothing below 12px. Names are `text-*` classes from `tailwind.config.ts`.

| Token | Size / weight | Use |
|---|---|---|
| `display` | 36 / 700 | Battery percentage |
| `title` | 20 / 700 | Van name, drawer and dialog title |
| `value` | 18 / 600 | Circuit tile state ("ON") |
| `body` | 14 / 400 | Default. Info-tile values and stat chips use it semibold; so do the battery's "Low" and "Very low" |
| `label` | 12 / 600, tracked (add `uppercase`) | Card and section labels |
| `caption` | 12 / 400 | Timestamps, info-tile names (semibold) and details, captions under icons |
| `input` | 16 / 400 | Every input, at every width |

## Space, radius, elevation
- **Spacing:** Tailwind's 4px scale. Page gutter 16px on phones, 24px from `md`. Card padding 16px. Gap between cards 12px. Content is `max-w-2xl`, and `max-w-4xl` from `md`.
- **Radius:** Tailwind's own `rounded` (4px) for cards, tiles, chips, rows, inputs, drawers and dialogs. Todd found the first attempt (6px and 12px) too harsh. Pills and circles (`rounded-full`) are unchanged.
- **Elevation:** cards are flat with a `line` border. Drawers, dialogs and toasts get one shadow (`shadow-overlay`). No other shadows.
- **Safe areas:** `--safe-top`, `--safe-right`, `--safe-bottom` and `--safe-left` (`index.css`) are the room iOS keeps for the status bar, notch and home bar, and zero elsewhere. Anything that touches a screen edge adds them (`docs/UI-PATTERNS.md`).
- **Tap targets:** 44px minimum. Icon buttons are 44px (the Figma's are 38px; same look).
- **Focus:** a 3px outline in `info-text` on every interactive element, set globally in `index.css`, never removed.
- **Motion:** `prefers-reduced-motion` collapses animation and transitions globally.

## Component set
All live in `frontend/src/components/ui/`. Each has one key used in the file name, `data-vc` and any CSS (`docs/UI-PATTERNS.md`).

| Key | Component | What it is | States |
|---|---|---|---|
| `button` | `Button` | Text button. Variants `solid` (lime), `outline`, `ghost`, `danger`. Sizes `sm`, `md` (both keep 44px). | default, hover, focus, disabled, busy |
| `icon-button` | `IconButton` | 44px round icon button. `aria-label` required. Tones `control`, `on`, `off`. `busy` spins the icon and ignores taps. | default, disabled, busy |
| `icon-circle` | `IconCircle` | The IconButton look without the button: a 44px circle that reports a state (the battery's live circle). `role="img"`. | tones `control`, `on`, `off` |
| `tile-button` | `TileButton` | A shortcut tile: icon centered over its label, bordered. Tones `neutral`, `on` (lime border and tint), `off` (orange). Used for the 2x2 action grid. | neutral, on, off |
| `switch-tile` | `SwitchTile` | A relay: name, big ON/OFF, dot. Tap toggles. ON is the one solid lime fill. Offline with `onRecheck`, the whole tile is a "check again" button that shows "Checking…" while it works; without it, a plain `div`. A tile that has just come back ignores taps for 1s, so a late "check again" can't switch the relay. | on, off, offline (dashed), checking, busy |
| `stat` | `Stat` | Label and value. `chip` (centered, outlined in `info`) or `row`. Tones `neutral`, `good`, `warn`, `bad` tint the chip; a `hint` word ("low", "hot") says why. | neutral, good, warn, bad, offline |
| `info-tile` | `InfoTile` | One link, source or device: icon, name, reading, detail, centered and top-aligned so icons line up across a row. White, with a lime 1px border when on, plain when idle, an amber tint for a warning, dashed when offline. For the network links, solar, shore, EcoFlow, Starlink and the fridge. With `onClick` the tile is a button that opens something; with `onRecheck`, an offline tile is one button that asks the source again and shows "Checking…" while it works. | on, off, warn, offline, checking |
| `retry-glyph` | `RetryGlyph` | The 32px translucent disc with a refresh icon on an offline tile (top right on an info tile). Decoration only: the tile around it is the button. | idle, busy (spins) |
| `card` | `Card` | Container with an optional title and header action, and an offline treatment (dim plus "Offline · last seen"). | default, offline |
| `progress` | `Progress` | Bar for SOC and EcoFlow, with an optional text value. Turns `warn` under 20%. | default, low, offline |
| `badge` | `Badge` | Small outlined pill: Demo, Released, Connected. Tones `neutral`, `on`, `off`, `warn`. | |
| `status-dot` | `StatusDot` | 8px dot. Never used without text beside it. | on, off, warn, unknown, ink |
| `key-value` | `KeyValue` | Label and value list rows. `warn` and `bad` also bold the value. | default, warn, bad |
| `section` | `Section` | Titled group inside a drawer. | |
| `text-field` | `TextField` | Labelled input, 16px. Used for the WiFi password. | |
| `drawer` | `Drawer` | Native `<dialog>`. Right-hand panel (24rem) from `md`, full-height sheet on phones. Title, close button, scrolling body, optional footer. Focus trap, Esc, backdrop, scroll lock. Children mount only while open. | open, closed |
| `dialog` | `Dialog` | Native `<dialog>` for confirm, progress and result. Fixed layout, actions stacked on phones. While `busy` it ignores Esc and the backdrop. | confirm, busy, result |
| `toast` | `Toaster` (`layout/`) | Quick-action results. Dark, red for errors, with an icon. A popover, so it sits above the native `<dialog>` drawers and dialogs. | info, success, error |
| `spinner` | `Spinner` | Loading ring in token colors. | |
| `icon` | `Icon` | One component, one SVG set. Decorative (`aria-hidden`) by default. | |

**Not built:** a `Menu` (overflow menu per relay, for timers) and `Tabs` (the History drawer's tabs are two or three `Button`s with `aria-pressed`).

## Rules for using the set
- A component takes tokens through props like `tone="on"`, never a color class.
- `className` is for layout (margin, grid placement), never for color or size overrides. If a call site needs a color override, the set is missing a variant: add it.
- Feature cards (`BatteryCard`, `FridgeCard` and so on) compose these and stay separate components.
- New component or variant: add it to `ui/`, add a row here and in `docs/UI-PATTERNS.md`, add a line to `decisions.md`, and add it to the dev gallery.
- Every component has each of its states in the dev gallery (`/components`, dev server only), so it can be checked without the van.
