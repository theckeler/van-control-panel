import clsx from "clsx";
import { useState } from "react";
import { toast } from "../../store/toast";
import { useVanStore } from "../../store/van";
import { Button, Label, Panel, SelectableTile, StatusDot } from "../ui";

export function ShellyCard({ className }: { className?: string }) {
  const shellys = useVanStore((s) => s.shellys);
  const toggleShelly = useVanStore((s) => s.toggleShelly);
  const installed = shellys.filter((u) => u.installed !== false);
  const [showTimer, setShowTimer] = useState(false);

  return (
    <Panel className={className}>
      {!installed.length ? (
        <div className="text-xs text-black">Loading circuits...</div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {installed.map((unit) => {
            const offline = unit.reachable === false;
            const statusText = offline ? "unreachable" : unit.on ? "ON" : "OFF";
            const onClass = unit.on ? "text-white/100" : "text-gray-400";

            return (
              <div className="relative w-full overflow-hidden">
                <SelectableTile
                  key={unit.id}
                  selected={unit.on}
                  disabled={offline}
                  onClick={() => toggleShelly(unit.id, !unit.on)}
                  className="w-full relative bg-gradient-to-r from-gray-100 to-gray-50 disabled:bg-gray-200 p-4 rounded flex flex-col gap-1 aria-pressed:bg-gradient-to-r aria-pressed:from-lime-600 aria-pressed:to-lime-700"
                >
                  <div className="flex items-center justify-between">
                    <Label
                      className={clsx("truncate text-2xl font-bold", onClass)}
                    >
                      {unit.label}
                    </Label>
                    <div
                      className="relative z-20 grid grid-rows-3 gap-1"
                      onClick={() => {
                        toast.info(`Timer`);
                        toggleShelly(unit.id, true);
                        setShowTimer(!showTimer);
                      }}
                    >
                      <StatusDot
                        tone="success"
                        on={unit.on && !offline}
                        className="w-6 h-1"
                      />
                      <StatusDot
                        tone="success"
                        on={unit.on && !offline}
                        className="w-6 h-1"
                      />
                      <StatusDot
                        tone="success"
                        on={unit.on && !offline}
                        className="w-6 h-1"
                      />
                    </div>
                  </div>
                  <div
                    className={clsx(
                      "truncate text-lg font-bold text-left",
                      onClass,
                    )}
                  >
                    {statusText}
                  </div>
                </SelectableTile>
                <div
                  className={clsx(
                    "absolute z-10 top-0 left-0 w-full h-full backdrop-blur-sm transition-all bg-lime-100/70",
                    showTimer ? "translate-y-0" : "translate-y-full",
                  )}
                >
                  <div className="h-full flex justify-between gap-2 pr-14 pl-2 py-2">
                    <Button size="icon" className="bg-gray-100">
                      s
                    </Button>
                  </div>
                </div>
                <div className="hidden">
                  <div className="h-full flex justify-between gap-2 pr-14 pl-2 py-2">
                    <Button size="icon" className="bg-gray-100">
                      -
                    </Button>
                    <div>
                      <span className="block font-bold text-5xl">5</span>
                      <span className="text-md">mins</span>
                    </div>
                    <Button size="icon" className="bg-gray-100">
                      +
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
