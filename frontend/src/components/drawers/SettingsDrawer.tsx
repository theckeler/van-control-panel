import clsx from "clsx";
import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { useModalBehavior } from "../../hooks/useModalBehavior";
import { toast } from "../../store/toast";
import { useVanStore } from "../../store/van";
import type { BackupStatus, PiHealth } from "../../types";
import { HistoryCard } from "../cards/HistoryCard";
import { Button, Label } from "../ui";
import { WifiDetailsDrawer } from "./NetworkDetailsDrawer";

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
      <span className="text-[11px] text-gray-800">{label}</span>
      <span
        className={clsx(
          "text-[11px]  tabular-nums",
          tone === "bad"
            ? "text-red-400"
            : tone === "warn"
              ? "text-amber-400"
              : "text-black",
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
  const [wifiDetailsOpen, setWifiDetailsOpen] = useState(false);

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
    };

    load();
    const t = setInterval(load, 10_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [open]);

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
        className="relative w-full max-w-sm h-full overflow-y-auto bg-panel-surface border-l border-panel-border p-5 flex flex-col gap-5 pb-12"
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
                  health.cpu_temp_c !== null
                    ? `${(Math.round(health.cpu_temp_c) * 9) / 5 + 32}°F`
                    : "—"
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
            <div className="text-[11px]  text-black">unavailable</div>
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
        </section>

        <section className="flex flex-col gap-2 mt-auto">
          <Label as="h3" className="block mb-1">
            Options
          </Label>

          <button
            type="button"
            onClick={() => setWifiDetailsOpen(true)}
            className="w-full text-sm px-4 py-3 rounded border border-gray-800 text-gray-900"
          >
            WiFi settings
            <span className="block text-[10px] text-black mt-0.5">
              Signal, IP, hotspot status, connect to a new network
            </span>
          </button>

          <button
            type="button"
            disabled={downloading}
            onClick={doDownload}
            className="w-full text-sm px-4 py-3 rounded border border-gray-800 text-gray-900"
          >
            {downloading ? "Preparing…" : "Download database"}
            <span className="block text-[10px] text-black mt-0.5">
              Gzipped snapshot. Readings only, no credentials
            </span>
          </button>

          <button
            type="button"
            onClick={() => (released ? connectBms() : releaseBms())}
            className="w-full text-sm px-4 py-3 rounded border border-gray-800 text-gray-900"
          >
            {released ? "Reconnect BMS" : "Release BMS"}
            <span className="block text-[11px] text-black mt-0.5">
              {released
                ? "Resume monitoring from the Pi"
                : "Free the Bluetooth link for the Power Queen app"}
            </span>
          </button>

          <button
            type="button"
            onClick={onPower}
            className="w-full px-4 py-3 rounded border border-amber-800 bg-amber-400 text-black font-bold"
          >
            Power options
          </button>
        </section>

        <HistoryCard />
      </div>

      <WifiDetailsDrawer
        open={wifiDetailsOpen}
        onClose={() => setWifiDetailsOpen(false)}
      />
    </div>
  );
}
