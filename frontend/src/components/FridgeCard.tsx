import clsx from "clsx";
import { useVanStore } from "../store/van";
import { Panel, StatusDot } from "./ui";

function formatLastSeen(isoStr: string): string {
  const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

/**
 * Dometic CFX535 fridge — read from the ESP32-S3 bridge's local JSON API,
 * which handles the actual BLE connection, DDM2 protocol and bonding.
 *
 * `reachable` false just means the ESP32 itself didn't answer over WiFi —
 * unplugged, WiFi down, or still (re)bonding after a reboot. It does not
 * distinguish "ESP32 up but not bonded" from "ESP32 fully down"; that
 * distinction lives in the ESP32's own logs, not this card.
 *
 * Previously blanked every field the instant reachable went false, which
 * discarded perfectly good last-known readings on every brief WiFi hiccup —
 * and with only one ESP32 juggling BLE, WiFi and its own HTTP server on
 * constrained hardware, brief hiccups are routine, not exceptional. Now
 * mirrors BatteryCard: show the last known reading, dimmed, with a
 * "last seen" age instead of going blank.
 *
 * See backend/app/services/dometic.py and esp32-dometic/dometic-bridge.yaml.
 */
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
            <div className="text-sm font-mono font-semibold text-charge-dc">
              Fridge
            </div>
            <div className="text-xs font-mono text-zinc-600">
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
              "text-sm font-mono font-semibold",
              reachable ? "text-zinc-200" : "text-zinc-500",
            )}
          >
            {fridge.temp_f != null ? `${fridge.temp_f.toFixed(1)}°F` : "—"}
          </div>
          <div className="text-xs font-mono text-zinc-600">
            {fridge.set_temp_f != null
              ? `Set to ${fridge.set_temp_f.toFixed(1)}°F`
              : hasCache
                ? "waiting for set point"
                : "no set point yet"}
          </div>
          {fridge.cooler_on != null && (
            <div
              className={clsx(
                "text-xs font-mono",
                fridge.cooler_on ? "text-charge-dc" : "text-zinc-600",
              )}
            >
              {fridge.cooler_on ? "compressor running" : "idle"}
            </div>
          )}
          {doorOpen && (
            <div className="text-xs font-mono text-amber-600">door open</div>
          )}
        </div>
      </div>
    </Panel>
  );
}

function CardSkeleton() {
  return (
    <div className="bg-panel-surface border border-panel-border rounded-xl p-5 animate-pulse">
      <div className="text-xs font-mono text-zinc-600 uppercase tracking-widest mb-4">
        Fridge
      </div>
      <div className="h-12 bg-panel-bg rounded-lg" />
    </div>
  );
}
