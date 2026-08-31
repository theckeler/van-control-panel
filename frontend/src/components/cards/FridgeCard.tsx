import clsx from "clsx";
import { useVanStore } from "../../store/van";
import { Panel, StatusDot } from "../ui";

function formatLastSeen(isoStr: string): string {
  const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export function FridgeCard({ className }: { className?: string }) {
  const fridge = useVanStore((s) => s.dometic);

  if (!fridge) return <CardSkeleton />;

  const reachable = fridge.reachable;
  const hasCache = fridge.temp_f != null || fridge.battery_voltage != null;
  const doorOpen = fridge.door_open === true;

  return (
    <Panel className={clsx(className, !reachable && "opacity-60")}>
      <div className="flex items-center justify-between rounded-lg p-3 border bg-panel-bg border-panel-border">
        <div className="flex items-center gap-3">
          <StatusDot on={reachable} tone="success" />
          <div>
            <div className="text-sm  font-semibold text-charge-dc">Fridge</div>
            <div className="text-xs  text-zinc-600">
              {reachable
                ? fridge.power_source
                  ? `${fridge.power_source} power`
                  : "live"
                : fridge.last_seen
                  ? `last seen ${formatLastSeen(fridge.last_seen)}`
                  : "no data yet"}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div
            className={clsx(
              "text-sm  font-semibold",
              reachable ? "text-zinc-200" : "text-zinc-500",
            )}
          >
            {fridge.temp_f != null ? `${fridge.temp_f.toFixed(1)}°F` : "—"}
          </div>
          <div className="text-xs  text-zinc-600">
            {fridge.set_temp_f != null
              ? `Set to ${fridge.set_temp_f.toFixed(1)}°F`
              : hasCache
                ? "waiting for set point"
                : "no set point yet"}
          </div>
          {fridge.cooler_on != null && (
            <div
              className={clsx(
                "text-xs ",
                fridge.cooler_on ? "text-charge-dc" : "text-zinc-600",
              )}
            >
              {fridge.cooler_on ? "compressor running" : "idle"}
            </div>
          )}
          {doorOpen && <div className="text-xs  text-amber-600">door open</div>}
        </div>
      </div>
    </Panel>
  );
}

function CardSkeleton() {
  return (
    <div className="bg-panel-surface border border-panel-border rounded-xl p-5 animate-pulse">
      <div className="text-xs  text-zinc-600 uppercase tracking-widest mb-4">
        Fridge
      </div>
      <div className="h-12 bg-panel-bg rounded-lg" />
    </div>
  );
}
