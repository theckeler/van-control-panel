import { useVanStore } from "../store/van";
import { Label, Panel, SelectableTile, StatusDot } from "./ui";

export function ShellyPanel({ className }: { className?: string }) {
  const shellys = useVanStore((s) => s.shellys);
  const toggleShelly = useVanStore((s) => s.toggleShelly);

  return (
    <Panel className={className}>
      {!shellys.length ? (
        <div className="text-xs font-mono text-zinc-600">
          Loading circuits...
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {shellys.map((unit) => {
            const offline = unit.reachable === false;
            return (
              <SelectableTile
                key={unit.id}
                selected={unit.on}
                disabled={offline}
                onClick={() => toggleShelly(unit.id, !unit.on)}
              >
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-inherit">{unit.label}</Label>
                  <StatusDot on={unit.on && !offline} />
                </div>
                <div className="text-lg font-mono font-semibold">
                  {offline ? "—" : unit.on ? "ON" : "OFF"}
                </div>
                {offline && (
                  <div className="text-[10px] font-mono text-zinc-600 mt-1">
                    unreachable
                  </div>
                )}
              </SelectableTile>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
