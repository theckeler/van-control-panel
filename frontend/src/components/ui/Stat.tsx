import clsx from "clsx";

export type StatTone = "neutral" | "good" | "warn" | "bad";

// Neutral is the plain blue outline. The others tint the chip, and the hint
// says why in words ("low", "hot"), so the color is never the only signal.
const TONE: Record<StatTone, string> = {
  neutral: "border-info bg-surface",
  good: "border-on bg-on/20",
  warn: "border-warn bg-warn/25",
  bad: "border-danger bg-danger/10",
};

// A label and a value, outlined in the info blue (a blue fill with dark text
// was too loud). `chip` is the compact tile under the battery bar, centered;
// `row` is a full-width line. Offline keeps the last value, dimmed, and says
// so in words.
export function Stat({
  value,
  label,
  variant = "chip",
  offline = false,
  lastSeen,
  tone = "neutral",
  hint,
  className,
}: {
  value: string;
  label?: string;
  variant?: "chip" | "row";
  offline?: boolean;
  lastSeen?: string;
  tone?: StatTone;
  /** Why the tone isn't neutral, e.g. "low". Shown next to the value. */
  hint?: string;
  className?: string;
}) {
  return (
    <div
      data-vc="stat"
      className={clsx(
        "flex items-baseline gap-1.5 rounded border px-3 py-1.5 text-body",
        variant === "chip" ? "justify-center" : "justify-between",
        offline ? "border-line bg-page text-ink-muted" : clsx(TONE[tone], "text-ink"),
        className,
      )}
    >
      {label && <span className="text-ink-muted">{label}</span>}
      <span className="font-semibold tabular-nums">
        {value}
        {!offline && hint && (
          <span className="font-normal"> {hint}</span>
        )}
        {offline && (
          <span className="font-normal">
            {" "}
            · offline{lastSeen ? `, ${lastSeen}` : ""}
          </span>
        )}
      </span>
    </div>
  );
}
