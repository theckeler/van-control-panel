import { useVanStore } from "../../store/van";
import { StatusList } from "../ui";

// The Pi's links at a glance: the WiFi uplink, its own hotspot, and the wired
// rescue port (eth0, inside the cabinet, so "is a cable in" is worth seeing).
// Read-only. Changing WiFi happens in the WiFi drawer.
export function WifiCard() {
  const system = useVanStore((s) => s.system);
  const hotspot = useVanStore((s) => s.hotspot);

  const ssid = system?.ssid;
  const weak = system?.wifi_signal_dbm != null && system.wifi_signal_dbm < -70;
  const eth = !!system?.eth0_connected;

  return (
    <StatusList
      vc="wifi-card"
      items={[
        {
          name: ssid ?? "No uplink",
          detail: !ssid
            ? "Offline"
            : weak
              ? "Weak signal"
              : `Connected${system?.band ? ` · ${system.band}` : ""}`,
          tone: !ssid ? "unknown" : weak ? "warn" : "on",
        },
        {
          name: "Hotspot",
          detail: hotspot?.active ? "On" : "Off",
          tone: hotspot?.active ? "on" : "unknown",
        },
        {
          name: "Ethernet",
          detail: eth ? "Cable in" : "No cable",
          tone: eth ? "on" : "unknown",
        },
      ]}
    />
  );
}
