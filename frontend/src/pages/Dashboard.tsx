import { BatteryCard } from "../components/BatteryCard";
import { Cameras } from "../components/Cameras";
import { ChargeSourcesCard } from "../components/ChargeSourcesCard";
import { HistoryCard } from "../components/HistoryCard";
import { ModeSelector } from "../components/ModeSelector";
import { ShellyPanel } from "../components/ShellyPanel";
import { ThemeToggle } from "../components/ThemeToggle";
import { usePolling } from "../hooks/usePolling";
import { useVanStore } from "../store/van";

export function Dashboard() {
  usePolling(5000);
  const van = "Twitch";
  const lastUpdated = useVanStore((s) => s.lastUpdated);
  const error = useVanStore((s) => s.error);
  const setSpacingGap = 2;
  const componentCSS = `flex flex-col gap-${setSpacingGap} bg-panel-surface border border-panel-border rounded p-${setSpacingGap} `;

  return (
    <div
      className={`min-h-screen bg-panel-bg text-zinc-100 p-${setSpacingGap * 2} max-w-2xl mx-auto flex flex-col items-stretch gap-${setSpacingGap * 2}`}
    >
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-mono font-bold text-zinc-600 tracking-tight">
            {van || "Van Control Panel"}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            {error && (
              <div className="text-xs font-mono text-red-500 mb-1">
                ⚠ {error}
              </div>
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

      <ShellyPanel className={componentCSS} />
      <BatteryCard className={componentCSS} />
      <ChargeSourcesCard className={componentCSS} />
      <Cameras className={componentCSS} />
      <ModeSelector className={componentCSS} />
      <HistoryCard className={componentCSS} />
    </div>
  );
}
