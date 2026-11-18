import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { formatCountdown, formatLastSeen } from "../../lib/format";
import { useVanStore } from "../../store/van";
import {
  Badge,
  Button,
  Card,
  IconButton,
  IconCircle,
  Progress,
  Stat,
  type StatTone,
} from "../ui";

type Read = { tone: StatTone; hint?: string };

// Thresholds for a 12V LiFePO4 pack. They are starting points to tune, not
// manufacturer limits: the BMS itself protects the cells.
function voltageRead(v: number): Read {
  if (v < 12.0) return { tone: "bad", hint: "low" };
  if (v < 12.8) return { tone: "warn", hint: "low" };
  if (v > 14.6) return { tone: "bad", hint: "high" };
  return { tone: "neutral" };
}

// Charging (current in) is good news; a heavy draw is the thing to notice.
function powerRead(watts: number, charging: boolean): Read {
  if (charging) return { tone: "good" };
  if (watts >= 300) return { tone: "bad", hint: "heavy" };
  if (watts >= 150) return { tone: "warn", hint: "high" };
  return { tone: "neutral" };
}

// LiFePO4 should not be charged below freezing and dislikes heat.
function tempRead(c: number): Read {
  if (c >= 55) return { tone: "bad", hint: "hot" };
  if (c >= 45) return { tone: "warn", hint: "hot" };
  if (c <= 0) return { tone: "warn", hint: "cold" };
  return { tone: "neutral" };
}

export function BatteryCard({
  className,
  onOpenHistory,
}: {
  className?: string;
  onOpenHistory: () => void;
}) {
  const battery = useVanStore((s) => s.battery);
  const connectBms = useVanStore((s) => s.connectBms);
  const [busy, setBusy] = useState(false);

  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (battery?.retry_in != null && battery.retry_in > 0) {
      setCountdown(battery.retry_in);
      if (countdownRef.current) clearInterval(countdownRef.current);
      countdownRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev === null || prev <= 1) {
            clearInterval(countdownRef.current!);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (countdownRef.current) clearInterval(countdownRef.current);
      setCountdown(null);
    }
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [battery?.retry_in]);

  if (!battery) {
    return (
      <Card vc="battery-card" title="Battery" className={className}>
        <p className="text-body text-ink-muted">Loading…</p>
      </Card>
    );
  }

  const isOffline = !battery.connected;
  const isReleased = battery.released;
  const hasCache = battery.soc > 0 || battery.voltage > 0;

  const handleConnect = async () => {
    setBusy(true);
    await connectBms();
    setBusy(false);
  };

  const history = (
<IconButton icon="history" label="Battery history" onClick={onOpenHistory} />
  );

  const connectButton = isReleased && (
    <Button size="sm" busy={busy} onClick={handleConnect}>
      Reconnect to the battery
    </Button>
  );

  const retry =
    isOffline && !isReleased && countdown !== null && countdown > 0
      ? `Retrying in ${formatCountdown(countdown)}`
      : null;

  if (isOffline && !hasCache) {
    return (
      <Card vc="battery-card" title="Battery" action={history} className={className}>
        <p className="text-body text-ink">Offline, no reading yet</p>
        {retry && <p className="text-caption text-ink-muted">{retry}</p>}
        {connectButton}
      </Card>
    );
  }

  const socTone =
    battery.soc > 50
      ? "text-on-text"
      : battery.soc > 20
        ? "text-warn-text"
        : "text-danger-text";

  const isCharging = battery.current > 0;
  const wattsNum = Math.abs(battery.current * battery.voltage);
  const watts = wattsNum.toFixed(0);
  const volts = voltageRead(battery.voltage);
  const power = powerRead(wattsNum, isCharging);
  const temp = tempRead(battery.temperature);
  const offlineNow = isOffline && !isReleased;

  return (
    <Card
      vc="battery-card"
      offline={offlineNow}
      lastSeen={battery.last_seen ? formatLastSeen(battery.last_seen) : undefined}
      className={className}
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className={clsx(
            "text-display tabular-nums",
            offlineNow ? "text-ink-muted" : socTone,
          )}
        >
          {battery.soc.toFixed(1)}
          <span className="text-title">%</span>
        </span>
        <div className="flex items-center gap-3">
          {/* Live is a lone circle: every other state says so in words (the
              "Released" badge, or "Offline · last seen" on the card), and
              the circle carries a name for screen readers and a tooltip. */}
          {!offlineNow &&
            (isReleased ? (
              <Badge>Released</Badge>
            ) : (
              <IconCircle icon="battery" tone="on" label="Live" />
            ))}
          {history}
        </div>
      </div>

      <Progress value={battery.soc} label="Battery charge" offline={offlineNow} />

      <div className="grid grid-cols-3 gap-2">
        <Stat
          value={`${battery.voltage.toFixed(2)}V`}
          tone={volts.tone}
          hint={volts.hint}
          offline={offlineNow}
        />
        <Stat
          label={isCharging ? "In" : "Out"}
          value={`${watts}W`}
          tone={power.tone}
          hint={power.hint}
          offline={offlineNow}
        />
        <Stat
          value={`${((battery.temperature * 9) / 5 + 32).toFixed(1)}°F`}
          tone={temp.tone}
          hint={temp.hint}
          offline={offlineNow}
        />
      </div>

      {retry && <p className="text-caption text-ink-muted">{retry}</p>}
      {connectButton}
    </Card>
  );
}
