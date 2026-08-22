import clsx from 'clsx'
import { useToastStore } from '../store/toast'
import type { ToastKind } from '../store/toast'

const STYLES: Record<ToastKind, string> = {
  success: 'bg-emerald-950/90 border-emerald-800 text-emerald-300',
  error:   'bg-red-950/90 border-red-800 text-red-300',
  info:    'bg-zinc-900/90 border-panel-border text-zinc-300',
}

const GLYPH: Record<ToastKind, string> = {
  success: '\u2713',
  error:   '\u26a0',
  info:    '\u2022',
}

export function Toaster() {
  const toasts  = useToastStore(s => s.toasts)
  const dismiss = useToastStore(s => s.dismiss)

  if (toasts.length === 0) return null

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-full max-w-sm px-4"
      role="status"
      aria-live="polite"
    >
      {toasts.map(t => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={clsx(
            'flex items-center gap-2 w-full text-left',
            'text-xs font-mono px-3 py-2.5 rounded-lg border backdrop-blur-sm shadow-lg',
            STYLES[t.kind],
          )}
        >
          <span aria-hidden="true" className="shrink-0">{GLYPH[t.kind]}</span>
          <span className="flex-1">{t.message}</span>
        </button>
      ))}
    </div>
  )
}
