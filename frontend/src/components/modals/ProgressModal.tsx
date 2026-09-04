import { Button, Modal, Spinner } from "../ui";

interface ProgressModalProps {
  open: boolean;
  title: string;
  /** Optional status line under the pie, e.g. "Scanning for networks…". */
  message?: string;
  /**
   * 0–100. When provided, the pie fills to this fraction (determinate).
   * When omitted, the pie spins as an indeterminate "working" indicator.
   */
  percent?: number;
  cancelLabel?: string;
  onCancel: () => void;
}

/**
 * A progress modal that layers on top of the dashboard, matching ConfirmModal's
 * overlay/focus behaviour. Shows a "pizza pie" fill — a circle that fills
 * clockwise like a pie chart — determinate when `percent` is given, spinning
 * when it isn't. Always cancellable.
 */
export function ProgressModal({
  open,
  title,
  message,
  percent,
  cancelLabel = "Cancel",
  onCancel,
}: ProgressModalProps) {
  if (!open) return null;

  const determinate = typeof percent === "number";
  const pct = determinate ? Math.max(0, Math.min(100, percent)) : 0;

  return (
    <Modal open={open} className="gap-2 justify-center">
      <h2 id="progress-modal-title" className="text-black">
        {title}
      </h2>

      <Spinner />

      {determinate && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-semibold text-gray-900">
            {Math.round(pct)}%
          </span>
        </div>
      )}

      {message && (
        <p className="text-gray-900 text-sm text-center">{message}</p>
      )}

      <Button onClick={onCancel}>{cancelLabel}</Button>
    </Modal>
  );
}
