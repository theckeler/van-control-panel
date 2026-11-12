# Baseline: before the UI redo

**Last updated:** 2026-11-12

Frozen on 2026-11-12, before any design work. **Never overwrite this file.** Add a new dated file for later comparisons. Screenshots are in `assets/before-2026-11-12/` (demo mode, 375px and 1280px, 2x). Taken at commit `6deaf92`.

## Screenshots
| File | What |
|---|---|
| `dashboard-375.png`, `dashboard-1280.png` | Full dashboard |
| `settings-drawer-375.png`, `settings-drawer-1280.png` | Settings drawer (Pi health, network, backup, options) |
| `network-drawer-375.png`, `network-drawer-1280.png` | WiFi settings, opened from Settings |
| `wifi-card-drawer-375.png`, `wifi-card-drawer-1280.png` | Same drawer, opened from the WiFi card |
| `camera-history-drawer-375.png`, `camera-history-drawer-1280.png` | Camera history |
| `power-modal-375.png`, `power-modal-1280.png` | Power options |

Missing: the WiFi scan card, the confirm and progress modals, and offline states for every card. Add them to a later baseline if a before/after for them matters.

## Numbers
| Measure | Value | How |
|---|---|---|
| Production JS | 604 KB (178 KB gzip), one chunk | `npm run build`; Vite warns the chunk is over 500 KB |
| Production CSS | 19.9 KB (4.7 KB gzip) | same |
| Component files | 32 `.tsx` under `src/components/` | `find` |
| Frontend source | 4,764 lines of TS and TSX under `src/` | `cat \| wc -l` |
| `text-black` or `text-gray-*` uses | 93 | `grep` |
| Raw palette classes (`bg-`, `border-`, `text-` with lime, amber, red, sky, zinc, gray, green, orange, blue) | 110 | `grep` |
| Arbitrary pixel text sizes (`text-[11px]`) | 12 | `grep` |
| Hand-built `role="dialog"` elements | 6 | `grep` |
| Raw `<button>` outside `ui/` | 8 | `grep` |
| Inline `<svg>` icons | 9, no shared icon component | `grep` |
| `aria-label` uses | 13 | `grep` |
| `npm run lint` | **fails**: ESLint is not a dependency and there is no config | ran it |
| Tests | none, frontend or backend | `find` |

## What's there today (facts, not opinions)
- One Settings button in the header opens a right-hand drawer holding Pi health, network, backup, four option buttons and the history charts. Power options then opens a modal on top of it.
- Three drawers (`SettingsDrawer`, `NetworkDetailsDrawer`, `CameraHistoryDrawer`) and three modals (`ConfirmModal`, `PowerModal`, `ProgressModal`), each hand-built with its own backdrop and focus code. `Modal.tsx` hardcodes `aria-labelledby="progress-modal-title"`.
- Light only, on purpose: an inline script in `index.html` sets `data-theme="light"` on load, and the toggle logic in `useTheme.ts` is dead code. The CSS variables still default to a dark set underneath, and text is hardcoded to `gray-800`, `gray-900` and `black` instead of using them.
- `Button` has three variants but call sites override colors with `className` (the amber Power options button, for example).
- `ModeSelector` exists but is not rendered in `Dashboard.tsx`.

## Not captured, and why
- **Lighthouse and real-device numbers.** The app runs on a Pi on a phone over Tailscale. Measuring here would not match it. Take them on the real Pi before the PR if the comparison matters.
- **Live data.** Screenshots use demo data (`api/mock.ts`), not the van.
