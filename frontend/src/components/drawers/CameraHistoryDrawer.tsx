import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { useModalBehavior } from "../../hooks/useModalBehavior";
import type { Photo } from "../../types";
import { Button, Label, Modal, SelectableTile, Spinner } from "../ui";

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString([], { month: "short", day: "numeric" }),
    time: d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
  };
}

export function CameraHistoryDrawer({
  open,
  onClose,
  cam = "interior",
}: {
  open: boolean;
  onClose: () => void;
  cam?: "interior" | "exterior";
}) {
  const panelRef = useModalBehavior(open, onClose);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Photo | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api.camera
      .recent(cam, 20)
      .then(setPhotos)
      .catch(() => setPhotos([]))
      .finally(() => setLoading(false));
  }, [open, cam]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Camera history"
        tabIndex={-1}
        className="relative w-full max-w-sm h-full overflow-y-auto bg-panel-surface border-l border-panel-border p-5 flex flex-col gap-2 focus:outline-none"
      >
        <div className="flex items-center justify-between mb-2">
          <Label as="h2">Camera history</Label>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close"
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : photos.length ? (
          photos.map((p) => {
            const { date, time } = formatDateTime(p.timestamp);
            return (
              <SelectableTile
                key={p.filename}
                selected={false}
                onClick={() => setSelected(p)}
                className="w-full flex items-center justify-between px-3 py-2 rounded border border-panel-border text-left text-xs hover:border-gray-500 transition-colors"
              >
                <span className="text-gray-800">{date}</span>
                <span className="text-gray-600">{time}</span>
              </SelectableTile>
            );
          })
        ) : (
          <span className="text-xs text-gray-600">No history yet</span>
        )}
      </div>

      {selected && (
        <Modal
          open={!!selected}
          onCancel={() => setSelected(null)}
          className="max-w-2xl"
        >
          <img
            src={selected.url}
            alt={`${cam} camera, captured ${formatDateTime(selected.timestamp).time}`}
            className="w-full rounded"
          />
          <span className="text-xs text-gray-600">
            {formatDateTime(selected.timestamp).date} ·{" "}
            {formatDateTime(selected.timestamp).time}
          </span>
          <Button onClick={() => setSelected(null)}>Close</Button>
        </Modal>
      )}
    </div>
  );
}
