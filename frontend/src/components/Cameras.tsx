import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Photo } from "../types";
import { Panel } from "./ui";

const STORAGE_KEY = "van-camera-enabled";

function loadEnabled(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== "false";
}

export function Cameras({ className }: { className?: string }) {
  const [interiorLatest, setInteriorLatest] = useState<Photo | null>(null);
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(loadEnabled);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    api.camera.latest("interior")
      .then(setInteriorLatest)
      .catch(() => setInteriorLatest(null))
      .finally(() => setLoading(false));
  }, [enabled]);

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    localStorage.setItem(STORAGE_KEY, String(next));
    if (!next) setInteriorLatest(null);
  }

  return (
    <Panel className={className}>
      {loading ? (
        <Skeleton />
      ) : enabled ? (
        <CameraPane photo={interiorLatest} />
      ) : (
        <div className="flex items-center justify-center h-40 text-xs font-mono text-zinc-600">
          Camera off
        </div>
      )}
      <button
        type="button"
        onClick={toggle}
        className="w-full text-xs font-mono px-4 py-3 rounded-lg border border-panel-border text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-panel-surface"
      >
        {enabled ? "Turn camera off" : "Turn camera on"}
      </button>
    </Panel>
  );
}

function Skeleton() {
  return (
    <div className="bg-panel-surface border border-panel-border rounded-xl overflow-hidden">
      <div className="h-40 bg-zinc-800 animate-pulse" />
    </div>
  );
}

function formatCaptureTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
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
            {formatCaptureTime(photo.timestamp)}
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
