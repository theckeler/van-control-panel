import { useState } from "react";
import { isDemo } from "../api/client";
import { BatteryCard } from "../components/cards/BatteryCard";
// import { Cameras } from "../components/Cameras"; // disabled 2026-08-31 — needs ffmpeg, which OOM-crashed the Pi (1GB RAM) mid-install. Revisit before re-enabling.
import { ChargeSourcesCard } from "../components/cards/ChargeSourcesCard";
import { EcoflowCard } from "../components/cards/EcoflowCard";
import { FridgeCard } from "../components/cards/FridgeCard";
import { HistoryCard } from "../components/cards/HistoryCard";
import { ShellyCard } from "../components/cards/ShellyCard";
import { StarlinkCard } from "../components/cards/StarlinkCard";
import { SettingsDrawer } from "../components/drawers/SettingsDrawer";
import { PowerModal } from "../components/modals/PowerModal";
import { Toaster } from "../components/Toaster";
import { Button, Stack } from "../components/ui";
import { WifiBadge } from "../components/WifiBadge";
import { WifiPanel } from "../components/WifiPanel";
import { usePolling } from "../hooks/usePolling";
import { useSettingsStore } from "../store/settings";
import { useVanStore } from "../store/van";

function GearIcon() {
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
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export function Dashboard() {
  usePolling(5000);

  const lastUpdated = useVanStore((s) => s.lastUpdated);
  const error = useVanStore((s) => s.error);
  const { vanName } = useSettingsStore();
  const [powerOpen, setPowerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <Stack className="min-h-screen bg-panel-bg text-zinc-100 max-w-2xl mx-auto items-stretch">
      <PowerModal open={powerOpen} onClose={() => setPowerOpen(false)} />
      <Toaster />

      <header className="flex items-center justify-between pt-6">
        <h1 className="text-lg  font-bold text-zinc-600 tracking-tight">
          {(isDemo && "Demo Van") || vanName}
          {isDemo && (
            <span className="ml-2 px-1.5 py-0.5 text-[10px]  uppercase tracking-widest text-amber-500 border border-amber-500/40 rounded align-middle">
              demo
            </span>
          )}
        </h1>
        <div className="flex items-center gap-2">
          <div className="text-right">
            {error && (
              <div className="text-xs  text-red-500 mb-1">⚠ {error}</div>
            )}
            {lastUpdated && (
              <div className="text-xs  text-zinc-600">
                {lastUpdated.toLocaleTimeString()}
              </div>
            )}
            <WifiBadge className="block" />
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
          >
            <GearIcon />
          </Button>
        </div>
      </header>

      <ShellyCard />
      <WifiPanel />
      <BatteryCard />
      <ChargeSourcesCard />
      <EcoflowCard />
      <FridgeCard />
      <StarlinkCard />
      <HistoryCard />
      {/* <Cameras /> */}
      {/* <ModeSelector /> */}

      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onPower={() => {
          setSettingsOpen(false);
          setPowerOpen(true);
        }}
      />
      <PowerModal open={powerOpen} onClose={() => setPowerOpen(false)} />
      <Toaster />
    </Stack>
  );
}
