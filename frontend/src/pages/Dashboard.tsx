import { useState } from "react";
import { isDemo } from "../api/client";
import { BatteryCard } from "../components/cards/BatteryCard";
import { Cameras } from "../components/cards/Cameras";
import { ChargeSourcesCard } from "../components/cards/ChargeSourcesCard";
import { EcoflowCard } from "../components/cards/EcoflowCard";
import { FridgeCard } from "../components/cards/FridgeCard";
import { ShellyCard } from "../components/cards/ShellyCard";
import { StarlinkCard } from "../components/cards/StarlinkCard";
import { WifiCard } from "../components/cards/WifiCard";
import { SettingsDrawer } from "../components/drawers/SettingsDrawer";
import { Header } from "../components/layout/Header";
import { PowerModal } from "../components/modals/PowerModal";
import { Toaster } from "../components/layout/Toaster";
import { Stack } from "../components/ui";
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
    <Stack className="min-h-dvh bg-panel-bg text-gray-900 max-w-2xl mx-auto items-stretch last:mb-8">
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
      <WifiCard />
      <BatteryCard />
      <ChargeSourcesCard />
      <EcoflowCard />
      <FridgeCard />
      <StarlinkCard />
      <Cameras />

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
