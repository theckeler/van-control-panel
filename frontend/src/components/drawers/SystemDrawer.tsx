import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { formatUptime } from "../../lib/format";
import { useVanStore } from "../../store/van";
import type { PiHealth } from "../../types";
import { Button, Drawer, KeyValue, Section, type KeyValueItem } from "../ui";

export function SystemDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Drawer open={open} onClose={onClose} title="System" vc="drawer-system">
      <SystemBody />
    </Drawer>
  );
}

function SystemBody() {
  const [health, setHealth] = useState<PiHealth | null>(null);
  const battery = useVanStore((s) => s.battery);
  const releaseBms = useVanStore((s) => s.releaseBms);
  const connectBms = useVanStore((s) => s.connectBms);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api.system.health().then(
        (h) => !cancelled && setHealth(h),
        () => !cancelled && setHealth(null),
      );
    void load();
    const t = setInterval(load, 10_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const released = battery?.released ?? false;
  const memUsedPct =
    health?.mem_total_mb && health?.mem_available_mb
      ? Math.round(
          ((health.mem_total_mb - health.mem_available_mb) / health.mem_total_mb) * 100,
        )
      : null;

  const items: KeyValueItem[] = health
    ? [
        {
          label: "CPU temp",
          value:
            health.cpu_temp_c !== null
              ? `${Math.round((health.cpu_temp_c * 9) / 5 + 32)}°F`
              : "—",
          tone:
            health.cpu_temp_c === null
              ? undefined
              : health.cpu_temp_c >= 80
                ? "bad"
                : health.cpu_temp_c >= 70
                  ? "warn"
                  : undefined,
        },
        {
          label: "Load",
          value: health.load_1 !== null ? `${health.load_1} / ${health.load_5}` : "—",
        },
        {
          label: "Memory",
          value:
            memUsedPct !== null ? `${memUsedPct}% of ${health.mem_total_mb}MB` : "—",
          tone: memUsedPct !== null && memUsedPct > 90 ? "warn" : undefined,
        },
        {
          label: "Disk free",
          value:
            health.disk_free_gb !== null
              ? `${health.disk_free_gb}GB of ${health.disk_total_gb}GB`
              : "—",
          tone:
            health.disk_free_gb !== null && health.disk_free_gb < 2 ? "bad" : undefined,
        },
        {
          label: "Uptime",
          value: health.uptime_s !== null ? formatUptime(health.uptime_s) : "—",
        },
        ...(health.throttle.length > 0
          ? [{ label: "Throttle", value: health.throttle.join(", "), tone: "bad" as const }]
          : []),
      ]
    : [];

  async function toggleBms() {
    setBusy(true);
    await (released ? connectBms() : releaseBms());
    setBusy(false);
  }

  return (
    <>
      <Section title="Pi health">
        {health ? (
          <KeyValue items={items} />
        ) : (
          <p className="text-body text-ink-muted">Unavailable.</p>
        )}
      </Section>

      <Section title="Battery monitor">
        <p className="text-body text-ink-muted">
          {released
            ? "The Pi is not connected to the battery. Reconnect to resume monitoring."
            : "Frees the Bluetooth link so the Power Queen app can connect. Reconnect when you're done."}
        </p>
        <Button busy={busy} onClick={toggleBms}>
          {released ? "Reconnect BMS" : "Release BMS"}
        </Button>
      </Section>
    </>
  );
}
