import clsx from "clsx";
import { useVanStore } from "../../store/van";
import { Panel, StatusDot } from "../ui";

/**
 * EcoFlow River 2 Max — portable power station. Not wired into the house
 * battery charging system, and not dedicated to any one load — this card
 * just reports its own battery level.
 *
 * Battery % only, decoded from an unencrypted byte in the BLE advertisement
 * — no official API. Charging state and watts in/out live in EcoFlow's
 * encrypted protocol, which passive scanning can't reach.
 * See backend/app/services/ecoflow_ble.py.
 */
export function EcoflowCard({ className }: { className?: string }) {
  const ecoflow = useVanStore((s) => s.ecoflow);
  const known = ecoflow?.battery_percent != null;

  return (
    <Panel className={className}>
      <div className="flex items-center justify-between rounded-lg p-3 border bg-panel-bg border-panel-border">
        <div className="flex items-center gap-3">
          <StatusDot on={!!ecoflow?.connected} tone="success" />
          <div className="text-sm  font-semibold text-charge-dc">EcoFlow</div>
        </div>
        <div className="text-right">
          <div
            className={clsx(
              "text-sm  font-semibold",
              known ? "text-zinc-200" : "text-zinc-600",
            )}
          >
            {known ? `${ecoflow!.battery_percent}%` : "—"}
          </div>
          <div className="text-xs  text-zinc-600">
            {ecoflow?.connected ? "Portable battery" : "No signal"}
          </div>
        </div>
      </div>
    </Panel>
  );
}
