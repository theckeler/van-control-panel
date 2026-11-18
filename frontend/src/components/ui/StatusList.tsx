import clsx from "clsx";
import { StatusDot, type DotTone } from "./StatusDot";

export type StatusListItem = {
  name: string;
  /** The state in words ("Connected", "No cable"). The dot alone never says it. */
  detail: string;
  tone: DotTone;
};

// A compact box of status lines: a dot and a name, with the state under it.
// For a few related links or sources at a glance, such as WiFi, hotspot and
// Ethernet. Read-only; a full-width source with a headline value is a
// DeviceRow instead.
export function StatusList({
  items,
  className,
  vc,
}: {
  items: StatusListItem[];
  className?: string;
  /** Feature components pass their own key, e.g. "wifi-card". */
  vc?: string;
}) {
  return (
    <ul
      data-vc={vc ?? "status-list"}
      className={clsx(
        "flex flex-col justify-center divide-y divide-line rounded border border-line bg-surface p-3",
        className,
      )}
    >
      {items.map(({ name, detail, tone }) => (
        <li
          key={name}
          className="flex min-w-0 flex-col py-1.5 first:pt-0 last:pb-0"
        >
          <span className="flex items-center gap-1.5 text-caption font-semibold">
            <StatusDot tone={tone} />
            <span className="truncate">{name}</span>
          </span>
          <span className="truncate pl-3.5 text-caption text-ink-muted">
            {detail}
          </span>
        </li>
      ))}
    </ul>
  );
}
