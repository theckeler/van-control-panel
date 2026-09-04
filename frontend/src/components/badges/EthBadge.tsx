import clsx from "clsx";
import { useVanStore } from "../../store/van";

/**
 * Wired rescue-port indicator: a dot that's green when an Ethernet cable is
 * plugged into the Pi's eth0 port and linked, gray when nothing is connected.
 *
 * eth0 is the always-on wired fallback (10.55.0.1) for reaching the Pi when
 * WiFi is off — see scripts/setup-eth0-rescue.md. This just surfaces "is a
 * cable in right now" at a glance, since the port lives inside the cabinet.
 */
export function EthBadge({ className }: { className?: string }) {
  const system = useVanStore((s) => s.system);
  if (!system) return null;

  const on = system.eth0_connected;

  return (
    <span
      className={clsx("inline-flex items-center gap-1 text-[10px]", className)}
      title={on ? "Ethernet cable connected (10.55.0.1)" : "No Ethernet cable"}
    >
      <span
        className={clsx(
          "inline-block w-1.5 h-1.5 rounded-full",
          on ? "bg-green-500" : "bg-gray-400",
        )}
      />
      <span className={on ? "text-gray-800" : "text-gray-400"}>eth</span>
    </span>
  );
}
