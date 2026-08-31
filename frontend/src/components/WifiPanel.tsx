import { useState } from "react";
import { useVanStore } from "../store/van";
import { ConfirmModal } from "./ConfirmModal";
import { Panel, StatusDot } from "./ui";
import { WifiScanDrawer } from "./WifiScanDrawer";

function ChangeWifiIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12.55a11 11 0 0 1 14.08 0" />
      <path d="M1.42 9a16 16 0 0 1 21.16 0" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <path d="M12 20h.01" />
    </svg>
  );
}

/**
 * The two radios, side by side — wlan0 (TwitchWiFi, the Pi's own always-on
 * hotspot AP) and wlan1 (the uplink client: Starlink primary, OHeck
 * fallback). Same underlying data as WifiBadge and the Settings drawer's
 * Network section — this is just a glanceable, always-visible version of it,
 * styled like the Shelly/EcoFlow cards rather than tucked in a drawer.
 */
export function WifiPanel({ className }: { className?: string }) {
  const system = useVanStore((s) => s.system);
  const hotspot = useVanStore((s) => s.hotspot);
  const toggleHotspot = useVanStore((s) => s.toggleHotspot);
  const [scanOpen, setScanOpen] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);

  const hotspotOn = !!hotspot?.active;
  const uplinkOn = !!system?.ssid;

  return (
    <Panel className={className}>
      <ConfirmModal
        open={confirmOff}
        title="Turn off the hotspot?"
        message="Any device currently connected over TwitchWiFi — including this one, if that's how you're viewing this — will be disconnected. Tailscale and OHeck/Starlink-connected devices are unaffected."
        confirmLabel="Turn off"
        danger
        onConfirm={() => {
          setConfirmOff(false);
          toggleHotspot(false);
        }}
        onCancel={() => setConfirmOff(false)}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="flex items-center justify-between rounded-lg p-3 border bg-panel-bg border-panel-border">
          <div className="flex items-center gap-3">
            <StatusDot on={hotspotOn} tone="success" />
            <div>
              <div className="text-sm font-mono font-semibold text-charge-dc">
                Hotspot
              </div>
              <div className="text-xs font-mono text-zinc-600">
                {hotspotOn ? (hotspot?.ssid ?? "on") : "off"}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => (hotspotOn ? setConfirmOff(true) : toggleHotspot(true))}
            className="text-xs font-mono px-3 py-1.5 rounded border border-panel-border text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-panel-surface"
          >
            {hotspotOn ? "Turn off" : "Turn on"}
          </button>
        </div>

        <div className="flex items-center justify-between rounded-lg p-3 border bg-panel-bg border-panel-border">
          <div className="flex items-center gap-3">
            <StatusDot on={uplinkOn} tone="success" />
            <div>
              <div className="text-sm font-mono font-semibold text-charge-dc">
                Uplink
              </div>
              <div className="text-xs font-mono text-zinc-600 truncate max-w-[9rem]">
                {system?.ssid ?? "not connected"}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setScanOpen(true)}
            aria-label="Change WiFi network"
            className="rounded p-1.5 border border-panel-border text-zinc-500 hover:border-zinc-500 hover:text-zinc-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-panel-surface"
          >
            <ChangeWifiIcon />
          </button>
        </div>
      </div>

      <WifiScanDrawer open={scanOpen} onClose={() => setScanOpen(false)} />
    </Panel>
  );
}
