import { useState } from "react";
import { isDemo } from "../api/client";
import { BatteryCard } from "../components/cards/BatteryCard";
import { Cameras } from "../components/cards/Cameras";
import { ChargeSourcesCard } from "../components/cards/ChargeSourcesCard";
import { EcoflowCard } from "../components/cards/EcoflowCard";
import { FridgeCard } from "../components/cards/FridgeCard";
import { ShellyCard } from "../components/cards/ShellyCard";
import { WifiCard } from "../components/cards/WifiCard";
import { StarlinkCard } from "../components/cards/StarlinkCard";
import { PowerDialog } from "../components/dialogs/PowerDialog";
import { BackupDrawer } from "../components/drawers/BackupDrawer";
import { HistoryDrawer, type HistoryTab } from "../components/drawers/HistoryDrawer";
import { ModeDrawer } from "../components/drawers/ModeDrawer";
import { SystemDrawer } from "../components/drawers/SystemDrawer";
import { WifiDrawer } from "../components/drawers/WifiDrawer";
import { ActionRow } from "../components/layout/ActionRow";
import { Header } from "../components/layout/Header";
import { Toaster } from "../components/layout/Toaster";
import { Card } from "../components/ui";
import { usePolling } from "../hooks/usePolling";
import { useSettingsStore } from "../store/settings";
import { useVanStore } from "../store/van";

type DrawerName = "wifi" | "mode" | "backup" | "system" | "history";

export function Dashboard() {
  usePolling(5000);

  const lastUpdated = useVanStore((s) => s.lastUpdated);
  const error = useVanStore((s) => s.error);
  const { vanName } = useSettingsStore();
  // One drawer at a time: a drawer never opens another drawer.
  const [drawer, setDrawer] = useState<DrawerName | null>(null);
  const [historyTab, setHistoryTab] = useState<HistoryTab>("soc");
  const [powerOpen, setPowerOpen] = useState(false);
  const close = () => setDrawer(null);

  return (
    <div
      data-vc="dashboard"
      className="vc-dashboard min-h-dvh bg-page text-ink"
    >
      <main className="vc-dashboard__main mx-auto flex max-w-2xl flex-col gap-3 md:max-w-4xl">
        <Header
          isDemo={isDemo}
          vanName={vanName}
          error={error}
          lastUpdated={lastUpdated}
          onOpenMode={() => setDrawer("mode")}
          onOpenSystem={() => setDrawer("system")}
        />

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <BatteryCard
            onOpenHistory={() => {
              setHistoryTab("soc");
              setDrawer("history");
            }}
          />
          <Card vc="actions-card">
            <div className="grid grid-cols-2 items-stretch gap-3">
              <ActionRow
                onBackup={() => setDrawer("backup")}
                onPower={() => setPowerOpen(true)}
              />
              <WifiCard onOpen={() => setDrawer("wifi")} />
            </div>
          </Card>

          <ShellyCard className="md:col-span-2" />

          <ChargeSourcesCard />
          <Card vc="devices-card" title="Devices">
            <div className="grid grid-cols-2 gap-2">
              <EcoflowCard />
              <FridgeCard />
              <StarlinkCard className="col-span-2" />
            </div>
          </Card>

          <Cameras
            className="md:col-span-2"
            onOpenHistory={() => {
              setHistoryTab("photos");
              setDrawer("history");
            }}
          />
        </div>
      </main>

      <Toaster />

      <WifiDrawer open={drawer === "wifi"} onClose={close} />
      <ModeDrawer open={drawer === "mode"} onClose={close} />
      <BackupDrawer open={drawer === "backup"} onClose={close} />
      <SystemDrawer open={drawer === "system"} onClose={close} />
      <HistoryDrawer
        open={drawer === "history"}
        onClose={close}
        tab={historyTab}
        onTabChange={setHistoryTab}
      />
      <PowerDialog open={powerOpen} onClose={() => setPowerOpen(false)} />
    </div>
  );
}
