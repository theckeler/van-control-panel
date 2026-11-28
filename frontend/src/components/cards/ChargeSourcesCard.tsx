import { useVanStore } from "../../store/van";
import { Card, InfoTile } from "../ui";

export function ChargeSourcesCard({ className }: { className?: string }) {
  const mppt = useVanStore((s) => s.mppt);
  const shore = useVanStore((s) => s.shore);
  // const orion = useVanStore((s) => s.orion);   // Alternator row hidden: Orion-Tr is non-smart

  const solarActive = !!mppt?.panel_power && mppt.panel_power > 0;

  return (
    <Card vc="charge-sources-card" title="Charging" className={className}>
      <div className="grid grid-cols-2 gap-2">
        <InfoTile
          vc="solar-tile"
          icon="sun"
          name="Solar"
          state={!mppt ? "offline" : solarActive ? "on" : "off"}
          value={mppt ? `${mppt.panel_power.toFixed(0)}W` : undefined}
          detail={
            mppt
              ? `${mppt.charge_state} · ${mppt.daily_yield.toFixed(0)}Wh today`
              : "No data"
          }
        />
        <InfoTile
          vc="shore-tile"
          icon="plug"
          name="Shore"
          state={shore?.connected ? "on" : "off"}
          value={shore?.connected ? `${shore.charge_current.toFixed(1)}A` : undefined}
          detail={shore?.connected ? shore.charge_mode : "Unplugged"}
        />
      </div>
    </Card>
  );
}
