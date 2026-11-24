import clsx from "clsx";
import type { ReactNode } from "react";
import { IconButton } from "./IconButton";
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
  /** Offline only: ask the source again now. Shows a refresh button. */
  onRecheck?: () => void;
  /** Offline only: a check is in flight. */
  checking?: boolean;
  vc?: string;
}) {
  const offline = state === "offline";
  const content = (
    <>
      <div className="flex items-center justify-between gap-3">
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
          {detail ?? (offline ? "Offline" : "")}
        </span>
      </div>
      {value && (
        <span className="text-body font-semibold tabular-nums">{value}</span>
      )}
      {children}
    </>
  );
  return (
    <div
      data-vc={vc ?? "device-row"}
      className={clsx(
        "rounded border px-3 py-2",
        state === "on" && "border-on bg-surface text-ink",
        state === "off" && "border-line bg-surface text-ink",
        offline && "border-dashed border-line bg-page text-ink-muted",
      )}
    >
      {offline && onRecheck ? (
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">{content}</div>
          <IconButton
            icon="refresh"
            tone="quiet"
            label={`Check ${name} again`}
            busy={checking}
            onClick={onRecheck}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">{content}</div>
      )}
    </div>
  );
}
