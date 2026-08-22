import { BatteryCard } from "../components/BatteryCard";
import { Cameras } from "../components/Cameras";
import { ChargeSourcesCard } from "../components/ChargeSourcesCard";
import { HistoryCard } from "../components/HistoryCard";
import { ModeSelector } from "../components/ModeSelector";
import { ShellyPanel } from "../components/ShellyPanel";
import { ThemeToggle } from "../components/ThemeToggle";
import { ConfirmModal } from "../components/ConfirmModal";
import { usePolling } from "../hooks/usePolling";
import { useVanStore } from "../store/van";
import { useSettingsStore } from "../store/settings";
import { useState } from "react";
import { api } from "../api/client";

type PowerAction = "shutdown" | "reboot" | null;

function PowerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
      <line x1="12" y1="2" x2="12" y2="12" />
    </svg>
  );
}

const POWER_COPY: Record<NonNullable<PowerAction>, { title: string; message: string; label: string }> = {
  shutdown: {
    title: "Shut down the Pi?",
    message: "The Pi will power off. The dashboard will be unavailable until you restore power. Make sure to flip the house disconnect only after the Pi has shut down.",
    label: "Shut Down",
  },
  reboot: {
    title: "Reboot the Pi?",
    message: "The Pi will restart. The dashboard will be unavailable for about 30 seconds.",
    label: "Reboot",
  },
};

export function Dashboard() {
  usePolling(5000);

  const lastUpdated = useVanStore((s) => s.lastUpdated);
  const error       = useVanStore((s) => s.error);
  const { vanName, gap, spacing } = useSettingsStore();
  const [powerAction, setPowerAction] = useState<PowerAction>(null);
  const [powerBusy, setPowerBusy] = useState(false);

  const outerStyle = { padding: `${gap * 4}px`, gap: `${gap * 4}px` };
  const innerStyle = { padding: `${spacing * 4}px`, gap: `${spacing * 4}px` };
  const cardClass  = "flex flex-col bg-panel-surface border border-panel-border rounded";

  const handlePowerConfirm = async () => {
    if (!powerAction) return;
    setPowerBusy(true);
    try {
      if (powerAction === "shutdown") await api.system.shutdown();
      if (powerAction === "reboot")   await api.system.reboot();
    } finally {
      setPowerBusy(false);
      setPowerAction(null);
    }
  };

  return (
    <div
      className="min-h-screen bg-panel-bg text-zinc-100 max-w-2xl mx-auto flex flex-col items-stretch"
      style={outerStyle}
    >
      {powerAction && (
        <ConfirmModal
          open
          title={POWER_COPY[powerAction].title}
          message={POWER_COPY[powerAction].message}
          confirmLabel={powerBusy ? "…" : POWER_COPY[powerAction].label}
          danger={powerAction === "shutdown"}
          onConfirm={handlePowerConfirm}
          onCancel={() => setPowerAction(null)}
        />
      )}

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
          {/* Power button — opens shutdown/reboot picker */}
          <div className="relative group">
            <button
              className="p-1.5 rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
              aria-label="Power options"
            >
              <PowerIcon />
            </button>
            {/* Dropdown on hover */}
            <div className="absolute right-0 top-full mt-1 hidden group-hover:flex flex-col bg-panel-surface border border-panel-border rounded-lg shadow-xl overflow-hidden z-40 min-w-32">
              <button
                onClick={() => setPowerAction("reboot")}
                className="text-xs font-mono px-4 py-2.5 text-left text-zinc-300 hover:bg-zinc-800 transition-colors"
              >
                ↺ Reboot
              </button>
              <button
                onClick={() => setPowerAction("shutdown")}
                className="text-xs font-mono px-4 py-2.5 text-left text-red-400 hover:bg-zinc-800 transition-colors"
              >
                ⏻ Shut Down
              </button>
            </div>
          </div>
        </div>
      </header>

      <ShellyPanel       className={cardClass} style={innerStyle} />
      <BatteryCard       className={cardClass} style={innerStyle} />
      <ChargeSourcesCard className={cardClass} style={innerStyle} />
      <HistoryCard       className={cardClass} style={innerStyle} />
      <Cameras           className={cardClass} style={innerStyle} />
      <ModeSelector      className={cardClass} style={innerStyle} />
    </div>
  );
}
