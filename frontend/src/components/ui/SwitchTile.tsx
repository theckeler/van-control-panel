import clsx from "clsx";
import { useLayoutEffect, useRef } from "react";
import { RetryGlyph } from "./RetryGlyph";
import { StatusDot } from "./StatusDot";

export type SwitchState = "on" | "off" | "offline" | "busy";

// A relay. Tapping asks for a toggle; the tile shows the new state only when
// the caller passes it back from a confirmed backend result, so the UI never
// claims "on" until the Shelly said so. While busy, taps are ignored.
//
// Offline, there is nothing to toggle. With `onRecheck` the whole tile is the
// "check again" button, and says "Checking…" until it connects or gives up.
// Without it, the tile is a plain box.

// A tile that comes back turns from "check again" into a relay switch under
// the same finger, and the relay switches a real load.
// So a tap that lands this soon after is taken as a late "check again".
const SETTLE_MS = 1_000;

function acceptsTap(msSinceBack: number): boolean {
  return msSinceBack >= SETTLE_MS;
}

export function SwitchTile({
  label,
  state,
  onToggle,
  onRecheck,
  checking = false,
  className,
}: {
  label: string;
  state: SwitchState;
  onToggle: () => void;
  /** Offline only: probe the unit again. The whole tile becomes the button. */
  onRecheck?: () => void;
  /** Offline only: a recheck is running. Shows the loading state. */
  checking?: boolean;
  className?: string;
}) {
  // When the tile last left offline. 0 means it has not been offline.
  const backAt = useRef(0);
  const wasOffline = useRef(state === "offline");
  useLayoutEffect(() => {
    if (wasOffline.current && state !== "offline") backAt.current = Date.now();
    wasOffline.current = state === "offline";
  }, [state]);

  if (state === "offline") {
    const frame =
      "flex min-h-14 items-center justify-between gap-2 rounded border border-dashed border-line bg-page px-3 py-2 text-ink-muted";
    const text = (
      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex items-center gap-2 text-body font-semibold">
          {label}
          <StatusDot tone="unknown" />
        </span>
        {/* Below 1024px the tile content is 120-170px wide, which fits the word
            and the 32px retry mark only if the word is short. */}
        {/* "Checking…" is too long for that, so it is set smaller. */}
        <span className={checking ? "text-body font-semibold" : "text-value"}>
          {checking ? (
            "Checking…"
          ) : onRecheck ? (
            <>
              <span className="lg:hidden">Offline</span>
              <span className="hidden lg:inline">Unreachable</span>
            </>
          ) : (
            "Unreachable"
          )}
        </span>
      </span>
    );

    if (!onRecheck) {
      return (
        <div
          data-vc="switch-tile"
          role="group"
          aria-label={`${label}, unreachable`}
          className={clsx(frame, className)}
        >
          {text}
        </div>
      );
    }

    return (
      <button
        data-vc="switch-tile"
        type="button"
        aria-busy={checking || undefined}
        aria-disabled={checking || undefined}
        onClick={() => {
          if (!checking) onRecheck();
        }}
        className={clsx(frame, "group text-left transition hover:bg-surface", className)}
      >
        {text}
        <RetryGlyph busy={checking} />
        {!checking && <span className="sr-only">Check again</span>}
      </button>
    );
  }

  const busy = state === "busy";
  const word = { on: "ON", off: "OFF", busy: "Working…" }[state];

  return (
    <button
      data-vc="switch-tile"
      type="button"
      aria-pressed={state === "on"}
      aria-busy={busy || undefined}
      aria-disabled={busy || undefined}
      onClick={() => {
        if (!busy && acceptsTap(Date.now() - backAt.current)) onToggle();
      }}
      className={clsx(
        "flex min-h-14 flex-col gap-1 rounded border px-3 py-2 text-left transition",
        state === "on" && "border-on-text/40 bg-on text-ink",
        state !== "on" && "border-line bg-surface text-ink hover:bg-page",
        className,
      )}
    >
      <span className="flex items-center justify-between gap-2 text-body font-semibold">
        {label}
        <StatusDot tone={state === "on" ? "ink" : "off"} />
      </span>
      <span className="text-value">{word}</span>
    </button>
  );
}
