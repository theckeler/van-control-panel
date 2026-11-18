import clsx from "clsx";
import { useId, type ReactNode } from "react";
import { Spinner } from "./Spinner";
import { useDialogElement } from "./useDialogElement";

// Confirm, progress and result, with a fixed layout: title, message, then
// the actions stacked on phones and in a row from sm. A destructive confirm
// passes a `danger` Button. While `busy` (a reboot in flight) it shows a
// spinner and ignores Esc and the backdrop, so it cannot be dismissed
// half-way through something that can lose power or connectivity.
export function Dialog({
  open,
  onClose,
  title,
  children,
  actions,
  busy = false,
  stacked = false,
  vc,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  busy?: boolean;
  /** Always stack the actions (three or more). Otherwise a row from sm. */
  stacked?: boolean;
  /** The dialog's key, e.g. "dialog-power". */
  vc: string;
}) {
  const ref = useDialogElement(open, onClose, !busy);
  const titleId = useId();

  return (
    <dialog
      ref={ref}
      data-vc={vc}
      aria-labelledby={titleId}
      aria-busy={busy || undefined}
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded bg-surface p-0 text-ink shadow-overlay backdrop:bg-ink/50"
    >
      {open && (
        <div className="flex flex-col gap-4 p-5">
          <h2 id={titleId} className="text-title">
            {title}
          </h2>
          {busy && (
            <Spinner
              className="self-center"
              highlightColor="fill-on-text"
              backgroundColor="fill-line"
            />
          )}
          {children && <div className="text-body text-ink-muted">{children}</div>}
          {actions && (
            <div
              className={clsx(
                "flex flex-col-reverse gap-2",
                !stacked && "sm:flex-row sm:justify-end",
              )}
            >
              {actions}
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}
