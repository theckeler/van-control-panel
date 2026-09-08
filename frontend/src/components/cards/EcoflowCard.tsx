import clsx from "clsx";
import { useVanStore } from "../../store/van";
import { Panel, StatusDot } from "../ui";

/**
 * EcoFlow River 2 Max — portable power station. Not wired into the house
 * battery charging system, and not dedicated to any one load — this card
 * just reports its own battery level.
 *
 * Battery % only, decoded from an unencrypted byte in the BLE advertisement
 * — no official API, and watts in/out live in EcoFlow's encrypted protocol,
 * which passive scanning can't reach. charge_state (added 2026-09-07) is
 * inferred from the % trend over a 10-minute window server-side, not real
 * telemetry — see backend/app/services/ecoflow_ble.py.
 */
const CHARGE_LABEL: Record<string, string> = {
  charging: "Charging",
  discharging: "Discharging",
  idle: "Idle",
};

export function EcoflowCard({ className }: { className?: string }) {
  const ecoflow = useVanStore((s) => s.ecoflow);
  const known = ecoflow?.battery_percent != null;
  const chargeLabel = ecoflow?.charge_state
    ? CHARGE_LABEL[ecoflow.charge_state]
    : null;

  return (
    <Panel className={className}>
      <div className="flex items-center justify-between rounded-lg p-3 border bg-panel-bg border-panel-border">
        <div className="flex items-center gap-3">
          <StatusDot on={!!ecoflow?.connected} tone="success" />
          <div
            className={`text-sm font-semibold ${ecoflow?.connected ? "text-charge-dc" : "text-gray-300"}`}
          >
            EcoFlow
          </div>
        </div>
        <div className="text-right">
          <div
            className={clsx(
              "text-sm  font-semibold",
              known ? "text-lime-700" : "text-gray-600",
            )}
          >
            {known ? `${ecoflow!.battery_percent}%` : "—"}
          </div>
          <div
            className={clsx(
              "text-xs",
              ecoflow?.charge_state === "charging"
                ? "text-lime-700"
                : "text-gray-600",
            )}
          >
            {!ecoflow?.connected
              ? "No signal"
              : (chargeLabel ?? "Portable battery")}
          </div>
        </div>
      </div>
    </Panel>
  );
}
