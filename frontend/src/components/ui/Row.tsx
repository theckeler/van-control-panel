import clsx from "clsx";

export function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warn" | "bad";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-panel-border last:border-0 text-xs">
      <span className="text-gray-600">{label}</span>
      <span
        className={clsx(
          tone === "bad"
            ? "text-soc-low font-bold"
            : tone === "warn"
              ? "text-soc-mid font-bold"
              : "text-gray-900",
        )}
      >
        {value}
      </span>
    </div>
  );
}
