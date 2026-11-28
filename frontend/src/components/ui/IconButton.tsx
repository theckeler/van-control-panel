import clsx from "clsx";
import type { ButtonHTMLAttributes } from "react";
import { Icon, type IconName } from "./Icon";

export type IconButtonTone = "control" | "on" | "off";

// control: neutral, nothing to report. on: healthy / active. off: needs
// attention. Meaning also goes in the aria-label ("Camera, off"), never in
// color alone.
const ICON_TONE: Record<IconButtonTone, string> = {
  control: "bg-control text-surface",
  on: "bg-on text-ink",
  off: "bg-off text-ink",
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
  return (
    <button
      data-vc="icon-button"
      type="button"
      aria-label={label}
      title={label}
      aria-busy={busy || undefined}
      disabled={disabled}
      className={clsx(
        "relative inline-flex size-11 shrink-0 items-center justify-center rounded-full transition",
        "hover:brightness-110 disabled:cursor-not-allowed disabled:bg-line disabled:text-disabled disabled:hover:brightness-100",
        busy && "pointer-events-none",
        ICON_TONE[tone],
        className,
      )}
      {...props}
    >
      <Icon name={icon} className={clsx("size-6", busy && "animate-spin")} />
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
