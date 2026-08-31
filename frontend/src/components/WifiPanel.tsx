import { useState } from "react";
import { useVanStore } from "../store/van";
import { WifiDetailsDrawer } from "./drawers/WifiDetailsDrawer";
import { ConfirmModal } from "./modals/ConfirmModal";
import { Panel, StatusDot } from "./ui";

function NetworkInfoIcon() {
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

export function WifiPanel({ className }: { className?: string }) {
  const system = useVanStore((s) => s.system);
  const hotspot = useVanStore((s) => s.hotspot);
  const toggleHotspot = useVanStore((s) => s.toggleHotspot);
  const [detailsOpen, setDetailsOpen] = useState(false);
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
            <div className="text-sm  font-semibold text-charge-dc">
              {hotspotOn ? (hotspot?.ssid ?? "on") : "off"}
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              hotspotOn ? setConfirmOff(true) : toggleHotspot(true)
            }
            className="text-xs  px-3 py-1.5 rounded border border-panel-border text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-panel-surface"
          >
            {hotspotOn ? "Turn off" : "Turn on"}
          </button>
        </div>

        <div className="flex items-center justify-between rounded-lg p-3 border bg-panel-bg border-panel-border">
          <div className="flex items-center gap-3">
            <StatusDot on={uplinkOn} tone="success" />
            <div className="text-sm  font-semibold text-charge-dc">
              {system?.ssid ?? "not connected"}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDetailsOpen(true)}
            aria-label="WiFi network details"
            className="rounded p-1.5 border border-panel-border text-zinc-500 hover:border-zinc-500 hover:text-zinc-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-panel-surface"
          >
            <NetworkInfoIcon />
          </button>
        </div>
      </div>

      <WifiDetailsDrawer
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
      />
    </Panel>
  );
}
