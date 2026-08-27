import clsx from "clsx";
import { useVanStore } from "../store/van";
import { Panel, StatusDot } from "./ui";

/**
 * Starlink Mini — read from the dish's own local gRPC server, not the cloud.
 * Works with no internet, which is the point: the most useful time to know
 * Starlink's state is when it isn't working.
 *
 * `reachable` and `online` deliberately mean different things. Not reachable
 * means we can't talk to the dish at all — unplugged, Ethernet down, or the
 * static route to 192.168.100.0/24 is missing. Reachable but not online means
 * the dish is answering fine but has no service, which is the interesting case
 * in a van. That's why the state string is shown rather than just a dot.
 *
 * See backend/app/services/starlink.py and docs/starlink-status.md.
 */

/**
 * The Pi is on Starlink's LAN only when its IP is in 192.168.4.0/24.
 * Starlink was renumbered off 192.168.1.0/24 in Aug 2026 precisely so the
 * range would identify the network — this is that payoff.
 */
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

  // When the Pi falls back to the home network it is off Starlink's LAN
  // entirely, so the dish is unreachable whether or not Starlink is working.
  // Saying "dish unreachable" there would send you outside to check a dish
  // that is fine. Null means we don't know the Pi's IP yet.
  const onStarlinkLan = system?.wifi_ip
    ? system.wifi_ip.startsWith(STARLINK_LAN_PREFIX)
    : null;

  let primary = "—";
  let detail = "No data";

  if (starlink) {
    if (!reachable) {
      if (onStarlinkLan === false) {
        primary = "Off network";
        detail = system?.ssid ? `Pi is on ${system.ssid}` : "Pi is not on Starlink";
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
        detail = parts.length ? parts.join(" · ") : (uptime(starlink.uptime_s) ?? "Connected");
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
            <div className="text-sm font-mono font-semibold text-charge-dc">
              Starlink
            </div>
            {starlink?.power_w != null && (
              <div className="text-xs font-mono text-zinc-600">
                {starlink.power_w.toFixed(0)}W
              </div>
            )}
          </div>
        </div>
        <div className="text-right">
          <div
            className={clsx(
              "text-sm font-mono font-semibold",
              online
                ? "text-zinc-200"
                : reachable
                  ? "text-amber-500"
                  : "text-zinc-600",
            )}
          >
            {primary}
          </div>
          <div className="text-xs font-mono text-zinc-600">{detail}</div>
          {(obstructed || (starlink?.alerts.length ?? 0) > 0) && (
            <div className="text-xs font-mono text-amber-600">
              {obstructed ? "obstructed" : `${starlink!.alerts.length} alert`}
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}
