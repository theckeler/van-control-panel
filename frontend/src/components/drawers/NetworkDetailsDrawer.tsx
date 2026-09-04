import { useModalBehavior } from "../../hooks/useModalBehavior";
import { useVanStore } from "../../store/van";
import { Button, Label, Row } from "../ui";
import { WifiScanCard } from "./WifiScanCard";

/**
 * The WiFi settings surface — network detail for both radios plus the entry
 * point to scan/connect. Opened from WifiCard's Uplink row and from
 * SettingsDrawer, so there's one place for this instead of two copies of
 * the same rows. Room to grow: this is "the wifi settings drawer" for
 * whatever else needs adding later (hotspot password, static IP, etc.).
 */
export function NetworkDetailsDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const panelRef = useModalBehavior(open, onClose);
  const system = useVanStore((s) => s.system);
  const hotspot = useVanStore((s) => s.hotspot);

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
            fullWidth={false}
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

        <section className="flex-1 min-h-0">
          <WifiScanCard />
        </section>
      </div>
    </div>
  );
}
