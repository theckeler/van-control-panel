import { useVanStore } from "../../store/van";
import { Card, DeviceRow } from "../ui";

export function ChargeSourcesCard({ className }: { className?: string }) {
  const mppt = useVanStore((s) => s.mppt);
  const shore = useVanStore((s) => s.shore);
  // const orion = useVanStore((s) => s.orion);   // Alternator row hidden: Orion-Tr is non-smart

  const solarActive = !!mppt?.panel_power && mppt.panel_power > 0;

  return (
    <Card vc="charge-sources-card" title="Charging" className={className}>
      <DeviceRow
        vc="solar-row"
        name="Solar"
        state={!mppt ? "offline" : solarActive ? "on" : "off"}
        value={mppt ? `${mppt.panel_power.toFixed(0)}W` : undefined}
        detail={
          mppt
            ? `${mppt.charge_state} · ${mppt.daily_yield.toFixed(0)}Wh today`
            : "No data"
        }
      />
      <DeviceRow
        vc="shore-row"
        name="Shore"
        state={shore?.connected ? "on" : "off"}
        value={shore?.connected ? `${shore.charge_current.toFixed(1)}A` : undefined}
        detail={shore?.connected ? shore.charge_mode : "Unplugged"}
      />
    </Card>
  );
}
