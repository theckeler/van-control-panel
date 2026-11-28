import clsx from "clsx";
import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import { RetryGlyph } from "./RetryGlyph";

export type InfoState = "on" | "off" | "warn" | "offline";

const FRAME: Record<InfoState, string> = {
  on: "border-on bg-surface text-ink",
  off: "border-line bg-surface text-ink",
  warn: "border-warn bg-warn/25 text-ink",
  offline: "border-dashed border-line bg-page text-ink-muted",
};

// A tile that is itself a control is filled like a TileButton, so it looks
// like something to tap.
const CONTROL: Record<InfoState, string> = {
  on: "border-on bg-on/15 text-ink hover:bg-on/25",
  off: "border-off bg-off/15 text-ink hover:bg-off/25",
  warn: "border-warn bg-warn/25 text-ink",
  offline: FRAME.offline,
};

// One link, source or device: an icon over its name, then a reading and a
// detail. The tile stays white so the page isn't a wall of green. State shows
// as a lime border when on, a plain one when idle or unplugged, an amber tint
// for a warning and a dashed border when offline, and the detail text always
// says it in words ("Running", "Unplugged", "Offline"). EcoflowCard,
// StarlinkCard and FridgeCard each compose their own; they stay three
// components.
export function InfoTile({
  icon,
  name,
  value,
  detail,
  state = "on",
  children,
  onClick,
  actionHint,
  onRecheck,
  checking = false,
  control = false,
  waiting = false,
  className,
  vc,
}: {
  icon: IconName;
  name: string;
  value?: string;
  detail?: string;
  state?: InfoState;
  /** Extra content under the value, e.g. a Progress or a Badge. */
  children?: ReactNode;
  /** Makes the whole tile a button that opens something. */
  onClick?: () => void;
  /** With onClick: what the tap does, for screen readers ("Open WiFi"). */
  actionHint?: string;
  /** Offline only: ask the source again now. The whole tile becomes a button. */
  onRecheck?: () => void;
  /** Offline only: a check is running. Shows the loading state. */
  checking?: boolean;
  /** The tile is a button or a switch, not just a report. */
  control?: boolean;
  /** A switch is in flight: says "Working…" and ignores taps. */
  waiting?: boolean;
  /** Layout only, e.g. "col-span-2". */
  className?: string;
  vc?: string;
}) {
  const offline = state === "offline";
  const recheck = offline ? onRecheck : undefined;
  const press = recheck ?? onClick;
  const probing = !!recheck && checking;
  const busy = probing || waiting;
  const line = probing
    ? "Checking…"
    : waiting
      ? "Working…"
      : (detail ?? (offline ? "Offline" : undefined));

  // Spans, not divs: this content also sits inside a <button>.
  const content = (
    <>
      <Icon name={icon} className="size-6 shrink-0" />
      <span className="max-w-full truncate text-caption font-semibold">
        {name}
      </span>
      {value && (
        <span className="max-w-full text-body font-semibold tabular-nums">
          {value}
        </span>
      )}
      {children}
      {line && (
        <span className="max-w-full text-balance text-caption text-ink-muted">
          {line}
        </span>
      )}
    </>
  );

  const frame = clsx(
    // Top-aligned, so icons line up across a row however much text follows.
    "flex min-h-16 min-w-0 flex-col items-center justify-start gap-0.5 rounded border px-1 py-2 text-center",
    (control ? CONTROL : FRAME)[state],
    className,
  );

  if (!press) {
    return (
      <div data-vc={vc ?? "info-tile"} title={name} className={frame}>
        {content}
      </div>
    );
  }

  // No aria-label: the button's name is its own text, so a screen reader still
  // hears the reading and its age, then what tapping does.
  return (
    <button
      data-vc={vc ?? "info-tile"}
      type="button"
      title={name}
      aria-busy={busy || undefined}
      aria-disabled={busy || undefined}
      onClick={() => {
        if (!busy) press();
      }}
      className={clsx(
        frame,
        "group relative transition",
        recheck ? "hover:bg-surface" : !control && "hover:bg-page",
      )}
    >
      {content}
      {recheck && (
        <span className="absolute right-2 top-2 flex">
          <RetryGlyph busy={checking} />
        </span>
      )}
      {recheck && !checking && <span className="sr-only">Check again</span>}
      {!recheck && actionHint && <span className="sr-only">{actionHint}</span>}
    </button>
  );
}
