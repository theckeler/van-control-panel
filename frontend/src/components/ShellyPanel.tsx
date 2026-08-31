import { useVanStore } from "../store/van";
import { Label, Panel, SelectableTile, StatusDot } from "./ui";

export function ShellyPanel({ className }: { className?: string }) {
  const shellys = useVanStore((s) => s.shellys);
  const toggleShelly = useVanStore((s) => s.toggleShelly);

  const installed = shellys.filter((u) => u.installed !== false);

  return (
    <Panel className={className}>
      {!installed.length ? (
        <div className="text-xs font-mono text-zinc-600">
          Loading circuits...
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {installed.map((unit) => {
            const offline = unit.reachable === false;
            const statusText = offline ? "unreachable" : unit.on ? "ON" : "OFF";

            return (
              <SelectableTile
                key={unit.id}
                selected={unit.on}
                disabled={offline}
                onClick={() => toggleShelly(unit.id, !unit.on)}
                className="bg-gradient-to-r from-gray-200 to-gray-100 disabled:bg-gray-200 p-4 rounded flex flex-col gap-1 aria-pressed:bg-gradient-to-r aria-pressed:from-lime-500 aria-pressed:to-lime-600"
              >
                <div className="flex items-center justify-between">
                  <Label className="text-black font-bold text-lg">
                    {unit.label}
                  </Label>
                  <StatusDot tone="success" on={unit.on && !offline} />
                </div>
                <div
                  className={`text-xl ${unit.on ? "text-white/70" : "text-gray-400"} font-bold text-left`}
                >
                  {statusText}
                </div>
              </SelectableTile>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
