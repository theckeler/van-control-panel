import clsx from 'clsx'

interface ConfirmModalProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Modal */}
      <div className="relative bg-panel-surface border border-panel-border rounded-xl p-6 w-full max-w-sm shadow-xl">
        <h2 className="text-sm font-mono font-semibold text-zinc-100 mb-2">
          {title}
        </h2>
        <p className="text-xs font-mono text-zinc-400 leading-relaxed mb-6">
          {message}
        </p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="text-xs font-mono px-4 py-2 rounded-lg border border-panel-border text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={clsx(
              'text-xs font-mono px-4 py-2 rounded-lg transition-colors',
              danger
                ? 'bg-red-900/60 hover:bg-red-800/60 text-red-300 border border-red-800'
                : 'bg-amber-900/60 hover:bg-amber-800/60 text-amber-300 border border-amber-800'
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
