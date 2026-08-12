import { useVanStore } from '../store/van'
import clsx from 'clsx'

export function ShellyPanel() {
  const shellys = useVanStore(s => s.shellys)
  const toggleShelly = useVanStore(s => s.toggleShelly)

  if (!shellys.length) return (
    <div className="bg-panel-surface border border-panel-border rounded-xl p-5">
      <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest">Automation</span>
      <div className="mt-4 text-xs font-mono text-zinc-600">Loading circuits...</div>
    </div>
  )

  return (
    <div className="bg-panel-surface border border-panel-border rounded-xl p-5">
      <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest">Automation</span>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {shellys.map(unit => (
          <button
            key={unit.id}
            onClick={() => toggleShelly(unit.id, !unit.on)}
            className={clsx(
              'rounded-lg p-4 text-left transition-all duration-200 border',
              unit.on
                ? 'bg-accent/10 border-accent/40 text-accent'
                : 'bg-panel-bg border-panel-border text-zinc-500 hover:border-zinc-600'
            )}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono uppercase tracking-wider">{unit.label}</span>
              <span className={clsx('w-2 h-2 rounded-full', unit.on ? 'bg-accent' : 'bg-zinc-700')} />
            </div>
            <div className="text-lg font-mono font-semibold">
              {unit.on ? 'ON' : 'OFF'}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
