import clsx from "clsx";
import { useModalBehavior } from "../../hooks/useModalBehavior";

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
  const dialogRef = useModalBehavior(open, onCancel);

  if (!open) return null;

  const determinate = typeof percent === "number";
  const pct = determinate ? Math.max(0, Math.min(100, percent)) : 0;

  // Pie geometry: a full circle whose fill is drawn via a conic-gradient for
  // the determinate case, and via a rotating masked wedge for indeterminate.
  const R = 42; // radius in the 100x100 viewBox
  const C = 2 * Math.PI * R; // circumference for the stroke-dash technique
  const offset = C * (1 - pct / 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        aria-hidden="true"
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="progress-modal-title"
        tabIndex={-1}
        className="relative bg-panel-surface border border-panel-border rounded p-6 w-full max-w-sm shadow-xl focus:outline-none flex flex-col items-center"
      >
        <h2
          id="progress-modal-title"
          className="text-sm font-semibold text-zinc-100 mb-4 self-start"
        >
          {title}
        </h2>

        <div className="relative w-28 h-28 mb-4">
          <svg
            viewBox="0 0 100 100"
            className={clsx(
              "w-full h-full -rotate-90",
              !determinate && "animate-spin",
            )}
            style={!determinate ? { animationDuration: "1.1s" } : undefined}
            role="progressbar"
            aria-valuenow={determinate ? pct : undefined}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            {/* track */}
            <circle
              cx="50"
              cy="50"
              r={R}
              fill="none"
              className="stroke-panel-border"
              strokeWidth="12"
            />
            {/* fill — a thick stroke that reads as a pie wedge filling round */}
            <circle
              cx="50"
              cy="50"
              r={R}
              fill="none"
              className="stroke-charge-dc transition-[stroke-dashoffset] duration-300 ease-out"
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={determinate ? offset : C * 0.72}
            />
          </svg>

          {determinate && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-lg font-semibold text-zinc-100">
                {Math.round(pct)}%
              </span>
            </div>
          )}
        </div>

        {message && (
          <p className="text-gray-900 text-sm text-center mb-5">{message}</p>
        )}

        <button
          type="button"
          onClick={onCancel}
          className="w-full px-4 py-2 rounded border border-gray-800 text-gray-800"
        >
          {cancelLabel}
        </button>
      </div>
    </div>
  );
}
