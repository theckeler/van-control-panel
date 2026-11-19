import { useVanStore } from "../../store/van";
import { Card, SwitchTile, type SwitchState } from "../ui";

export function ShellyCard({ className }: { className?: string }) {
  const shellys = useVanStore((s) => s.shellys);
  const toggleShelly = useVanStore((s) => s.toggleShelly);
  const recheckShelly = useVanStore((s) => s.recheckShelly);
  const rechecking = useVanStore((s) => s.rechecking);
  const installed = shellys.filter((u) => u.installed !== false);

  return (
    <Card vc="shelly-card" title="Circuits" className={className}>
      {!installed.length ? (
        <p className="text-body text-ink-muted">Loading circuits…</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {installed.map((unit) => {
            const state: SwitchState =
              unit.reachable === false ? "offline" : unit.on ? "on" : "off";
            return (
              <SwitchTile
                key={unit.id}
                label={unit.label}
                state={state}
                onToggle={() => toggleShelly(unit.id, !unit.on)}
                onRecheck={() => recheckShelly(unit.id)}
                checking={rechecking.includes(unit.id)}
              />
            );
          })}
        </div>
      )}
    </Card>
  );
}
