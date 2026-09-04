# Frontend Refactor Guide

**Last updated:** 2026-09-04

**Status:** §1–§6 and §8 done. §7 mostly resolved on inspection — see below.
Nothing left on this list that needs more work right now. See the end of
this file for what actually happened, since some of it moved beyond what's
described in the body (the WiFi scan progress modal was removed entirely,
not just cleaned up; the §7 items turned out to need less judgment than
expected once actually read).

Working checklist from a full trawl of `frontend/src/components` during the
Wifi/modal UI reorg, looking for inconsistencies between hand-rolled markup
and the shared `ui/` primitives, and for design-token drift. Ordered roughly
by priority — fix top to bottom, or cherry-pick.

Written against the working tree as of 2026-09-03, mid-refactor. File paths
and line numbers will drift as the reorg continues — treat them as pointers,
not guarantees.

---

## 1. Text-contrast bug (fix first — correctness, not style)

The theme system is real: `--panel-bg`/`--zinc-*` CSS vars flip via
`data-theme="light"` in `index.css`, and **dark is the default** (no
`data-theme` attribute → `panel-bg: 13 13 15`). But a lot of body/label text
is hardcoded to raw Tailwind `gray-800`/`gray-900`/`black` instead of the
`zinc-*` tokens — which is close to invisible against `panel-surface`
(`rgb(22,24,28)`) in the default theme.

Offenders:

- `components/ui/Button.tsx` — default `textColor="text-gray-900"`, `bgColor="bg-white"`
- `components/ui/Label.tsx` — always `text-gray-800`
- `components/ui/Row.tsx` — `text-black`, `border-gray-400`
- `components/modals/ConfirmModal.tsx` — body text `text-gray-900`, cancel button `text-gray-800`
- `components/modals/PowerModal.tsx` — titles/body `text-black` / `text-gray-800` / `text-gray-900`
- `components/modals/ProgressModal.tsx` — title `text-black`, message `text-gray-900`, cancel button `text-gray-800`
- `components/Cameras.tsx`, `components/cards/BatteryCard.tsx`, `components/cards/HistoryCard.tsx` — scattered `text-black` / `text-gray-800`

**Fix:** standardize on the `zinc-*` scale for anything that needs to react
to theme — `zinc-100` for primary text/headings, `zinc-400` for
secondary/muted, `zinc-500` for disabled. ConfirmModal's title and
HistoryCard's active tab already do this correctly — use those as the
reference, not the outlier.

---

## 2. `Row.tsx` — `"bold"` isn't a real Tailwind class

`components/ui/Row.tsx` sets `"text-red-400 bold"` / `"text-amber-400 bold"`
for `tone="bad"`/`"warn"`. Should be `font-bold`. Right now those tones
silently don't bold anything.

---

## 3. `Button` primitive undermines its own variant system

`components/ui/Button.tsx` has a `variant` prop (`outline` / `ghost` /
`danger`) **and** three free-form override props (`borderColor`, `textColor`,
`bgColor`) that most call sites use instead — which defeats the point of
having variants. Concretely, "danger" means three different things in three
places:

- `Button`'s own `danger` variant → `bg-amber-900`
- `ConfirmModal.tsx` → hand-rolled `bg-red-900` vs `bg-amber-900` picked by a
  local `danger` boolean, bypassing `Button` entirely (raw `<button>`)
- `PowerModal.tsx` → `<Button className="... bg-red-900 text-red-100">`,
  overriding the variant via raw className

**Fix:** pick one danger color — probably `red`, matching `soc.low` /
`red-600` already used elsewhere, no need to invent new `-900` shades. Bake
it into `Button`'s `danger` variant, delete `borderColor` / `textColor` /
`bgColor`, and have `ConfirmModal` and `PowerModal` both just pass
`variant="danger"`.

Also in `PowerModal.tsx`: dead commented-out props (`// type="Button"`,
`// className=...`) on every `<Button>` call — leftover from an earlier
pass, safe to delete.

---

## 4. Raw `<button>` where `<Button>` (or `<SelectableTile>`) already exists

Duplicating classes `Button` already encodes:

- `ConfirmModal.tsx` — both buttons, exact duplicate of `Button`'s outline/danger styling
- `ProgressModal.tsx` — cancel button, same `border-gray-800 text-gray-800` duplication
- `HistoryCard.tsx` — tab switcher; this is a toggle, so `SelectableTile`
  (already built for exactly this) fits better than `Button`
- `SettingsDrawer.tsx` — 4 raw buttons, worth a look together since the file
  already imports `Button` elsewhere

Leave alone — different job than `Button`, converting would be
over-engineering:

- `Toaster.tsx` (whole toast is the click target)
- `ErrorBoundary.tsx` (isolated crash-recovery UI, arguably shouldn't depend
  on the rest of the tree)
- `ThemeToggle.tsx` (icon toggle, not a labeled action button)
- `BatteryCard.tsx` (inline text link, "connect →")

---

## 5. Naming: filename ≠ export name

- `cards/WifiCard.tsx` exports `WifiPanel`
- `WifiScan.tsx` exports `WifiScanCard`

Both work today but break grep / IDE go-to-file intuition. Rename the file
to match the export (or vice versa) — pick one direction and apply it
consistently. `EthBadge.tsx` / `WifiBadge.tsx` already follow file = export;
match that.

---

## 6. Folder org: root-level orphans

Everything else got sorted into `cards/`, `drawers/`, `modals/`, `badges/`,
`ui/` — these still sit loose directly in `components/`: `Header.tsx`,
`ModeSelector.tsx`, `ThemeToggle.tsx`, `Toaster.tsx`, `ErrorBoundary.tsx`,
`Cameras.tsx`, `WifiScan.tsx`.

Also worth noting: `WifiScan.tsx` moved **out of** `cards/` while everything
else in this reorg moved **inward** into a subfolder — opposite direction,
possibly not intentional.

Suggestion, not a mandate: a `components/layout/` bucket for `Header` /
`Toaster` / `ErrorBoundary` (app-shell, not dashboard content), and treat
`ModeSelector` / `Cameras` / `WifiScan` as cards (they're dashboard-panel-shaped
like everything in `cards/`) unless there's a reason they're meant to be
different.

---

## 7. Decide the fate of half-finished things while you're in here

- `ModeSelector.tsx` — fully wired to the store, but not rendered in
  `pages/Dashboard.tsx`. Finish wiring it in or delete it — right now it's
  dead weight either way.
- `hooks/useTheme.ts` — dark-mode logic is commented out, so `ThemeToggle.tsx`
  always resolves light. Given the app is dark-by-default per the CSS, this
  toggle currently does nothing real.
- `WifiScan.tsx` — commented-out `<ProgressModal>` block with a stray "pleaze
  wait" typo in the dead comment.
- `ChargeSourcesCard.tsx` — Orion/alternator row commented out.

---

## 8. Smaller stuff

- `ui/index.ts` re-exports `Panel` / `Stack` / `Label` / `Button` /
  `SelectableTile` / `Row` / `Spinner` / `StatusDot` but not `Modal` /
  `BackDrop` — those get imported by path instead. Pick one convention.
- Double-space typos inside className strings (`"text-xs  text-gray-800"`) in
  `HistoryCard.tsx`, `Cameras.tsx`, and others — harmless but a copy-paste
  tell. A quick search for a doubled space inside className strings would
  sweep most of them.
- No `@/` path alias — 53 relative imports as of this pass, some three levels
  deep (`../../hooks/...`) from `cards/` / `drawers/` / `modals/`. Optional,
  but since most of these files are already being touched for other reasons,
  adding the alias now (tsconfig + vite config) makes the *next* reorg
  cheaper too. Not urgent.

---

## Suggested order of attack

1. §1 text-contrast fix, §2 `Row.tsx` bold bug — quick, high-value, low-risk
2. §3 `Button` variant cleanup — unblocks §4
3. §4 raw-button conversions
4. §5 naming, §6 folder org — do together, one PR, since both are pure moves/renames
5. §7 — a judgment call per item, not a batch
6. §8 — whenever, no urgency

---

## What actually happened (2026-09-03 evening)

Diverged from the plan above in a few places, worth knowing before picking
this back up:

- **§1**: done, but the diagnosis flipped mid-work. `index.html` force-sets
  `data-theme="light"` on load (dark mode is disabled on purpose right now),
  so the real bug wasn't `gray-800`/`black` text being invisible — it was
  scattered `zinc-100`/`zinc-300`/`zinc-400` usages (Tailwind's stock light
  palette, unrelated to the app's own unused `--zinc-*` CSS variables)
  fighting the white background. Fixed by replacing those with `gray-900`
  (primary) / `gray-600` (secondary) throughout, and swapping the two
  self-contained dark chips (`HistoryCard`'s active tab, `Toaster`) from
  `zinc-*` to the `gray-*` equivalent.
- **§2**: done as described.
- **§3**: done, plus one more real bug found in the process — `ghost` and
  `outline` were byte-identical in `Button.tsx`, so every icon button in the
  app was rendering with an unwanted visible border box. Fixed alongside the
  planned `danger`-color and escape-hatch cleanup. `size="icon"` now defaults
  `fullWidth` to `false` automatically instead of requiring every icon button
  to remember the prop.
- **§4**: fully done — `ConfirmModal`, `ProgressModal`, `HistoryCard`'s tab
  switcher (→ `SelectableTile`), and `SettingsDrawer`'s 4 options buttons all
  converted.
- **§5**: done. `WifiCard.tsx` now exports `WifiCard` (was `WifiPanel` —
  matches every other card's file=export convention). `WifiScan.tsx` renamed
  to `WifiScanCard.tsx` (kept the export name, moved the file to match, same
  convention as `EthBadge`/`WifiBadge`).
- **§6**: done (2026-09-04 morning). Every file directly under
  `components/` now lives somewhere sorted, matching the pattern the rest of
  the tree already followed:
  - `components/layout/` (new): `Header.tsx`, `Toaster.tsx`,
    `ErrorBoundary.tsx`, `ThemeToggle.tsx` — app-shell, not dashboard content
  - `components/cards/`: `Cameras.tsx`, `ModeSelector.tsx` joined the other
    Panel-wrapped dashboard tiles
  - `components/drawers/`: `WifiScanCard.tsx` moved here since
    `NetworkDetailsDrawer` is its only consumer — they're now siblings, and
    the import collapsed from `"../WifiScanCard"` to `"./WifiScanCard"`
  - All internal relative imports (one level deeper now) and every external
    import site (`Dashboard.tsx`, `main.tsx`, `NetworkDetailsDrawer.tsx`)
    updated. Full typecheck + production build both clean afterward.
- **§7**: turned out to need less judgment than framed, once actually read:
  - `ChargeSourcesCard`'s Orion row — **no action needed**. It's not an
    oversight, it's already deliberately documented: Orion-Tr is non-smart
    hardware (static config, no real telemetry) until the planned Orion XS
    50A upgrade, so showing a row for it would be misleading. Same shape as
    the `Cameras` disable, just without a doc comment pointing at it.
  - `ModeSelector` — fixed a small real inconsistency: `Dashboard.tsx` had
    `{/* <ModeSelector /> */}` with **no import at all**, active or
    commented (unlike `Cameras`, which kept a commented import with a clear
    reason). Uncommenting it as it stood would have failed to compile. Since
    there was no documented reason to preserve, and the component itself
    (fully store-wired, untouched) still exists at
    `components/cards/ModeSelector.tsx` ready to wire in whenever "apply a
    mode" actually gets built, I removed the dangling non-functional
    comment rather than fabricate a rationale for keeping it. Nothing about
    the feature itself was touched.
  - `ThemeToggle` — genuinely unused: grepped for it project-wide, zero
    references anywhere outside its own file (not even a comment), so it
    isn't rendered at all right now, not just non-functional. Left
    completely untouched — this one's still a real product call (finish
    dark mode, or delete the toggle) that's yours to make, not mine.
- **§8**: `ui/index.ts` now exports `Modal`/`BackDrop` too, and all
  ad-hoc double-space typos in className strings got swept in one pass.
  `@/` path alias still not done — genuinely optional, skipped for time.

**Beyond the original scope**, in response to live feedback while testing:
the WiFi scan's `<ProgressModal>` overlay (already dead — commented out,
pointing at an import that didn't exist) was removed entirely rather than
fixed. Scanning state (spinner, status text, a working Cancel button) moved
inline into the networks-list box instead, which also now takes priority
over stale results during a re-scan instead of silently showing old data
with no feedback. Fixed the actual reason that box wasn't stretching to fill
the drawer: `WifiScanCard`'s `h-full` had nothing to be 100% of, because its
parent `<section>` in `NetworkDetailsDrawer` had no defined height — added
`flex-1 min-h-0` there, which is the real fix, not more CSS on the child.
