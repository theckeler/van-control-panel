import clsx from "clsx";
import type { ButtonHTMLAttributes } from "react";
import { Icon, type IconName } from "./Icon";

export type IconButtonTone = "control" | "on" | "off" | "quiet";

// control: neutral, nothing to report. on: healthy / active. off: needs
// attention. quiet: a secondary action that should not shout (a "check again"
// inside a tile): a 48px tap area around a small translucent disc. Meaning
// also goes in the aria-label ("Camera, off"), never in color alone.
export const ICON_TONE: Record<IconButtonTone, string> = {
  control: "bg-control text-surface",
  on: "bg-on text-ink",
  off: "bg-off text-ink",
  quiet: "bg-ink/10 text-ink",
};

export function IconButton({
  icon,
  label,
  tone = "control",
  badge,
  busy = false,
  className,
  disabled,
  ...props
}: {
  icon: IconName;
  /** Required: an icon-only control has no other accessible name. */
  label: string;
  tone?: IconButtonTone;
  /** Small count or marker in the corner. */
  badge?: string | number;
  /** Spins the icon and ignores taps while something is in flight. */
  busy?: boolean;
  className?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children" | "aria-label">) {
  const quiet = tone === "quiet";
  const glyph = (
    <Icon name={icon} className={clsx(quiet ? "size-5" : "size-6", busy && "animate-spin")} />
  );
  return (
    <button
      data-vc="icon-button"
      type="button"
      aria-label={label}
      title={label}
      aria-busy={busy || undefined}
      disabled={disabled}
      className={clsx(
        "group relative inline-flex shrink-0 items-center justify-center rounded-full transition",
        "disabled:cursor-not-allowed",
        quiet
          ? // The button itself is only the tap area. The disc is drawn inside.
            "size-12 text-ink disabled:opacity-50"
          : [
              "size-11 hover:brightness-110 disabled:bg-line disabled:text-disabled disabled:hover:brightness-100",
              ICON_TONE[tone],
            ],
        busy && "pointer-events-none",
        className,
      )}
      {...props}
    >
      {quiet ? (
        <span
          aria-hidden="true"
          className="inline-flex size-8 items-center justify-center rounded-full bg-ink/10 transition group-hover:bg-ink/20"
        >
          {glyph}
        </span>
      ) : (
        glyph
      )}
      {badge !== undefined && (
        <span
          aria-hidden="true"
          className="absolute right-0 top-0 min-w-4 rounded-full bg-surface px-1 text-center text-caption font-semibold text-ink ring-1 ring-line"
        >
          {badge}
        </span>
      )}
    </button>
  );
}
