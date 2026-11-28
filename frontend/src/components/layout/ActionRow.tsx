import { useCameraStore } from "../../store/camera";
import { TileButton } from "../ui";

// Backup and Power on top, the camera switch under them. Power is always here,
// renders with no data, and keeps working when a poll is hung.
export function ActionRow({
  onBackup,
  onPower,
}: {
  onBackup: () => void;
  onPower: () => void;
}) {
  const cameraOn = useCameraStore((s) => s.enabled);
  const setCamera = useCameraStore((s) => s.setEnabled);

  return (
    <div
      data-vc="action-row"
      className="grid grid-cols-2 grid-rows-2 gap-2"
    >
      <TileButton icon="save" label="Backup" onClick={onBackup} />
      <TileButton icon="power" label="Power" onClick={onPower} />
      <TileButton
        icon={cameraOn ? "video" : "video-off"}
        label={cameraOn ? "Camera" : "Camera off"}
        tone={cameraOn ? "on" : "off"}
        aria-label={cameraOn ? "Camera on. Turn off" : "Camera off. Turn on"}
        onClick={() => setCamera(!cameraOn)}
        className="col-span-2"
      />
    </div>
  );
}
