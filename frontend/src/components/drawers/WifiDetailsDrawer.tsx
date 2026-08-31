import clsx from "clsx";
import { useState } from "react";
import { useModalBehavior } from "../../hooks/useModalBehavior";
import { useVanStore } from "../../store/van";
import { Button, Label } from "../ui";
import { WifiScanDrawer } from "./WifiScanDrawer";

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
      <span className="text-[11px]  text-gray-800">{label}</span>
      <span
        className={clsx(
          "text-[11px]  tabular-nums",
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

/**
 * The WiFi settings surface — network detail for both radios plus the entry
 * point to scan/connect. Opened from WifiPanel's Uplink row and from
 * SettingsDrawer, so there's one place for this instead of two copies of
 * the same rows. Room to grow: this is "the wifi settings drawer" for
 * whatever else needs adding later (hotspot password, static IP, etc.).
 */
export function WifiDetailsDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const panelRef = useModalBehavior(open, onClose);
  const system = useVanStore((s) => s.system);
  const hotspot = useVanStore((s) => s.hotspot);
  const [wifiScanOpen, setWifiScanOpen] = useState(false);

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
        aria-label="WiFi settings"
        tabIndex={-1}
        className="relative w-full max-w-sm h-full overflow-y-auto bg-panel-surface border-l border-panel-border p-5 flex flex-col gap-5 focus:outline-none"
      >
        <div className="flex items-center justify-between">
          <Label as="h2">WiFi</Label>
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

        <section>
          <Label as="h3" className="block mb-2">
            Uplink (wlan1)
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
            className="mt-3 w-full text-xs  px-4 py-3 rounded border border-panel-border text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-panel-surface"
          >
            Connect to new WiFi
            <span className="block text-[10px] text-black mt-0.5">
              Scan for and join a new network
            </span>
          </button>
        </section>

        <section>
          <Label as="h3" className="block mb-2">
            Hotspot (wlan0)
          </Label>
          <Row
            label="Status"
            value={hotspot?.active ? "on" : "off"}
            tone={hotspot?.active ? undefined : "warn"}
          />
          <Row label="Broadcasting" value={hotspot?.ssid ?? "—"} />
        </section>
      </div>

      <WifiScanDrawer
        open={wifiScanOpen}
        onClose={() => setWifiScanOpen(false)}
      />
    </div>
  );
}
