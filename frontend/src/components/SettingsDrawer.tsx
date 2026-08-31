import clsx from "clsx";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useModalBehavior } from "../hooks/useModalBehavior";
import { toast } from "../store/toast";
import { useVanStore } from "../store/van";
import type { BackupStatus, DiskImageStatus, PiHealth } from "../types";
import { ThemeToggle } from "./ThemeToggle";
import { Button, Label } from "./ui";
import { WifiScanDrawer } from "./WifiScanDrawer";

function fmtUptime(s: number) {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warn" | "bad";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-panel-border/50 last:border-0">
      <span className="text-[11px] font-mono text-zinc-500">{label}</span>
      <span
        className={clsx(
          "text-[11px] font-mono tabular-nums",
          tone === "bad"
            ? "text-red-400"
            : tone === "warn"
              ? "text-amber-400"
              : "text-zinc-300",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function SettingsDrawer({
  open,
  onClose,
  onPower,
}: {
  open: boolean;
  onClose: () => void;
  onPower: () => void;
}) {
  const panelRef = useModalBehavior(open, onClose);
  const [health, setHealth] = useState<PiHealth | null>(null);
  const [backup, setBackup] = useState<BackupStatus | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [wifiScanOpen, setWifiScanOpen] = useState(false);
  const [imageStatus, setImageStatus] = useState<DiskImageStatus | null>(null);
  const [imageBusy, setImageBusy] = useState(false);

  async function doDownload() {
    setDownloading(true);
    try {
      const res = await fetch(api.system.backupUrl(), {
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error(`server returned ${res.status}`);
      const blob = await res.blob();
      const name =
        res.headers
          .get("content-disposition")
          ?.match(/filename="?([^";]+)"?/)?.[1] ?? "van_power.db.gz";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Downloaded ${name}`);
    } catch (err) {
      toast.error(
        `Backup failed — ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setDownloading(false);
    }
  }

  async function doCreateImage() {
    setImageBusy(true);
    try {
      const r = await api.system.diskImageStart();
      if (!r.ok) {
        toast.error(r.message);
      } else {
        setImageStatus({ state: "running", bytes_written: 0, filename: null, error: null });
      }
    } catch (err) {
      toast.error(`Failed to start — ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setImageBusy(false);
    }
  }

  async function doCancelImage() {
    setImageBusy(true);
    try {
      await api.system.diskImageCancel();
      setImageStatus(null);
    } catch (err) {
      toast.error(`Cancel failed — ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setImageBusy(false);
    }
  }

  const battery = useVanStore((s) => s.battery);
  const releaseBms = useVanStore((s) => s.releaseBms);
  const connectBms = useVanStore((s) => s.connectBms);
  const system = useVanStore((s) => s.system);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const load = () => {
      api.system.health().then(
        (h) => !cancelled && setHealth(h),
        () => !cancelled && setHealth(null),
      );
      api.system.backupStatus().then(
        (b) => !cancelled && setBackup(b),
        () => !cancelled && setBackup(null),
      );
      api.system.diskImageStatus().then(
        (s) => !cancelled && setImageStatus(s),
        () => {},
      );
    };

    load();
    const t = setInterval(load, 10_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [open]);

  // Faster poll while image creation is in progress
  useEffect(() => {
    if (!open || imageStatus?.state !== "running") return;
    let cancelled = false;
    const t = setInterval(() => {
      api.system.diskImageStatus().then(
        (s) => !cancelled && setImageStatus(s),
        () => {},
      );
    }, 3_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [open, imageStatus?.state]);

  if (!open) return null;

  const released = battery?.released ?? false;
  const memUsedPct =
    health?.mem_total_mb && health?.mem_available_mb
      ? Math.round(
          ((health.mem_total_mb - health.mem_available_mb) /
            health.mem_total_mb) *
            100,
        )
      : null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        tabIndex={-1}
        className="relative w-full max-w-sm h-full overflow-y-auto bg-panel-surface border-l border-panel-border p-5 flex flex-col gap-5 focus:outline-none"
      >
        <div className="flex items-center justify-between">
          <Label as="h2">Settings</Label>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close settings"
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

        <section>
          <Label as="h3" className="block mb-2">
            Pi Health
          </Label>
          {health ? (
            <>
              <Row
                label="CPU temp"
                value={
                  health.cpu_temp_c !== null ? `${health.cpu_temp_c}°C` : "—"
                }
                tone={
                  health.cpu_temp_c === null
                    ? undefined
                    : health.cpu_temp_c >= 80
                      ? "bad"
                      : health.cpu_temp_c >= 70
                        ? "warn"
                        : undefined
                }
              />
              <Row
                label="Load"
                value={
                  health.load_1 !== null
                    ? `${health.load_1} / ${health.load_5}`
                    : "—"
                }
              />
              <Row
                label="Memory"
                value={
                  memUsedPct !== null
                    ? `${memUsedPct}% of ${health.mem_total_mb}MB`
                    : "—"
                }
                tone={
                  memUsedPct !== null && memUsedPct > 90 ? "warn" : undefined
                }
              />
              <Row
                label="Disk free"
                value={
                  health.disk_free_gb !== null
                    ? `${health.disk_free_gb}GB of ${health.disk_total_gb}GB`
                    : "—"
                }
                tone={
                  health.disk_free_gb !== null && health.disk_free_gb < 2
                    ? "bad"
                    : undefined
                }
              />
              <Row
                label="Uptime"
                value={
                  health.uptime_s !== null ? fmtUptime(health.uptime_s) : "—"
                }
              />
              {health.throttle.length > 0 && (
                <Row
                  label="Throttle"
                  value={health.throttle.join(", ")}
                  tone="bad"
                />
              )}
            </>
          ) : (
            <div className="text-[11px] font-mono text-zinc-600">
              unavailable
            </div>
          )}
        </section>

        <section>
          <Label as="h3" className="block mb-2">
            Network
          </Label>
          <Row
            label="SSID"
            value={system?.ssid ?? "not connected"}
            tone={system?.ssid ? undefined : "bad"}
          />
          <Row label="Band" value={system?.band ?? "—"} />
          <Row
            label="Signal"
            value={
              system?.wifi_signal_dbm != null
                ? `${system.wifi_signal_dbm} dBm`
                : "—"
            }
            tone={
              system?.wifi_signal_dbm != null && system.wifi_signal_dbm < -70
                ? "warn"
                : undefined
            }
          />
          <Row label="IP" value={system?.wifi_ip ?? "—"} />

          <button
            type="button"
            onClick={() => setWifiScanOpen(true)}
            className="mt-3 w-full text-xs font-mono px-4 py-3 rounded border border-panel-border text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-panel-surface"
          >
            Connect to new WiFi
            <span className="block text-[10px] text-zinc-600 mt-0.5">
              Scan for and join a new network
            </span>
          </button>
        </section>

        <section>
          <Label as="h3" className="block mb-2">
            Backup
          </Label>
          <Row
            label="Database"
            value={
              backup?.db_size_bytes
                ? `${(backup.db_size_bytes / 1024 / 1024).toFixed(1)} MB`
                : "—"
            }
          />
          <Row
            label="Readings"
            value={backup?.row_counts?.readings_raw?.toLocaleString() ?? "—"}
          />
          <Row
            label="Nightly job"
            value={
              backup?.last_scheduled_run
                ? new Date(backup.last_scheduled_run).toLocaleString()
                : "never run"
            }
            tone={backup?.last_scheduled_run ? undefined : "warn"}
          />
          {!!backup?.pending_failed && (
            <Row
              label="Unsent"
              value={`${backup.pending_failed} held on the Pi`}
              tone="warn"
            />
          )}

          <button
            type="button"
            disabled={downloading}
            onClick={doDownload}
            className="mt-3 w-full text-xs font-mono px-4 py-3 rounded border border-panel-border text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-panel-surface"
          >
            {downloading ? "Preparing…" : "Download database"}
            <span className="block text-[10px] text-zinc-600 mt-0.5">
              Gzipped snapshot. Readings only, no credentials
            </span>
          </button>
        </section>

        <section>
          <Label as="h3" className="block mb-2">
            SD Image
          </Label>
          <Row
            label="Status"
            value={
              !imageStatus?.state
                ? "No image"
                : imageStatus.state === "running"
                  ? "Creating…"
                  : imageStatus.state === "done"
                    ? "Ready to download"
                    : `Error: ${imageStatus.error ?? "unknown"}`
            }
            tone={imageStatus?.state === "error" ? "warn" : undefined}
          />
          {imageStatus?.bytes_written != null && imageStatus.bytes_written > 0 && (
            <Row
              label="Written"
              value={`${(imageStatus.bytes_written / 1024 / 1024 / 1024).toFixed(2)} GB`}
            />
          )}

          <button
            type="button"
            disabled={imageBusy || imageStatus?.state === "running"}
            onClick={doCreateImage}
            className="mt-3 w-full text-xs font-mono px-4 py-3 rounded border border-panel-border text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-panel-surface"
          >
            {imageStatus?.state === "running" ? "Creating image…" : "Create SD image"}
            <span className="block text-[10px] text-zinc-600 mt-0.5">
              Full SD card snapshot · ~1–2 GB gzipped · ~45 min
            </span>
          </button>

          {imageStatus?.state === "done" && (
            <a
              href={api.system.diskImageUrl()}
              download={imageStatus.filename ?? "van-pi.img.gz"}
              className="mt-2 block w-full text-xs font-mono px-4 py-3 rounded border border-panel-border text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-panel-surface"
            >
              Download image
              <span className="block text-[10px] text-zinc-600 mt-0.5">
                {imageStatus.filename ?? "van-pi.img.gz"}
              </span>
            </a>
          )}

          {(imageStatus?.state === "running" || imageStatus?.state === "done") && (
            <button
              type="button"
              disabled={imageBusy}
              onClick={doCancelImage}
              className="mt-1 w-full text-xs font-mono px-4 py-2 rounded border border-panel-border text-zinc-500 hover:text-red-400 hover:border-red-800 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-panel-surface"
            >
              {imageStatus.state === "running" ? "Cancel" : "Delete image"}
              <span className="block text-[10px] text-zinc-600 mt-0.5">
                {imageStatus.state === "running"
                  ? "Stops dd and removes the partial file"
                  : "Frees space on the Pi"}
              </span>
            </button>
          )}
        </section>

        <section className="flex flex-col gap-2 mt-auto">
          <Label as="h3" className="block mb-1">
            Controls
          </Label>

          <button
            type="button"
            onClick={() => (released ? connectBms() : releaseBms())}
            className="w-full text-xs font-mono px-4 py-3 rounded border border-panel-border text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-panel-surface"
          >
            {released ? "Reconnect BMS" : "Release BMS"}
            <span className="block text-[10px] text-zinc-600 mt-0.5">
              {released
                ? "Resume monitoring from the Pi"
                : "Free the Bluetooth link for the Power Queen app"}
            </span>
          </button>

          <button
            type="button"
            onClick={onPower}
            className="w-full text-xs font-mono px-4 py-3 rounded border border-amber-800 bg-accent text-white text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-panel-surface"
          >
            Power options
            <span className="block text-[10px] text-amber-300/50 mt-0.5">
              Reboot or shut down the Pi
            </span>
          </button>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] font-mono text-zinc-500">Theme</span>
            <ThemeToggle className="rounded p-1.5 border border-panel-border text-zinc-500 hover:border-zinc-500 hover:text-zinc-300 transition-colors" />
          </div>
        </section>
      </div>

      <WifiScanDrawer open={wifiScanOpen} onClose={() => setWifiScanOpen(false)} />
    </div>
  );
}
