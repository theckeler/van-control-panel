import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { useSettingsStore } from "../store/settings";
import { useVanStore } from "../store/van";
import { ConfirmModal } from "./ConfirmModal";
import { Button, Panel } from "./ui";

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
  const releaseBms = useVanStore((s) => s.releaseBms);
  const connectBms = useVanStore((s) => s.connectBms);
  const spacing = useSettingsStore((s) => s.spacing);
  const pad = spacing * 4;
  const [busy, setBusy] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

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
  const isReleased = battery.released;
  const hasCache = battery.soc > 0 || battery.voltage > 0;

  const handleRelease = async () => {
    setBusy(true);
    await releaseBms();
    setBusy(false);
  };

  const handleConnect = async () => {
    setBusy(true);
    await connectBms();
    setBusy(false);
  };

  const socColor =
    battery.soc > 50
      ? "text-soc-good"
      : battery.soc > 20
        ? "text-soc-mid"
        : "text-soc-low";

  const isCharging = battery.current > 0;
  const drawW = Math.abs(battery.current * battery.voltage).toFixed(0);

  return (
    <Panel className={clsx(className, isOffline && "opacity-60")}>
      <ConfirmModal
        open={showConfirm}
        title="Release BMS connection?"
        message="The Pi will drop its Bluetooth connection to the battery. The Power Queen app will be able to connect. Tap Connect when you're done to resume monitoring."
        confirmLabel="Release"
        onConfirm={() => {
          setShowConfirm(false);
          handleRelease();
        }}
        onCancel={() => setShowConfirm(false)}
      />
      {isOffline && !hasCache ? (
        <div className="flex flex-col gap-1 py-2">
          <span className="text-xs font-mono text-amber-500">
            ○ offline — no data yet
          </span>
          {countdown !== null && countdown > 0 && (
            <span className="text-xs font-mono text-zinc-600">
              connecting in {formatCountdown(countdown)}
            </span>
          )}
          {isReleased && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleConnect}
              disabled={busy}
            >
              connect →
            </Button>
          )}
        </div>
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
              {!isOffline && !isReleased && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowConfirm(true)}
                  disabled={busy}
                  aria-label="Release BMS connection"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    height="24px"
                    viewBox="0 -960 960 960"
                    width="24px"
                    aria-hidden="true"
                  >
                    <path d="m344-160-76-128-144-32 14-148-98-112 98-112-14-148 144-32 76-128 136 58 136-58 76 128 144 32-14 148 98 112-98 112 14 148-144 32-76 128-136-58-136 58Zm34-102 102-44 104 44 56-96 110-26-10-112 74-84-74-86 10-112-110-24-58-96-102 44-104-44-56 96-110 24 10 112-74 86 74 84-10 114 110 24 58 96Zm102-318Zm28.5 188.5Q520-303 520-320t-11.5-28.5Q497-360 480-360t-28.5 11.5Q440-337 440-320t11.5 28.5Q463-280 480-280t28.5-11.5ZM440-440h80v-240h-80v240Z" />
                  </svg>
                </Button>
              )}

              <span
                className={clsx(
                  "text-xs font-mono",
                  isReleased
                    ? "text-blue-400"
                    : isOffline
                      ? "text-amber-500"
                      : "text-green-500",
                )}
              >
                {isReleased ? "○ released" : isOffline ? "○ offline" : "● live"}
              </span>

              {isOffline && battery.last_seen && (
                <span className="text-xs font-mono text-zinc-600">
                  last seen {formatLastSeen(battery.last_seen)}
                </span>
              )}

              {isOffline &&
                !isReleased &&
                countdown !== null &&
                countdown > 0 && (
                  <span className="text-xs font-mono text-zinc-600">
                    retry in {formatCountdown(countdown)}
                  </span>
                )}

              {isReleased && (
                <button
                  onClick={handleConnect}
                  disabled={busy}
                  className="text-xs font-mono text-zinc-600 hover:text-green-400 transition-colors disabled:opacity-40"
                >
                  connect →
                </button>
              )}
            </div>
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

          <div className="grid grid-cols-3 gap-3">
            <Stat pad={pad} value={`${battery.voltage.toFixed(2)}V`} />
            <Stat
              pad={pad}
              value={`${drawW}W`}
              highlight={isCharging ? "charge" : "draw"}
            />
            <Stat pad={pad} value={`${battery.temperature.toFixed(1)}°C`} />
          </div>
        </>
      )}
    </Panel>
  );
}

function Stat({
  value,
  highlight,
  pad,
}: {
  value: string;
  highlight?: "charge" | "draw";
  pad: number;
}) {
  return (
    <div className="bg-panel-bg rounded" style={{ padding: `${pad}px` }}>
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
