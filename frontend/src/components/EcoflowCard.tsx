import clsx from "clsx";
import { useVanStore } from "../store/van";
import { Panel, StatusDot } from "./ui";

/**
 * EcoFlow River 2 Max — portable power station feeding the fridge via its
 * own barrel input. Not part of the house battery charging system, so this
 * is deliberately its own card rather than a row in ChargeSourcesCard.
 *
 * Battery % only, decoded from an unencrypted byte in the BLE advertisement
 * — no official API. See backend/app/services/ecoflow_ble.py.
 */
export function EcoflowCard({ className }: { className?: string }) {
  const ecoflow = useVanStore((s) => s.ecoflow);
  const known = ecoflow?.battery_percent != null;

  return (
    <Panel className={className}>
      <div className="flex items-center justify-between rounded-lg p-3 border bg-panel-bg border-panel-border">
        <div className="flex items-center gap-3">
          <StatusDot on={!!ecoflow?.connected} tone="success" />
          <div className="text-sm font-mono font-semibold text-charge-dc">
            EcoFlow
          </div>
        </div>
        <div className="text-right">
          <div
            className={clsx(
              "text-sm font-mono font-semibold",
              known ? "text-zinc-200" : "text-zinc-600",
            )}
          >
            {known ? `${ecoflow!.battery_percent}%` : "—"}
          </div>
          <div className="text-xs font-mono text-zinc-600">
            {ecoflow?.connected ? "Fridge power" : "No signal"}
          </div>
        </div>
      </div>
    </Panel>
  );
}
