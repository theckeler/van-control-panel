import { formatLastSeen } from "../../lib/format";
import { useVanStore } from "../../store/van";
import { Badge, InfoTile } from "../ui";

export function FridgeCard() {
  const fridge = useVanStore((s) => s.dometic);
  const recheckFridge = useVanStore((s) => s.recheckFridge);
  const checking = useVanStore((s) => s.rechecking.includes("fridge"));

  if (!fridge) {
    return (
      <InfoTile vc="fridge-card" icon="fridge" name="Fridge" state="offline" detail="Loading…" />
    );
  }

  const doorOpen = fridge.door_open === true;
  const compressor =
    fridge.cooler_on != null ? (fridge.cooler_on ? "Running" : "Idle") : null;

  // Last-known value pattern: an unreachable fridge keeps its last reading,
  // dimmed, with its age, rather than going blank on one missed poll.
  const detail = fridge.reachable
    ? (compressor ?? (fridge.power_source ? `${fridge.power_source} power` : "Live"))
    : fridge.last_seen
      ? `Offline · last seen ${formatLastSeen(fridge.last_seen)}`
      : "Offline · no data yet";

  const value =
    fridge.temp_f != null
      ? `${fridge.temp_f.toFixed(1)}°F${
          fridge.set_temp_f != null ? ` · set ${fridge.set_temp_f.toFixed(0)}°F` : ""
        }`
      : undefined;

  return (
    <InfoTile
      vc="fridge-card"
      icon="fridge"
      name="Fridge"
      state={fridge.reachable ? "on" : "offline"}
      value={value}
      detail={detail}
      onRecheck={recheckFridge}
      checking={checking}
    >
      {doorOpen && (
        <span className="flex">
          <Badge tone="warn">Door open</Badge>
        </span>
      )}
    </InfoTile>
  );
}
