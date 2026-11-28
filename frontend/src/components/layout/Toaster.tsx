import clsx from "clsx";
import { useEffect, useRef } from "react";
import type { ToastKind } from "../../store/toast";
import { useToastStore } from "../../store/toast";
import { Icon, type IconName } from "../ui";

// Toasts float over the green tiles, so they never use the green fill. Dark
// for everything, red for errors; a lime check icon on dark says "worked".
const STYLES: Record<ToastKind, string> = {
  success: "bg-ink text-surface",
  error: "bg-danger text-surface",
  info: "bg-ink text-surface",
};

const ICON_TONE: Record<ToastKind, string> = {
  success: "text-on",
  error: "text-surface",
  info: "text-surface",
};

const ICON: Record<ToastKind, IconName> = {
  success: "check",
  error: "x",
  info: "info",
};

// Quick-action results. The icon and the message carry the meaning together,
// so color is never the only signal. Tap to dismiss.
//
// This is a popover, which lives in the browser's top layer, the same layer
// the native <dialog> drawers and dialogs use. A z-index can never lift
// something above a modal <dialog>, but a popover shown after one sits above
// it. So every change re-shows it, which moves it back on top if a drawer was
// opened after the toast appeared. (While a modal is open the page behind it
// is inert, so a toast over a drawer can't be tapped; it times out on its
// own.)
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    try {
      if (el.matches(":popover-open")) el.hidePopover();
      if (toasts.length > 0) el.showPopover();
    } catch {
      /* popover unsupported: the toasts still render, just without raising */
    }
  }, [toasts]);

  return (
    <div
      ref={ref}
      data-vc="toast"
      {...{ popover: "manual" }}
      className="fixed left-1/2 top-auto bottom-[calc(1rem+var(--safe-bottom))] m-0 h-auto w-full max-w-sm -translate-x-1/2 overflow-visible border-0 bg-transparent p-0 px-4"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col gap-2">
        {toasts.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => dismiss(t.id)}
            className={clsx(
              "flex min-h-11 w-full items-center gap-2 rounded px-3 py-2 text-left text-body shadow-overlay",
              STYLES[t.kind],
            )}
          >
            <Icon
              name={ICON[t.kind]}
              className={clsx("size-4 shrink-0", ICON_TONE[t.kind])}
            />
            <span className="flex-1">{t.message}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
