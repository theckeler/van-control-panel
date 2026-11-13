import clsx from "clsx";
import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "on" | "off" | "warn";

// Outlined, not filled: colored text on white is readable (the *-text tokens
// pass 4.5:1) and it keeps the saturated fills for things that are on.
const TONE: Record<BadgeTone, string> = {
  neutral: "border-line bg-page text-ink-muted",
  on: "border-on-text/50 bg-surface text-on-text",
  off: "border-off-text/50 bg-surface text-off-text",
  warn: "border-warn-text/50 bg-surface text-warn-text",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      data-vc="badge"
      className={clsx(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-caption font-semibold",
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
