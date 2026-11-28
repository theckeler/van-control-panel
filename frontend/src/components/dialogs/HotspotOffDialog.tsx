import { useVanStore } from "../../store/van";
import { Button, Dialog } from "../ui";

// The one confirm for turning the Pi's hotspot off, used by the hotspot tile
// and the WiFi drawer.
export function HotspotOffDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const ssid = useVanStore((s) => s.system?.ssid);
  const hotspotName = useVanStore((s) => s.hotspot?.ssid);
  const toggleHotspot = useVanStore((s) => s.toggleHotspot);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Turn off the hotspot?"
      vc="dialog-hotspot-off"
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="danger"
            onClick={() => {
              onClose();
              void toggleHotspot(false);
            }}
          >
            Turn off
          </Button>
        </>
      }
    >
      Any device connected over {hotspotName ?? "the hotspot"}, including this
      one if that's how you're viewing it, will be disconnected. The circuits
      and the fridge use it too, so they will go offline. Tailscale and devices
      on the uplink{ssid ? ` (${ssid})` : ""} are unaffected.
    </Dialog>
  );
}
