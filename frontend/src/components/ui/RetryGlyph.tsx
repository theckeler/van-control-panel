import clsx from "clsx";
import { Icon } from "./Icon";

// The "check again" mark on an offline tile or row. Decoration only: the whole
// tile or row around it is the button, so this must never be one itself. It
// darkens when that parent (marked `group`) is hovered.
export function RetryGlyph({ busy = false }: { busy?: boolean }) {
  return (
    <span
      data-vc="retry-glyph"
      aria-hidden="true"
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-ink/10 text-ink transition group-hover:bg-ink/20"
    >
      <Icon name="refresh" className={clsx("size-5", busy && "animate-spin")} />
    </span>
  );
}
