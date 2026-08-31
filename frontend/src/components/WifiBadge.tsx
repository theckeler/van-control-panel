import clsx from "clsx";
import { useVanStore } from "../store/van";

/**
 * Which WiFi network the Pi is on.
 *
 * Worth surfacing because a split between the Pi and the Shellys shows up as
 * "circuits unreachable" rather than anything network-shaped, and it happened
 * three times during the Starlink migration before anyone thought to check.
 */
export function WifiBadge({ className }: { className?: string }) {
  const system = useVanStore((s) => s.system);
  const ssid = system?.ssid;

  if (!system) return null;

  const dbm = system.wifi_signal_dbm;
  const weak = dbm !== null && dbm < -70;

  return (
    <span
      className={clsx(
        "text-[10px]  truncate max-w-[9rem]",
        !ssid ? "text-red-400" : weak ? "text-amber-400" : "text-gray-800",
        className,
      )}
      title={
        ssid
          ? `${ssid}${system.band ? ` · ${system.band}` : ""}${dbm !== null ? ` · ${dbm} dBm` : ""}${system.wifi_ip ? ` · ${system.wifi_ip}` : ""}`
          : "Not connected to WiFi"
      }
    >
      {ssid ?? "no wifi"}
      {system.band && <span className="text-black"> {system.band}</span>}
    </span>
  );
}
