import clsx from "clsx";
import type { ReactNode } from "react";
import { StatusDot } from "./StatusDot";

// Container for one feature. Flat, with a border. When its source is offline
// the content dims and says so in words, with the age of the last reading:
// a card never blanks on a missed poll.
export function Card({
  title,
  action,
  offline = false,
  lastSeen,
  className,
  children,
  vc,
}: {
  title?: string;
  /** Header control, for example an IconButton. */
  action?: ReactNode;
  offline?: boolean;
  /** Age of the last reading, e.g. "4 min ago". Shown only when offline. */
  lastSeen?: string;
  className?: string;
  children: ReactNode;
  /** Feature cards pass their own key, e.g. "battery-card". */
  vc?: string;
}) {
  return (
    <section
      data-vc={vc ?? "card"}
      aria-label={title}
      className={clsx(
        "flex flex-col gap-3 rounded border border-line bg-surface p-4",
        className,
      )}
    >
      {(title || action) && (
        <header className="flex items-center justify-between gap-3">
          {title && (
            <h2 className="text-label uppercase text-ink-muted">{title}</h2>
          )}
          {action}
        </header>
      )}
      {offline && (
        <p className="flex items-center gap-2 text-caption text-ink-muted">
          <StatusDot tone="unknown" />
          Offline{lastSeen ? ` · last seen ${lastSeen}` : ""}
        </p>
      )}
      <div className={clsx("flex flex-col gap-3", offline && "opacity-70")}>
        {children}
      </div>
    </section>
  );
}
