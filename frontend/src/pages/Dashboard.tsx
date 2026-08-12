import { usePolling } from '../hooks/usePolling'
import { useVanStore } from '../store/van'
import { BatteryCard } from '../components/BatteryCard'
import { ChargeSourcesCard } from '../components/ChargeSourcesCard'
import { ShellyPanel } from '../components/ShellyPanel'
import { ModeSelector } from '../components/ModeSelector'

export function Dashboard() {
  usePolling(5000)
  const lastUpdated = useVanStore(s => s.lastUpdated)
  const error = useVanStore(s => s.error)

  return (
    <div className="min-h-screen bg-panel-bg text-zinc-100 p-4 max-w-2xl mx-auto">

      {/* Header */}
      <header className="flex items-center justify-between mb-6 pt-2">
        <div>
          <h1 className="text-lg font-mono font-bold text-zinc-100 tracking-tight">Van Control</h1>
          <p className="text-xs font-mono text-zinc-600">VS30 AWD 144"</p>
        </div>
        <div className="text-right">
          {error && <div className="text-xs font-mono text-red-500 mb-1">⚠ {error}</div>}
          {lastUpdated && (
            <div className="text-xs font-mono text-zinc-600">
              {lastUpdated.toLocaleTimeString()}
            </div>
          )}
        </div>
      </header>

      {/* Mode selector */}
      <ModeSelector />

      {/* Battery */}
      <div className="mt-4">
        <BatteryCard />
      </div>

      {/* Charge sources */}
      <div className="mt-4">
        <ChargeSourcesCard />
      </div>

      {/* Automation */}
      <div className="mt-4">
        <ShellyPanel />
      </div>

      {/* Camera link */}
      <div className="mt-4">
        <a
          href="/cameras"
          className="block bg-panel-surface border border-panel-border rounded-xl p-5 hover:border-zinc-600 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-mono text-zinc-500 uppercase tracking-widest">Cameras</div>
              <div className="text-sm font-mono text-zinc-300 mt-1">Interior + Exterior · Latest stills</div>
            </div>
            <span className="text-zinc-600 font-mono">→</span>
          </div>
        </a>
      </div>

    </div>
  )
}
