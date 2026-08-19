import { BatteryCard } from "../components/BatteryCard";
import { Cameras } from "../components/Cameras";
import { ChargeSourcesCard } from "../components/ChargeSourcesCard";
import { ModeSelector } from "../components/ModeSelector";
import { ShellyPanel } from "../components/ShellyPanel";
import { ThemeToggle } from "../components/ThemeToggle";
import { usePolling } from "../hooks/usePolling";
import { useVanStore } from "../store/van";

export function Dashboard() {
  usePolling(5000);
  const lastUpdated = useVanStore((s) => s.lastUpdated);
  const error = useVanStore((s) => s.error);

  return (
    <div className="min-h-screen bg-panel-bg text-zinc-100 p-4 max-w-2xl mx-auto">
      <header className="flex items-center justify-between mb-4 pt-2">
        <div>
          <h1 className="text-lg font-mono font-bold text-zinc-100 tracking-tight">
            Van Control
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

      <ModeSelector />

      <div className="mt-4">
        <ShellyPanel />
      </div>

      <div className="mt-4">
        <BatteryCard />
      </div>

      <div className="mt-4">
        <ChargeSourcesCard />
      </div>

      <div className="mt-4">
        <Cameras />
      </div>
    </div>
  );
}
