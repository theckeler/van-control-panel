import clsx from "clsx";

// SOC and EcoFlow. Below `lowBelow` the fill turns warn, and the text value
// beside it carries the number either way.
export function Progress({
  value,
  label,
  valueText,
  lowBelow = 20,
  offline = false,
  className,
}: {
  /** 0 to 100. */
  value: number;
  /** Accessible name, e.g. "Battery charge". */
  label: string;
  /** Visible number beside the bar, e.g. "87.3%". */
  valueText?: string;
  lowBelow?: number;
  offline?: boolean;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const low = !offline && pct < lowBelow;
  return (
    <div
      data-vc="progress"
      className={clsx("flex items-center gap-3", className)}
    >
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        className="h-2 flex-1 overflow-hidden rounded-full bg-line"
      >
        <div
          className={clsx(
            "h-full rounded-full transition-[width]",
            offline ? "bg-disabled" : low ? "bg-warn" : "bg-on",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      {valueText && (
        <span className="text-caption font-semibold tabular-nums text-ink">
          {valueText}
        </span>
      )}
    </div>
  );
}
