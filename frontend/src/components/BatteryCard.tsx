import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { useVanStore } from "../store/van";

function formatLastSeen(isoStr: string): string {
  const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function formatCountdown(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function BatteryCard({ className }: { className?: string }) {
  const battery = useVanStore((s) => s.battery);
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (battery?.retry_in != null && battery.retry_in > 0) {
      setCountdown(battery.retry_in);
      if (countdownRef.current) clearInterval(countdownRef.current);
      countdownRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev === null || prev <= 1) {
            clearInterval(countdownRef.current!);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (countdownRef.current) clearInterval(countdownRef.current);
      setCountdown(null);
    }
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [battery?.retry_in]);

  if (!battery) return <CardSkeleton />;

  const isOffline = !battery.connected;
  const hasCache = battery.soc > 0 || battery.voltage > 0;

  const socColor =
    battery.soc > 50
      ? "text-soc-good"
      : battery.soc > 20
        ? "text-soc-mid"
        : "text-soc-low";

  const isCharging = battery.current > 0;
  const drawW = Math.abs(battery.current * battery.voltage).toFixed(0);

  return (
    <div
      className={clsx(
        className,
        "",
        isOffline && "opacity-60",
      )}
    >
      {/* <div className="flex items-start justify-between mb-4">
        <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest">
          Battery
        </span>
        <div className="flex flex-col items-end gap-1">
          <span
            className={clsx(
              "text-xs font-mono",
              isOffline ? "text-amber-500" : "text-green-500",
            )}
          >
            {isOffline ? "○ offline" : "● live"}
          </span>
          {isOffline && battery.last_seen && (
            <span className="text-xs font-mono text-zinc-600">
              last seen {formatLastSeen(battery.last_seen)}
            </span>
          )}
          {isOffline && countdown !== null && countdown > 0 && (
            <span className="text-xs font-mono text-zinc-600">
              retry in {formatCountdown(countdown)}
            </span>
          )}
        </div>
      </div> */}

      {isOffline && !hasCache ? (
        <div className="text-zinc-600 font-mono text-sm py-4">No data yet</div>
      ) : (
        <>
          <div className="flex items-end justify-between">
            <div
              className={clsx(
                "text-6xl font-mono font-bold tracking-tight",
                socColor,
              )}
            >
              {battery.soc.toFixed(1)}
              <span className="text-2xl ml-1">%</span>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span
                className={clsx(
                  "text-xs font-mono",
                  isOffline ? "text-amber-500" : "text-green-500",
                )}
              >
                {isOffline ? "○ offline" : "● live"}
              </span>
              {isOffline && battery.last_seen && (
                <span className="text-xs font-mono text-zinc-600">
                  last seen {formatLastSeen(battery.last_seen)}
                </span>
              )}
              {isOffline && countdown !== null && countdown > 0 && (
                <span className="text-xs font-mono text-zinc-600">
                  retry in {formatCountdown(countdown)}
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Stat label="Voltage" value={`${battery.voltage.toFixed(2)}V`} />
            <Stat
              label={isCharging ? "Charging" : "Draw"}
              value={`${drawW}W`}
              highlight={isCharging ? "charge" : "draw"}
            />
            <Stat label="Temp" value={`${battery.temperature.toFixed(1)}°C`} />
          </div>

          <div className="">
            <div className="flex justify-between text-xs font-mono text-zinc-600 mb-1">
              <span>0%</span>
              <span>100%</span>
            </div>
            <div className="h-2 bg-panel-bg rounded-full overflow-hidden">
              <div
                className={clsx(
                  "h-full rounded-full transition-all duration-700",
                  {
                    "bg-soc-good": battery.soc > 50,
                    "bg-soc-mid": battery.soc > 20 && battery.soc <= 50,
                    "bg-soc-low": battery.soc <= 20,
                  },
                )}
                style={{ width: `${battery.soc}%` }}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: "charge" | "draw";
}) {
  return (
    <div className="bg-panel-bg rounded-lg p-3">
      {/* <div className="text-xs font-mono text-zinc-600 mb-1">{label}</div> */}
      <div
        className={clsx("text-sm font-mono font-semibold", {
          "text-charge-solar": highlight === "charge",
          "text-soc-low": highlight === "draw",
          "text-zinc-200": !highlight,
        })}
      >
        {value}
      </div>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="bg-panel-surface border border-panel-border rounded-xl p-5 animate-pulse">
      <div className="text-xs font-mono text-zinc-600 uppercase tracking-widest mb-4">
        Battery
      </div>
      <div className="h-16 bg-panel-bg rounded-lg" />
    </div>
  );
}
