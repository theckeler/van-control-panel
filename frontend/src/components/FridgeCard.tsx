import clsx from "clsx";
import { useVanStore } from "../store/van";
import { Panel, StatusDot } from "./ui";

/**
 * Dometic CFX535 fridge — read from the ESP32-S3 bridge's local JSON API,
 * which handles the actual BLE connection, DDM2 protocol and bonding.
 *
 * `reachable` false just means the ESP32 itself didn't answer over WiFi —
 * unplugged, WiFi down, or still (re)bonding after a reboot. It does not
 * distinguish "ESP32 up but not bonded" from "ESP32 fully down"; that
 * distinction lives in the ESP32's own logs, not this card.
 *
 * See backend/app/services/dometic.py and esp32-dometic/dometic-bridge.yaml.
 */
export function FridgeCard({ className }: { className?: string }) {
  const fridge = useVanStore((s) => s.dometic);
  const reachable = !!fridge?.reachable;

  const doorOpen = fridge?.door_open === true;

  return (
    <Panel className={className}>
      <div className="flex items-center justify-between rounded-lg p-3 border bg-panel-bg border-panel-border">
        <div className="flex items-center gap-3">
          <StatusDot on={reachable} tone="success" />
          <div>
            <div className="text-sm font-mono font-semibold text-charge-dc">
              Fridge
            </div>
            {fridge?.power_source && (
              <div className="text-xs font-mono text-zinc-600">
                {fridge.power_source} power
              </div>
            )}
          </div>
        </div>
        <div className="text-right">
          <div
            className={clsx(
              "text-sm font-mono font-semibold",
              reachable ? "text-zinc-200" : "text-zinc-600",
            )}
          >
            {reachable && fridge?.temp_c != null
              ? `${fridge.temp_c.toFixed(1)}°C`
              : "—"}
          </div>
          <div className="text-xs font-mono text-zinc-600">
            {!reachable
              ? "Offline"
              : fridge?.set_temp_c != null
                ? `Set to ${fridge.set_temp_c.toFixed(1)}°C`
                : "No set point"}
          </div>
          {reachable && doorOpen && (
            <div className="text-xs font-mono text-amber-600">door open</div>
          )}
        </div>
      </div>
    </Panel>
  );
}
