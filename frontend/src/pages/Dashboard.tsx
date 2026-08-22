import { useState } from "react";
import { isDemo } from "../api/client";
import { BatteryCard } from "../components/BatteryCard";
import { Cameras } from "../components/Cameras";
import { ChargeSourcesCard } from "../components/ChargeSourcesCard";
import { HistoryCard } from "../components/HistoryCard";
import { ModeSelector } from "../components/ModeSelector";
import { PowerModal } from "../components/PowerModal";
import { ShellyPanel } from "../components/ShellyPanel";
import { ThemeToggle } from "../components/ThemeToggle";
import { Toaster } from "../components/Toaster";
import { usePolling } from "../hooks/usePolling";
import { useSettingsStore } from "../store/settings";
import { useVanStore } from "../store/van";

function PowerIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-4 h-4"
    >
      <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
      <line x1="12" y1="2" x2="12" y2="12" />
    </svg>
  );
}

export function Dashboard() {
  usePolling(5000);

  const lastUpdated = useVanStore((s) => s.lastUpdated);
  const error = useVanStore((s) => s.error);
  const { vanName, gap, spacing } = useSettingsStore();
  const [powerOpen, setPowerOpen] = useState(false);

  const outerStyle = { padding: `${gap * 4}px`, gap: `${gap * 4}px` };
  const innerStyle = { padding: `${spacing * 4}px`, gap: `${spacing * 4}px` };
  const cardClass =
    "flex flex-col bg-panel-surface border border-panel-border rounded";
  const buttonClass =
    "rounded-lg p-1.5 border border-panel-border text-zinc-500 hover:border-zinc-500 hover:text-zinc-300 transition-colors";

  return (
    <div
      className="min-h-screen bg-panel-bg text-zinc-100 max-w-2xl mx-auto flex flex-col items-stretch"
      style={outerStyle}
    >
      <PowerModal open={powerOpen} onClose={() => setPowerOpen(false)} />
      <Toaster />

      <header className="flex items-center justify-between">
        <h1 className="text-lg font-mono font-bold text-zinc-600 tracking-tight">
          {vanName}
          {isDemo && (
            <span className="ml-2 px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-widest text-amber-500 border border-amber-500/40 rounded align-middle">
              demo
            </span>
          )}
        </h1>
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
          <ThemeToggle className={buttonClass} />
          <button
            onClick={() => setPowerOpen(true)}
            className={buttonClass}
            aria-label="Power options"
          >
            <PowerIcon />
          </button>
        </div>
      </header>

      <ShellyPanel className={cardClass} style={innerStyle} />
      <BatteryCard className={cardClass} style={innerStyle} />
      <ChargeSourcesCard className={cardClass} style={innerStyle} />
      <HistoryCard className={cardClass} style={innerStyle} />
      <Cameras className={cardClass} style={innerStyle} />
      <ModeSelector className={cardClass} style={innerStyle} />
    </div>
  );
}
