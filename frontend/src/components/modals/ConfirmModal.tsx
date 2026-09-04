import clsx from "clsx";
import { useModalBehavior } from "../../hooks/useModalBehavior";
import { Button } from "../ui/Button";

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
          className="text-sm font-semibold text-gray-900 mb-2"
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
          <Button onClick={onCancel}>{cancelLabel}</Button>
          <Button
            onClick={onConfirm}
            variant={danger ? "danger" : "ghost"}
            className={clsx(!danger && "bg-amber-900 text-white")}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
