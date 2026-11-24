import clsx from "clsx";
import { IconButton } from "./IconButton";
import { StatusDot } from "./StatusDot";

export type SwitchState = "on" | "off" | "offline" | "busy";

// A relay. Tapping asks for a toggle; the tile shows the new state only when
// the caller passes it back from a confirmed backend result, so the UI never
// claims "on" until the Shelly said so. While busy, taps are ignored.
//
// An offline tile is a plain box, not a button: there is nothing to toggle, and
// it can carry its own "check again" button, which a <button> could not
// (a button inside a button is invalid HTML). Pass `onRecheck` to show it.
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
  /** Offline only: probe the unit again. Shows a refresh button. */
  onRecheck?: () => void;
  /** Offline only: a recheck is in flight. */
  checking?: boolean;
  className?: string;
}) {
  if (state === "offline") {
    return (
      <div
        data-vc="switch-tile"
        role="group"
        aria-label={`${label}, unreachable`}
        className={clsx(
          "flex min-h-14 items-center justify-between gap-2 rounded border border-dashed border-line bg-page px-3 py-2 text-ink-muted",
          className,
        )}
      >
        <div className="flex min-w-0 flex-col gap-1">
          <span className="flex items-center gap-2 text-body font-semibold">
            {label}
            <StatusDot tone="unknown" />
          </span>
          {/* Below 1024px the tile content is 120-170px wide, which fits the word
              and a 44px button only if the word is short. */}
          <span className="text-value">
            {onRecheck ? (
              <>
                <span className="lg:hidden">Offline</span>
                <span className="hidden lg:inline">Unreachable</span>
              </>
            ) : (
              "Unreachable"
            )}
          </span>
        </div>
        {onRecheck && (
          <IconButton
            icon="refresh"
            tone="quiet"
            label={`Check ${label} again`}
            busy={checking}
            onClick={onRecheck}
          />
        )}
      </div>
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
        if (!busy) onToggle();
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
