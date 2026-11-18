import clsx from "clsx";
import { StatusDot } from "./StatusDot";

export type SwitchState = "on" | "off" | "offline" | "busy";

// A relay. Tapping asks for a toggle; the tile shows the new state only when
// the caller passes it back from a confirmed backend result, so the UI never
// claims "on" until the Shelly said so. While busy, and when offline, taps
// are ignored.
export function SwitchTile({
  label,
  state,
  onToggle,
  className,
}: {
  label: string;
  state: SwitchState;
  onToggle: () => void;
  className?: string;
}) {
  const inert = state === "busy" || state === "offline";
  const word = {
    on: "ON",
    off: "OFF",
    offline: "Unreachable",
    busy: "Working…",
  }[state];

  return (
    <button
      data-vc="switch-tile"
      type="button"
      aria-pressed={state === "on"}
      aria-busy={state === "busy" || undefined}
      aria-disabled={inert || undefined}
      onClick={() => {
        if (!inert) onToggle();
      }}
      className={clsx(
        "flex min-h-14 flex-col gap-1 rounded border px-3 py-2 text-left transition",
        state === "on" && "border-on-text/40 bg-on text-ink",
        (state === "off" || state === "busy") &&
          "border-line bg-surface text-ink hover:bg-page",
        state === "offline" &&
          "cursor-not-allowed border-dashed border-line bg-page text-ink-muted",
        className,
      )}
    >
      <span className="flex items-center justify-between gap-2 text-body font-semibold">
        {label}
        <StatusDot
          tone={state === "on" ? "ink" : state === "offline" ? "unknown" : "off"}
        />
      </span>
      <span className="text-value">{word}</span>
    </button>
  );
}
