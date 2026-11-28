import clsx from "clsx";
import { useId, type ReactNode } from "react";
import { IconButton } from "./IconButton";
import { useDialogElement } from "./useDialogElement";

// One drawer, one concern. Full-height sheet on phones, a right-hand panel
// from md. Children mount only while open, so a drawer's data loads on open
// and the dashboard's poll stays light. A drawer never opens another drawer.
export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
  vc,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Pinned under the body. Destructive and rare actions go at the bottom. */
  footer?: ReactNode;
  /** The drawer's key, e.g. "drawer-wifi". */
  vc: string;
}) {
  const ref = useDialogElement(open, onClose, true);
  const titleId = useId();

  return (
    <dialog
      ref={ref}
      data-vc={vc}
      aria-labelledby={titleId}
      className={clsx(
        "m-0 h-dvh max-h-none w-full max-w-none bg-surface p-0 text-ink shadow-overlay",
        "md:ml-auto md:w-96",
        "backdrop:bg-ink/50",
      )}
    >
      {open && (
        <div className="flex h-full flex-col pl-[var(--safe-left)] pr-[var(--safe-right)] md:pl-0">
          <header className="flex items-center justify-between gap-3 border-b border-line px-4 pb-3 pt-[calc(0.75rem+var(--safe-top))]">
            <h2 id={titleId} className="text-title">
              {title}
            </h2>
            <IconButton icon="x" label="Close" onClick={onClose} />
          </header>
          <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-4 last:pb-[calc(1rem+var(--safe-bottom))]">
            {children}
          </div>
          {footer && (
            <footer className="flex flex-col gap-2 border-t border-line p-4 pb-[calc(1rem+var(--safe-bottom))]">
              {footer}
            </footer>
          )}
        </div>
      )}
    </dialog>
  );
}
