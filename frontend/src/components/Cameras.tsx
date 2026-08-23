import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Photo } from "../types";
import { Panel } from "./ui";

export function Cameras({ className }: { className?: string }) {
  const [interiorLatest, setInteriorLatest] = useState<Photo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.camera.latest("interior")
      .then(setInteriorLatest)
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  return (
    <Panel className={className}>
      {loading ? (
        <div className="text-xs font-mono text-zinc-600 animate-pulse">
          Loading...
        </div>
      ) : (
        <CameraPane photo={interiorLatest} />
      )}
    </Panel>
  );
}

function CameraPane({ label, photo }: { label?: string; photo: Photo | null }) {
  return (
    <div className="bg-panel-surface border border-panel-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between border-b border-panel-border">
        {label && (
          <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest">
            {label}
          </span>
        )}
        {photo && (
          <span className="text-xs font-mono text-zinc-600">
            {photo.timestamp}
          </span>
        )}
      </div>
      {photo ? (
        <img
          src={photo.url}
          alt={`${label ?? "interior"} camera`}
          className="w-full object-cover"
          style={{ maxHeight: "280px" }}
        />
      ) : (
        <div className="flex items-center justify-center h-40 text-xs font-mono text-zinc-600">
          No photo available
        </div>
      )}
    </div>
  );
}
