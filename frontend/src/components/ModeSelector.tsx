import React from "react";
import { useVanStore } from "../store/van";
import { SelectableTile } from "./ui";

export function ModeSelector({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const mode = useVanStore((s) => s.mode);
  const setMode = useVanStore((s) => s.setMode);

  if (!mode) return null;

  return (
    <div className={className} style={style}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Van mode">
        {mode.available.map((m) => (
          <SelectableTile
            key={m}
            size="sm"
            selected={m === mode.current}
            onClick={() => setMode(m)}
            className="text-center"
          >
            <div className="text-xs font-mono capitalize">
              {m.replace("_", " ")}
            </div>
          </SelectableTile>
        ))}
      </div>
    </div>
  );
}
