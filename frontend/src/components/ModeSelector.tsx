import React from "react";
import clsx from "clsx";
import { useVanStore } from "../store/van";


export function ModeSelector({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const mode = useVanStore((s) => s.mode);
  const setMode = useVanStore((s) => s.setMode);

  if (!mode) return null;

  return (
    <div className={className} style={style}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {mode.available.map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={clsx(
              "rounded p-3 text-center transition-all duration-200 border",
              m === mode.current
                ? "bg-accent/15 border-accent text-accent"
                : "bg-panel-bg border-panel-border text-zinc-500 hover:border-zinc-500 hover:text-zinc-300",
            )}
          >
            <div className="text-xs font-mono capitalize">
              {m.replace("_", " ")}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
