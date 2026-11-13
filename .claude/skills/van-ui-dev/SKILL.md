---
name: van-ui-dev
description: Conventions and a done-checklist for any change under frontend/src (components, drawers, dialogs, cards, tokens, the standard component set). Use whenever creating or editing frontend files, restyling a screen, or adding a component.
---

# Van Control Panel UI development

Read first: `CLAUDE.md`, `docs/DESIGN-SYSTEM.md`, `docs/UI-PATTERNS.md`. For hardware or API behavior, search `docs/CLAUDE.md` for the part you need instead of loading it whole.

## Layout
```
frontend/src/
  components/ui/       the standard set (Button, IconButton, IconCircle, TileButton, SwitchTile, Stat,
                       StatusList, DeviceRow, Card, Progress, Badge, StatusDot, KeyValue, Section,
                       TextField, Drawer, Dialog, Spinner, Icon)
  components/cards/    feature cards that compose ui/ (BatteryCard, FridgeCard, StarlinkCard ...)
  components/drawers/  one drawer per concern (WiFi, Camera, Mode, Backup, System, History)
  components/dialogs/  PowerDialog
  components/layout/   Header, ActionRow, Toaster, ErrorBoundary
  pages/Components.tsx every component in every state; dev server only, at /components
  store/               zustand (van.ts polls each endpoint independently)
  api/                 client.ts, and mock.ts for demo mode
  index.css            token variables      tailwind.config.ts   token names
```

Commands, from `frontend/`: `VITE_DEMO=true npm run dev` (preview, no Pi needed), `npm run build` (runs `tsc` first), `npx tsc --noEmit`.

## Conventions
- **Tokens only.** Use the semantic names from `docs/DESIGN-SYSTEM.md` (`on`, `off`, `info`, `warn`, `danger`, `ink`, `ink-muted`, `surface`, `page`, `line`, and the `*-text` variants). No hex, no raw palette classes (`lime-600`, `gray-800`), no `text-black`.
- **Green and orange are fills with `ink` text.** White on them fails contrast. Colored text on white uses `on-text` and `off-text`.
- **Standard set first.** Use a `ui/` component. If it doesn't fit, add a variant or a component to `ui/`, a row in `docs/DESIGN-SYSTEM.md`, and a line in `case-study/decisions.md`. Never a one-off button or a hand-built modal in a feature file.
- **`className` is for layout only** (margin, grid placement). A color or size override means the set is missing a variant.
- **One key per component, in every hook:** file `ui/SwitchTile.tsx`, `data-vc="switch-tile"`, CSS `.vc-switch-tile` (children `__`, variants `--`). No abbreviations.
- **Native elements:** `<dialog>` for drawers and dialogs, `<details>` for disclosure, the popover API for menus. No component libraries.
- **Mobile first.** Build at 375px, check 768 and 1280. Tap targets 44px, gutters 16px, one primary action per screen.
- **Inputs are 16px** at every width.
- **Let it flow.** No negative margins, no explicit widths or heights unless really needed (images, icons, full-height drawers).
- **Type:** only the scale tokens. Nothing under 12px, no `text-[11px]`.
- **Icons:** one `Icon` component. Decorative icons are `aria-hidden`. Icon-only controls get an `aria-label`.
- **Offline is a state.** A card keeps its last reading, dimmed, with its age. Never blank a card on one missed poll.
- **State changes are confirmed, not assumed.** A relay tile shows the new state only when the backend returned it, and ignores a second tap while busy (the store already does this; don't undo it).
- **Cards stay separate components** even when laid out together.
- **Check duplication is real** before extracting a component: read the call sites (`docs/CLAUDE.md` → Conventions).
- Keep types in `types/index.ts` in sync with the backend Pydantic models.
- Don't add a dependency without asking Todd. The bundle is 604 KB (178 KB gzip) and rebuilds on the Pi.

## Preview
Always preview in demo mode. To see an offline or error state, add it to `api/mock.ts` rather than pointing at the Pi. Take screenshots at 375 and 1280 at 2x. Look at them: the numbers alone don't catch a layout problem. A Playwright script that did this on 2026-11-13 used `playwright-core` installed outside the repo, pointed at the cached Chromium in `~/Library/Caches/ms-playwright`.

## Done checklist (before Todd sees it, and before any PR)
- [ ] Looks right at 375, 768 and 1280px, in demo mode
- [ ] Every state of a new or changed component is reachable in demo mode (default, offline, busy, error)
- [ ] Keyboard: logical tab order, visible focus, Esc closes drawers and dialogs, focus returns to the trigger
- [ ] Icon-only controls have an `aria-label`; no state is color only
- [ ] Contrast: text 4.5:1, icons and borders 3:1 (use the token table; compute any new pair)
- [ ] No raw hex, raw palette classes or `text-black` in the diff (`grep`)
- [ ] `npx tsc --noEmit` and `npm run build` pass; the bundle didn't grow without a reason
- [ ] Power is still within two taps and works with a hung poll
- [ ] Docs that name the UI path are updated (`grep -rn "Settings drawer\|SettingsDrawer\|PowerModal" docs`), dates bumped
- [ ] `case-study/decisions.md` has any new decision; `bin/doc-dates.sh` is clean
- [ ] Screenshots after, matching the baseline set, saved to `case-study/assets/after-<date>/`
- [ ] Nothing committed, pushed or deployed unless Todd said so
