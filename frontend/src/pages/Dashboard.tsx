import { useState } from "react";
import { isDemo } from "../api/client";
import { BatteryCard } from "../components/cards/BatteryCard";
// import { Cameras } from "../components/Cameras"; // disabled 2026-08-31 — needs ffmpeg, which OOM-crashed the Pi (1GB RAM) mid-install. Revisit before re-enabling.
import { ChargeSourcesCard } from "../components/cards/ChargeSourcesCard";
import { EcoflowCard } from "../components/cards/EcoflowCard";
import { FridgeCard } from "../components/cards/FridgeCard";
// import { HistoryCard } from "../components/cards/HistoryCard";
import { ShellyCard } from "../components/cards/ShellyCard";
import { StarlinkCard } from "../components/cards/StarlinkCard";
import { SettingsDrawer } from "../components/drawers/SettingsDrawer";
import { Header } from "../components/Header";
import { PowerModal } from "../components/modals/PowerModal";
import { Toaster } from "../components/Toaster";
import { Stack } from "../components/ui";
import { WifiPanel } from "../components/WifiPanel";
import { usePolling } from "../hooks/usePolling";
import { useSettingsStore } from "../store/settings";
import { useVanStore } from "../store/van";

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

      <Header
        isDemo={isDemo}
        vanName={vanName}
        error={error}
        lastUpdated={lastUpdated}
        setSettingsOpen={setSettingsOpen}
      />

      <ShellyCard />
      <WifiPanel />
      <BatteryCard />
      <ChargeSourcesCard />
      <EcoflowCard />
      <FridgeCard />
      <StarlinkCard />
      {/* <HistoryCard /> */}
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
    </Stack>
  );
}
