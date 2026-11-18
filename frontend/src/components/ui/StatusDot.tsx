import clsx from "clsx";

export type DotTone = "on" | "off" | "warn" | "unknown" | "ink";

const TONE: Record<DotTone, string> = {
  on: "bg-on",
  off: "bg-off",
  warn: "bg-warn",
  unknown: "bg-disabled",
  // For a dot that sits on a colored fill, where on/off colors would vanish.
  ink: "bg-ink",
};

// 8px dot. Decorative: it is never used without text beside it saying the
// same thing, because color alone cannot carry state.
export function StatusDot({
  tone = "unknown",
  className,
}: {
  tone?: DotTone;
  className?: string;
}) {
  return (
    <span
      data-vc="status-dot"
      aria-hidden="true"
      className={clsx(
        "inline-block size-2 shrink-0 rounded-full",
        TONE[tone],
        className,
      )}
    />
  );
}
