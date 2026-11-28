import { useState } from "react";
import { useVanStore } from "../../store/van";
import { HotspotOffDialog } from "../dialogs/HotspotOffDialog";
import { InfoTile } from "../ui";

// The Pi's links: the WiFi uplink, its own hotspot, and the wired rescue port
// (eth0, inside the cabinet, so "is a cable in" is worth seeing). The uplink
// tile opens the WiFi drawer, the hotspot tile switches the hotspot, and
// Ethernet only reports.
export function WifiCard({ onOpen }: { onOpen: () => void }) {
  const system = useVanStore((s) => s.system);
  const hotspot = useVanStore((s) => s.hotspot);
  const toggleHotspot = useVanStore((s) => s.toggleHotspot);
  const switching = useVanStore((s) => s.hotspotBusy);
  const [confirmOff, setConfirmOff] = useState(false);

  const ssid = system?.ssid;
  const weak = system?.wifi_signal_dbm != null && system.wifi_signal_dbm < -70;
  const eth = !!system?.eth0_connected;
  const hotspotOn = !!hotspot?.active;

  return (
    <>
      <div data-vc="wifi-card" className="grid grid-cols-2 grid-rows-2 gap-2">
        <InfoTile
          control
          vc="uplink-tile"
          icon="wifi"
          name={ssid ?? "No uplink"}
          detail={
            !ssid
              ? "Offline"
              : weak
                ? "Weak signal"
                : `Connected${system?.band ? ` · ${system.band}` : ""}`
          }
          state={!ssid ? "off" : weak ? "warn" : "on"}
          onClick={onOpen}
          actionHint="Open WiFi"
          className="col-span-2"
        />
        {/* Until the first answer there is nothing to switch. Turning it off
            drops devices, so that asks first. */}
        <InfoTile
          control={!!hotspot}
          vc="hotspot-tile"
          icon="hotspot"
          name="Hotspot"
          detail={!hotspot ? "Unknown" : hotspotOn ? "On" : "Off"}
          state={hotspotOn ? "on" : "off"}
          onClick={
            hotspot
              ? () => (hotspotOn ? setConfirmOff(true) : void toggleHotspot(true))
              : undefined
          }
          actionHint={hotspotOn ? "Turn off" : "Turn on"}
          waiting={switching}
        />
        <InfoTile
          vc="ethernet-tile"
          icon="ethernet"
          name="Ethernet"
          detail={eth ? "Cable in" : "No cable"}
          state={eth ? "on" : "off"}
        />
      </div>
      <HotspotOffDialog open={confirmOff} onClose={() => setConfirmOff(false)} />
    </>
  );
}
