import { useEffect, useState } from "react";
import clsx from "clsx";
import { api } from "../api/client";
import { useModalBehavior } from "../hooks/useModalBehavior";
import { useVanStore } from "../store/van";
import { Button, Label } from "./ui";
import { ThemeToggle } from "./ThemeToggle";
import { toast } from "../store/toast";
import type { PiHealth, WifiProfile } from "../types";

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
          tone === "bad" ? "text-red-400"
          : tone === "warn" ? "text-amber-400"
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
  const [profiles, setProfiles] = useState<WifiProfile[]>([]);
  const [switching, setSwitching] = useState<string | null>(null);

  const battery = useVanStore((s) => s.battery);
  const releaseBms = useVanStore((s) => s.releaseBms);
  const connectBms = useVanStore((s) => s.connectBms);
  const system = useVanStore((s) => s.system);
  const fetchAll = useVanStore((s) => s.fetchAll);

  async function doSwitch(name: string) {
    setSwitching(name);
    try {
      const res = await api.system.switchWifi(name);
      toast[res.ok ? "success" : "error"](
        res.ok ? `Switched to ${name}` : res.message,
      );
    } catch {
      // Expected on a LAN connection — the Pi changes address mid-request, so
      // the response never arrives even though the switch worked.
      toast.info("Switch sent — the Pi is changing networks");
    } finally {
      setSwitching(null);
      // Refresh both: the profile list for the active marker, and the store's
      // system data for the SSID/band/IP rows. Without the fetchAll the panel
      // shows stale values until the next 5s poll, or until reopened.
      refreshNetwork();
      fetchAll();
    }
  }

  /** Profiles are only fetched while the drawer is open. */
  function refreshNetwork() {
    api.system.wifiProfiles().then(setProfiles, () => setProfiles([]));
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const load = () => {
      api.system.health().then(
        (h) => !cancelled && setHealth(h),
        () => !cancelled && setHealth(null),
      );
      api.system.wifiProfiles().then(
        (p) => !cancelled && setProfiles(p),
        () => !cancelled && setProfiles([]),
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
          ((health.mem_total_mb - health.mem_available_mb) / health.mem_total_mb) * 100,
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
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close settings">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </Button>
        </div>

        <section>
          <Label as="h3" className="block mb-2">Pi Health</Label>
          {health ? (
            <>
              <Row
                label="CPU temp"
                value={health.cpu_temp_c !== null ? `${health.cpu_temp_c}°C` : "—"}
                tone={
                  health.cpu_temp_c === null ? undefined
                  : health.cpu_temp_c >= 80 ? "bad"
                  : health.cpu_temp_c >= 70 ? "warn"
                  : undefined
                }
              />
              <Row label="Load" value={health.load_1 !== null ? `${health.load_1} / ${health.load_5}` : "—"} />
              <Row
                label="Memory"
                value={memUsedPct !== null ? `${memUsedPct}% of ${health.mem_total_mb}MB` : "—"}
                tone={memUsedPct !== null && memUsedPct > 90 ? "warn" : undefined}
              />
              <Row
                label="Disk free"
                value={health.disk_free_gb !== null ? `${health.disk_free_gb}GB of ${health.disk_total_gb}GB` : "—"}
                tone={health.disk_free_gb !== null && health.disk_free_gb < 2 ? "bad" : undefined}
              />
              <Row label="Uptime" value={health.uptime_s !== null ? fmtUptime(health.uptime_s) : "—"} />
              {health.throttle.length > 0 && (
                <Row label="Throttle" value={health.throttle.join(", ")} tone="bad" />
              )}
            </>
          ) : (
            <div className="text-[11px] font-mono text-zinc-600">unavailable</div>
          )}
        </section>

        <section>
          <Label as="h3" className="block mb-2">Network</Label>
          <Row label="SSID" value={system?.ssid ?? "not connected"} tone={system?.ssid ? undefined : "bad"} />
          <Row label="Band" value={system?.band ?? "—"} />
          <Row
            label="Signal"
            value={system?.wifi_signal_dbm != null ? `${system.wifi_signal_dbm} dBm` : "—"}
            tone={system?.wifi_signal_dbm != null && system.wifi_signal_dbm < -70 ? "warn" : undefined}
          />
          <Row label="IP" value={system?.wifi_ip ?? "—"} />

          {profiles.length > 1 && (
            <div className="mt-3 flex flex-col gap-1.5">
              {profiles.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  disabled={p.active || switching !== null}
                  onClick={() => doSwitch(p.name)}
                  className={clsx(
                    "w-full text-[11px] font-mono px-3 py-2 rounded-lg border text-left transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-panel-surface",
                    "disabled:cursor-not-allowed",
                    p.active
                      ? "bg-accent/15 border-accent text-accent"
                      : "border-panel-border text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-50",
                  )}
                >
                  {switching === p.name ? "switching…" : p.name}
                  {p.active && <span className="float-right">active</span>}
                </button>
              ))}
              <p className="text-[10px] font-mono text-zinc-600 leading-relaxed mt-1">
                Switching drops the Pi's LAN address. The dashboard reconnects
                over Tailscale; on the LAN you may need to rejoin the same
                network. Automatic Starlink preference pauses for 30 minutes.
              </p>
            </div>
          )}
        </section>

        <section className="flex flex-col gap-2 mt-auto">
          <Label as="h3" className="block mb-1">Controls</Label>

          <button
            type="button"
            onClick={() => (released ? connectBms() : releaseBms())}
            className="w-full text-xs font-mono px-4 py-3 rounded-lg border border-panel-border text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-panel-surface"
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
            className="w-full text-xs font-mono px-4 py-3 rounded-lg border border-amber-800 bg-amber-900/30 text-amber-300 hover:bg-amber-900/50 transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-panel-surface"
          >
            Power options
            <span className="block text-[10px] text-amber-300/50 mt-0.5">
              Reboot or shut down the Pi
            </span>
          </button>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] font-mono text-zinc-500">Theme</span>
            <ThemeToggle className="rounded-lg p-1.5 border border-panel-border text-zinc-500 hover:border-zinc-500 hover:text-zinc-300 transition-colors" />
          </div>
        </section>
      </div>
    </div>
  );
}
