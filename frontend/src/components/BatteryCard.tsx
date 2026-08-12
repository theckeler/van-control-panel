import { useVanStore } from '../store/van'
import clsx from 'clsx'

export function BatteryCard() {
  const battery = useVanStore(s => s.battery)

  if (!battery) return <CardSkeleton label="Battery" />

  const socColor = battery.soc > 50
    ? 'text-soc-good'
    : battery.soc > 20
    ? 'text-soc-mid'
    : 'text-soc-low'

  const isCharging = battery.current > 0
  const drawW = Math.abs(battery.current * battery.voltage).toFixed(0)

  return (
    <div className="bg-panel-surface border border-panel-border rounded-xl p-5">
      <div className="flex items-start justify-between mb-4">
        <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest">Battery</span>
        <span className={clsx('text-xs font-mono', battery.connected ? 'text-green-500' : 'text-red-500')}>
          {battery.connected ? '● connected' : '○ offline'}
        </span>
      </div>

      <div className={clsx('text-6xl font-mono font-bold tracking-tight', socColor)}>
        {battery.soc.toFixed(1)}<span className="text-2xl ml-1">%</span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <Stat label="Voltage" value={`${battery.voltage.toFixed(2)}V`} />
        <Stat label={isCharging ? 'Charging' : 'Draw'} value={`${drawW}W`} highlight={isCharging ? 'charge' : 'draw'} />
        <Stat label="Temp" value={`${battery.temperature.toFixed(1)}°C`} />
      </div>

      <div className="mt-4">
        <div className="flex justify-between text-xs font-mono text-zinc-600 mb-1">
          <span>0%</span><span>100%</span>
        </div>
        <div className="h-2 bg-panel-bg rounded-full overflow-hidden">
          <div
            className={clsx('h-full rounded-full transition-all duration-700', {
              'bg-soc-good': battery.soc > 50,
              'bg-soc-mid': battery.soc > 20 && battery.soc <= 50,
              'bg-soc-low': battery.soc <= 20,
            })}
            style={{ width: `${battery.soc}%` }}
          />
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: 'charge' | 'draw' }) {
  return (
    <div className="bg-panel-bg rounded-lg p-3">
      <div className="text-xs font-mono text-zinc-600 mb-1">{label}</div>
      <div className={clsx('text-sm font-mono font-semibold', {
        'text-charge-solar': highlight === 'charge',
        'text-soc-low': highlight === 'draw',
        'text-zinc-200': !highlight,
      })}>
        {value}
      </div>
    </div>
  )
}

function CardSkeleton({ label }: { label: string }) {
  return (
    <div className="bg-panel-surface border border-panel-border rounded-xl p-5 animate-pulse">
      <div className="text-xs font-mono text-zinc-600 uppercase tracking-widest mb-4">{label}</div>
      <div className="h-16 bg-panel-bg rounded-lg" />
    </div>
  )
}
