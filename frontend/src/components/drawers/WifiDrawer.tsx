import { useState } from "react";
import { useVanStore } from "../../store/van";
import { Button, Dialog, Drawer, KeyValue, Section } from "../ui";
import { WifiScan } from "./WifiScan";

// Everything about WiFi in one place: the uplink the Pi is on (wlan1), its
// own hotspot (wlan0), and scanning and connecting to a new network.
export function WifiDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const system = useVanStore((s) => s.system);
  const hotspot = useVanStore((s) => s.hotspot);
  const toggleHotspot = useVanStore((s) => s.toggleHotspot);
  const [confirmOff, setConfirmOff] = useState(false);
  const hotspotOn = !!hotspot?.active;
  const dbm = system?.wifi_signal_dbm;

  return (
    <>
      <Drawer open={open} onClose={onClose} title="WiFi" vc="drawer-wifi">
        <Section title="Uplink (wlan1)">
          <KeyValue
            items={[
              {
                label: "Network",
                value: system?.ssid ?? "not connected",
                tone: system?.ssid ? undefined : "bad",
              },
              { label: "Band", value: system?.band ?? "—" },
              {
                label: "Signal",
                value: dbm != null ? `${dbm} dBm` : "—",
                tone: dbm != null && dbm < -70 ? "warn" : undefined,
              },
              { label: "IP", value: system?.wifi_ip ?? "—" },
            ]}
          />
        </Section>

        <Section title="Hotspot (wlan0)">
          <KeyValue
            items={[
              {
                label: "Status",
                value: hotspotOn ? "on" : "off",
                tone: hotspotOn ? undefined : "warn",
              },
              { label: "Broadcasting", value: hotspot?.ssid ?? "—" },
            ]}
          />
          <Button
            variant={hotspotOn ? "outline" : "solid"}
            onClick={() => (hotspotOn ? setConfirmOff(true) : toggleHotspot(true))}
          >
            {hotspotOn ? "Turn hotspot off" : "Turn hotspot on"}
          </Button>
        </Section>

        <Section title="Connect to a network">
          <WifiScan />
        </Section>
      </Drawer>

      <Dialog
        open={confirmOff}
        onClose={() => setConfirmOff(false)}
        title="Turn off the hotspot?"
        vc="dialog-hotspot-off"
        actions={
          <>
            <Button onClick={() => setConfirmOff(false)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                setConfirmOff(false);
                toggleHotspot(false);
              }}
            >
              Turn off
            </Button>
          </>
        }
      >
        Any device connected over TwitchWiFi, including this one if that's how
        you're viewing it, will be disconnected. Tailscale and OHeck or
        Starlink-connected devices are unaffected.
      </Dialog>
    </>
  );
}
