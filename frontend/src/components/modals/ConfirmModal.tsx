import clsx from "clsx";
import { useModalBehavior } from "../../hooks/useModalBehavior";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const dialogRef = useModalBehavior(open, onCancel);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden="true"
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby="confirm-modal-message"
        tabIndex={-1}
        className="relative bg-panel-surface border border-panel-border rounded p-6 w-full max-w-sm shadow-xl focus:outline-none"
      >
        <h2
          id="confirm-modal-title"
          className="text-sm  font-semibold text-zinc-100 mb-2"
        >
          {title}
        </h2>
        <p
          id="confirm-modal-message"
          className="text-gray-900 leading-relaxed mb-6"
        >
          {message}
        </p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded border border-gray-800 text-gray-800"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={clsx(
              "px-4 py-2 rounded transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-panel-surface",
              danger ? "bg-red-900" : "bg-amber-900",
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
