import { useCameraStore } from "../../store/camera";
import { useVanStore } from "../../store/van";
import { TileButton } from "../ui";

// The four things reached from the dashboard in one tap, as a 2x2 grid of
// tiles. Power is always here, renders with no data, and keeps working when a
// poll is hung.
export function ActionRow({
  onWifi,
  onCamera,
  onBackup,
  onPower,
}: {
  onWifi: () => void;
  onCamera: () => void;
  onBackup: () => void;
  onPower: () => void;
}) {
  const ssid = useVanStore((s) => s.system?.ssid);
  const cameraOn = useCameraStore((s) => s.enabled);

  return (
    <div
      data-vc="action-row"
      className="grid grid-cols-2 grid-rows-2 gap-2"
    >
      <TileButton
        icon="wifi"
        label="WiFi"
        tone={ssid ? "on" : "off"}
        aria-label={ssid ? `WiFi, connected to ${ssid}` : "WiFi, not connected"}
        onClick={onWifi}
      />
      <TileButton
        icon={cameraOn ? "video" : "video-off"}
        label={cameraOn ? "Camera" : "Camera off"}
        tone={cameraOn ? "on" : "off"}
        onClick={onCamera}
      />
      <TileButton icon="save" label="Backup" onClick={onBackup} />
      <TileButton icon="power" label="Power" onClick={onPower} />
    </div>
  );
}
