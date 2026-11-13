import clsx from "clsx";
import type { ButtonHTMLAttributes } from "react";
import { Icon, type IconName } from "./Icon";

export type TileTone = "neutral" | "on" | "off";

// Same language as DeviceRow and Stat: a lime border and soft tint when on,
// orange when it needs attention, plain when it just opens something.
const TONE: Record<TileTone, string> = {
  neutral: "border-line bg-surface hover:bg-page",
  on: "border-on bg-on/15 hover:bg-on/25",
  off: "border-off bg-off/15 hover:bg-off/25",
};

// A big tap target for a shortcut: the icon centered over its label. The
// label says the state in words when there is one ("Camera off"), so the
// color is never the only signal. `aria-label` can add detail for screen
// readers ("WiFi, connected to VanNet").
export function TileButton({
  icon,
  label,
  tone = "neutral",
  className,
  ...props
}: {
  icon: IconName;
  label: string;
  tone?: TileTone;
  className?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">) {
  return (
    <button
      data-vc="tile-button"
      type="button"
      className={clsx(
        "flex min-h-16 flex-col items-center justify-center gap-1 rounded border px-2 py-2 transition",
        TONE[tone],
        className,
      )}
      {...props}
    >
      <Icon name={icon} className="size-6 text-ink" />
      <span className="text-caption font-semibold text-ink">{label}</span>
    </button>
  );
}
