import clsx from "clsx";
import { useVanStore } from "../../store/van";
import { Panel, StatusDot } from "../ui";

const STARLINK_LAN_PREFIX = "192.168.4.";

const STATE_LABEL: Record<string, string> = {
  CONNECTED: "Connected",
  BOOTING: "Booting",
  SEARCHING: "Searching",
  STOWED: "Stowed",
  OBSTRUCTED: "Obstructed",
  THERMAL_SHUTDOWN: "Too hot",
  NO_SATS: "No satellites",
  NO_DOWNLINK: "No downlink",
  NO_PINGS: "No response",
  UNKNOWN: "Unknown",
};

function mbps(bps: number | null): string | null {
  if (bps == null) return null;
  return `${(bps / 1_000_000).toFixed(1)} Mbps`;
}

function uptime(seconds: number | null): string | null {
  if (seconds == null) return null;
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `up ${days}d ${hours}h`;
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `up ${hours}h ${mins}m`;
  return `up ${mins}m`;
}

export function StarlinkCard({ className }: { className?: string }) {
  const starlink = useVanStore((s) => s.starlink);
  const system = useVanStore((s) => s.system);

  const online = !!starlink?.online;
  const reachable = !!starlink?.reachable;

  const onStarlinkLan = system?.wifi_ip
    ? system.wifi_ip.startsWith(STARLINK_LAN_PREFIX)
    : null;

  let primary = "—";
  let detail = "No data";

  if (starlink) {
    if (!reachable) {
      if (onStarlinkLan === false) {
        primary = "Off network";
        detail = system?.ssid
          ? `Pi is on ${system.ssid}`
          : "Pi is not on Starlink";
      } else {
        primary = "Offline";
        detail = starlink.error ? "Dish unreachable" : "No recent reading";
      }
    } else {
      primary = starlink.state
        ? (STATE_LABEL[starlink.state] ?? starlink.state)
        : "Unknown";

      if (online) {
        const parts = [
          starlink.latency_ms != null
            ? `${Math.round(starlink.latency_ms)} ms`
            : null,
          mbps(starlink.downlink_bps),
        ].filter(Boolean);
        detail = parts.length
          ? parts.join(" · ")
          : (uptime(starlink.uptime_s) ?? "Connected");
      } else {
        detail = uptime(starlink.uptime_s) ?? "Dish responding";
      }
    }
  }

  const obstructed =
    starlink?.currently_obstructed === true ||
    (starlink?.fraction_obstructed != null &&
      starlink.fraction_obstructed > 0.005);

  return (
    <Panel className={className}>
      <div className="flex items-center justify-between rounded-lg p-3 border bg-panel-bg border-panel-border">
        <div className="flex items-center gap-3">
          <StatusDot on={online} tone="success" />
          <div>
            <div className="text-sm  font-semibold text-charge-dc">
              Starlink
            </div>
            {starlink?.power_w != null && (
              <div className="text-xs  text-black">
                {starlink.power_w.toFixed(0)}W
              </div>
            )}
          </div>
        </div>
        <div className="text-right">
          <div
            className={clsx(
              "text-sm  font-semibold",
              online
                ? "text-lime-700"
                : reachable
                  ? "text-amber-500"
                  : "text-black",
            )}
          >
            {primary}
          </div>
          <div className="text-xs  text-black">{detail}</div>
          {(obstructed || (starlink?.alerts.length ?? 0) > 0) && (
            <div className="text-xs  text-amber-600">
              {obstructed ? "obstructed" : `${starlink!.alerts.length} alert`}
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}
