import React from "react";
import { useVanStore } from "../store/van";
import { Label, SelectableTile, StatusDot } from "./ui";

export function ShellyPanel({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const shellys = useVanStore((s) => s.shellys);
  const toggleShelly = useVanStore((s) => s.toggleShelly);

  return (
    <div className={className} style={style}>
      {!shellys.length ? (
        <div className="text-xs font-mono text-zinc-600">
          Loading circuits...
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {shellys.map((unit) => (
            <SelectableTile
              key={unit.id}
              selected={unit.on}
              onClick={() => toggleShelly(unit.id, !unit.on)}
            >
              <div className="flex items-center justify-between mb-2">
                <Label className="text-inherit">{unit.label}</Label>
                <StatusDot on={unit.on} />
              </div>
              <div className="text-lg font-mono font-semibold">
                {unit.on ? "ON" : "OFF"}
              </div>
            </SelectableTile>
          ))}
        </div>
      )}
    </div>
  );
}
