import { BatteryCard } from "../components/BatteryCard";
import { Cameras } from "../components/Cameras";
import { ChargeSourcesCard } from "../components/ChargeSourcesCard";
import { HistoryCard } from "../components/HistoryCard";
import { ModeSelector } from "../components/ModeSelector";
import { ShellyPanel } from "../components/ShellyPanel";
import { ThemeToggle } from "../components/ThemeToggle";
import { usePolling } from "../hooks/usePolling";
import { useVanStore } from "../store/van";
import { useSettingsStore } from "../store/settings";

export function Dashboard() {
  usePolling(5000);

  const lastUpdated = useVanStore((s) => s.lastUpdated);
  const error       = useVanStore((s) => s.error);
  const { vanName, gap, spacing } = useSettingsStore();

  // Dynamic values as inline styles — Tailwind JIT can't safely generate these
  const outerStyle  = { padding: `${gap * 4}px`, gap: `${gap * 4}px` };
  const innerStyle  = { padding: `${spacing * 4}px`, gap: `${spacing * 4}px` };
  const cardClass   = "flex flex-col bg-panel-surface border border-panel-border rounded";

  return (
    <div
      className="min-h-screen bg-panel-bg text-zinc-100 max-w-2xl mx-auto flex flex-col items-stretch"
      style={outerStyle}
    >
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-mono font-bold text-zinc-600 tracking-tight">
          {vanName}
        </h1>
        <div className="flex items-center gap-2">
          <div className="text-right">
            {error && (
              <div className="text-xs font-mono text-red-500 mb-1">⚠ {error}</div>
            )}
            {lastUpdated && (
              <div className="text-xs font-mono text-zinc-600">
                {lastUpdated.toLocaleTimeString()}
              </div>
            )}
          </div>
          <ThemeToggle />
        </div>
      </header>

      <ShellyPanel    className={cardClass} style={innerStyle} />
      <BatteryCard    className={cardClass} style={innerStyle} />
      <ChargeSourcesCard className={cardClass} style={innerStyle} />
      <HistoryCard    className={cardClass} style={innerStyle} />
      <Cameras        className={cardClass} style={innerStyle} />
      <ModeSelector   className={cardClass} style={innerStyle} />
    </div>
  );
}
