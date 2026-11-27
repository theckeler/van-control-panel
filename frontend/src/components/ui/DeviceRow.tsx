import clsx from "clsx";
import type { ReactNode } from "react";
import { RetryGlyph } from "./RetryGlyph";
import { StatusDot } from "./StatusDot";

export type DeviceState = "on" | "off" | "offline";

// One source or device: a dot and a name, a headline value, a detail on the
// right. The row stays white so the page isn't a wall of green. State shows
// as a lime border and dot when on, a grey dot when idle or unplugged, and a
// dashed border when offline, and the detail text always says it in words
// ("Running", "Unplugged", "Offline"). EcoflowCard, StarlinkCard and
// FridgeCard each compose their own; they stay three components.
export function DeviceRow({
  name,
  value,
  detail,
  state = "on",
  children,
  rawName = false,
  onRecheck,
  checking = false,
  vc,
}: {
  name: string;
  value?: string;
  detail?: string;
  state?: DeviceState;
  /** Extra content under the value, e.g. a Progress or a Badge. */
  children?: ReactNode;
  /** The name is data, like a WiFi SSID, so keep its case. */
  rawName?: boolean;
  /** Offline only: ask the source again now. The whole row becomes a button. */
  onRecheck?: () => void;
  /** Offline only: a check is running. Shows the loading state. */
  checking?: boolean;
  vc?: string;
}) {
  const offline = state === "offline";
  // Spans, not divs: this content also sits inside a <button>.
  const content = (
    <>
      <span className="flex items-center justify-between gap-3">
        <span
          className={clsx(
            "flex items-center gap-2 text-label",
            !rawName && "uppercase",
          )}
        >
          <StatusDot tone={state === "on" ? "on" : "unknown"} />
          {name}
        </span>
        <span className="text-right text-caption text-ink-muted">
          {offline && checking
            ? "Checking…"
            : (detail ?? (offline ? "Offline" : ""))}
        </span>
      </span>
      {value && (
        <span className="text-body font-semibold tabular-nums">{value}</span>
      )}
      {children}
    </>
  );

  // No aria-label: the button's name is its own text, so a screen reader still
  // hears the last reading and its age, then what tapping does.
  if (offline && onRecheck) {
    return (
      <button
        data-vc={vc ?? "device-row"}
        type="button"
        aria-busy={checking || undefined}
        aria-disabled={checking || undefined}
        onClick={() => {
          if (!checking) onRecheck();
        }}
        className="group flex w-full items-center gap-3 rounded border border-dashed border-line bg-page px-3 py-2 text-left text-ink-muted transition hover:bg-surface"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">{content}</span>
        <RetryGlyph busy={checking} />
        {!checking && <span className="sr-only">Check again</span>}
      </button>
    );
  }

  return (
    <div
      data-vc={vc ?? "device-row"}
      className={clsx(
        "flex flex-col gap-0.5 rounded border px-3 py-2",
        state === "on" && "border-on bg-surface text-ink",
        state === "off" && "border-line bg-surface text-ink",
        offline && "border-dashed border-line bg-page text-ink-muted",
      )}
    >
      {content}
    </div>
  );
}
