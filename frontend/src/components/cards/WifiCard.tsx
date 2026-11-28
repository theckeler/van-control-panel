import { useVanStore } from "../../store/van";
import { InfoTile } from "../ui";

// The Pi's links at a glance: the WiFi uplink, its own hotspot, and the wired
// rescue port (eth0, inside the cabinet, so "is a cable in" is worth seeing).
// Each tile opens the WiFi drawer, where changes are made.
export function WifiCard({ onOpen }: { onOpen: () => void }) {
  const system = useVanStore((s) => s.system);
  const hotspot = useVanStore((s) => s.hotspot);

  const ssid = system?.ssid;
  const weak = system?.wifi_signal_dbm != null && system.wifi_signal_dbm < -70;
  const eth = !!system?.eth0_connected;
  const link = { onClick: onOpen, actionHint: "Open WiFi" };

  return (
    <div data-vc="wifi-card" className="grid grid-cols-2 grid-rows-2 gap-2">
      <InfoTile
        {...link}
        vc="uplink-tile"
        icon="globe"
        name={ssid ?? "No uplink"}
        detail={
          !ssid
            ? "Offline"
            : weak
              ? "Weak signal"
              : `Connected${system?.band ? ` · ${system.band}` : ""}`
        }
        state={!ssid ? "off" : weak ? "warn" : "on"}
        className="col-span-2"
      />
      <InfoTile
        {...link}
        vc="hotspot-tile"
        icon="hotspot"
        name="Hotspot"
        detail={hotspot?.active ? "On" : "Off"}
        state={hotspot?.active ? "on" : "off"}
      />
      <InfoTile
        {...link}
        vc="ethernet-tile"
        icon="ethernet"
        name="Ethernet"
        detail={eth ? "Cable in" : "No cable"}
        state={eth ? "on" : "off"}
      />
    </div>
  );
}
