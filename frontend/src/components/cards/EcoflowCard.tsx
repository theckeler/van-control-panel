import { useVanStore } from "../../store/van";
import { DeviceRow, Progress } from "../ui";

/**
 * EcoFlow River 2 Max, a portable power station. Not wired into the house
 * battery charging system and not dedicated to any one load: this just
 * reports its own battery level.
 *
 * Battery % only, decoded from an unencrypted byte in the BLE advertisement.
 * Watts in and out live in EcoFlow's encrypted protocol, which passive
 * scanning can't reach. charge_state is inferred from the % trend over a
 * 10-minute window server-side, not real telemetry (see
 * backend/app/services/ecoflow_ble.py).
 */
const CHARGE_LABEL: Record<string, string> = {
  charging: "Charging",
  discharging: "Discharging",
  idle: "Idle",
};

export function EcoflowCard() {
  const ecoflow = useVanStore((s) => s.ecoflow);
  const connected = !!ecoflow?.connected;
  const pct = ecoflow?.battery_percent ?? null;
  const chargeLabel = ecoflow?.charge_state
    ? CHARGE_LABEL[ecoflow.charge_state]
    : null;

  return (
    <DeviceRow
      vc="ecoflow-card"
      name="EcoFlow"
      state={connected ? "on" : "offline"}
      value={pct != null ? `${pct}%` : undefined}
      detail={connected ? (chargeLabel ?? "Portable battery") : "No signal"}
    >
      {pct != null && (
        <Progress value={pct} label="EcoFlow charge" offline={!connected} />
      )}
    </DeviceRow>
  );
}
