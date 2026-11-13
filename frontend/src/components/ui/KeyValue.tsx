import clsx from "clsx";

export type KeyValueItem = {
  label: string;
  value: string;
  /** warn and bad also bold the value, so the signal is not color only. */
  tone?: "warn" | "bad";
};

export function KeyValue({
  items,
  className,
}: {
  items: KeyValueItem[];
  className?: string;
}) {
  return (
    <dl data-vc="key-value" className={clsx("flex flex-col", className)}>
      {items.map(({ label, value, tone }) => (
        <div
          key={label}
          className="flex items-baseline justify-between gap-3 border-b border-line py-2 text-body last:border-0"
        >
          <dt className="text-ink-muted">{label}</dt>
          <dd
            className={clsx(
              "text-right tabular-nums",
              tone === "bad" && "font-bold text-danger-text",
              tone === "warn" && "font-bold text-warn-text",
              !tone && "text-ink",
            )}
          >
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
