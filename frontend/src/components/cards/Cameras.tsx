import { useEffect } from "react";
import { formatDateTime } from "../../lib/format";
import { useCameraStore } from "../../store/camera";
import { Card, IconButton, Spinner, Stat } from "../ui";

export function Cameras({
  className,
  onOpenHistory,
}: {
  className?: string;
  onOpenHistory: () => void;
}) {
  const { enabled, latest, loading, refresh, setEnabled, capture } =
    useCameraStore();

  useEffect(() => {
    void refresh();
  }, [enabled, refresh]);

  return (
    <Card vc="cameras-card" title="Camera" className={className}>
      <div className="flex aspect-video items-center justify-center overflow-hidden rounded bg-page">
        {!enabled ? (
          <p className="text-body text-ink-muted">Camera off</p>
        ) : loading ? (
          <Spinner />
        ) : latest ? (
          <img
            src={latest.url}
            alt={`Camera, captured ${formatDateTime(latest.timestamp).time}`}
            className="size-full object-cover"
          />
        ) : (
          <p className="text-body text-ink-muted">No photo available</p>
        )}
      </div>
      <div className="flex items-center justify-between gap-3">
        {latest && enabled ? (
          <Stat
            variant="row"
            value={formatDateTime(latest.timestamp).time}
            className="min-w-24"
          />
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          <IconButton icon="images" label="Photo history" onClick={onOpenHistory} />
          <IconButton
            icon="camera"
            label="Take a photo now"
            disabled={!enabled}
            onClick={() => void capture()}
          />
          <IconButton
            icon={enabled ? "video" : "video-off"}
            tone={enabled ? "on" : "off"}
            label={enabled ? "Turn camera off" : "Turn camera on"}
            onClick={() => setEnabled(!enabled)}
          />
        </div>
      </div>
    </Card>
  );
}
