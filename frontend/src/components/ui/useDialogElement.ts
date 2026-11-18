import { useEffect, useRef } from "react";

// Shared behavior for Drawer and Dialog, built on the native <dialog>.
// showModal() gives the focus trap, inert page, top layer and Esc. This adds
// what it does not: calling onClose from Esc and a backdrop tap (unless the
// dialog is not dismissible), and locking page scroll while open. Focus
// returns to the trigger on close, which the browser does for us.
export function useDialogElement(
  open: boolean,
  onClose: () => void,
  dismissible: boolean,
) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onCancel = (e: Event) => {
      // Esc. Always stop the browser closing it itself: `open` is the source
      // of truth, so the parent decides.
      e.preventDefault();
      if (dismissible) onClose();
    };
    const onClick = (e: MouseEvent) => {
      // The dialog element is the backdrop area; its panel is a child.
      if (e.target === el && dismissible) onClose();
    };
    el.addEventListener("cancel", onCancel);
    el.addEventListener("click", onClick);
    return () => {
      el.removeEventListener("cancel", onCancel);
      el.removeEventListener("click", onClick);
    };
  }, [onClose, dismissible]);

  return ref;
}
