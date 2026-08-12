import { useVanStore } from '../store/van'
import type { ModeName } from '../types'
import clsx from 'clsx'

const MODE_ICONS: Record<ModeName, string> = {
  storage: '🔒',
  camp: '⛺',
  trail: '🚵',
  in_town: '🏙️',
}

export function ModeSelector() {
  const mode = useVanStore(s => s.mode)
  const setMode = useVanStore(s => s.setMode)

  if (!mode) return null

  return (
    <div className="bg-panel-surface border border-panel-border rounded-xl p-5">
      <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest">Mode</span>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {mode.available.map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={clsx(
              'rounded-lg p-3 text-center transition-all duration-200 border',
              m === mode.current
                ? 'bg-accent/15 border-accent text-accent'
                : 'bg-panel-bg border-panel-border text-zinc-500 hover:border-zinc-500 hover:text-zinc-300'
            )}
          >
            <div className="text-xl mb-1">{MODE_ICONS[m as ModeName]}</div>
            <div className="text-xs font-mono capitalize">{m.replace('_', ' ')}</div>
          </button>
        ))}
      </div>
      <div className="mt-3 text-xs font-mono text-zinc-600">
        {mode.config.description}
      </div>
    </div>
  )
}
