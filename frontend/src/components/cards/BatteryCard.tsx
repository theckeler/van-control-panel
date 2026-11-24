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

// Thresholds for the Power Queen 12.8V 100Ah LiFePO4 pack. The BMS protects
// the cells itself; these tint the chips before it has to step in.
//
// What is confirmed (Power Queen's product pages and listings, 2026-11-18):
// 12.8V nominal, a 14.6V charger, and charging stopping at 0°C (32°F) on the
// low-temp line. What is NOT confirmed for this exact pack: the low-voltage
// cutoff and the high-temperature limit. Those use typical LiFePO4 figures.
// Check the sticker on the pack and adjust the constants below.

// BMS continuous current rating, amps. Power Queen's listing for this pack
// says 100A (Todd, 2026-11-24), about 1,300W at 12.8V. The "70" in the BMS's
// own name, P-12100BNNA70, is only a part number.
const BMS_MAX_A = 100;

// Resting voltage of a LiFePO4 pack: 12.8V is roughly 20%, 12.0V is nearly
// empty. Over 14.6V is above what the pack's own charger delivers.
function voltageRead(v: number): Read {
  if (v < 12.0) return { tone: "bad", hint: "low" };
  if (v < 12.8) return { tone: "warn", hint: "low" };
  if (v > 14.6) return { tone: "bad", hint: "high" };
  return { tone: "neutral" };
}

// Judged by current against the BMS rating, not by watts: the BMS trips on
// amps, and a few hundred watts is an ordinary load for this pack. Charging
// (current in) is good news.
function powerRead(amps: number, charging: boolean): Read {
  if (charging) return { tone: "good" };
  if (amps >= BMS_MAX_A) return { tone: "bad", hint: "at limit" };
  if (amps >= BMS_MAX_A * 0.8) return { tone: "warn", hint: "heavy" };
  return { tone: "neutral" };
}

// LiFePO4 must not be charged at or below freezing (the BMS stops it on the
// low-temp line, and plain packs get damaged). Discharge is fine to about
// -20°C. 45°C is the usual upper charge limit, 55°C is well into hot.
function tempRead(c: number, charging: boolean): Read {
  if (c >= 55) return { tone: "bad", hint: "hot" };
  if (c >= 45) return { tone: "warn", hint: "hot" };
  if (c <= -20) return { tone: "bad", hint: "freezing" };
  if (c <= 0) {
    return charging
      ? { tone: "bad", hint: "no charge" }
      : { tone: "warn", hint: "cold" };
  }
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
  const retryBms = useVanStore((s) => s.retryBms);
  const retrying = useVanStore((s) => s.rechecking.includes("bms"));
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

  // Cuts the reconnect wait short, but only once the backend allows it: the
  // BMS can lock up if it is retried too fast, so the button waits out a
  // minimum gap and shows how long is left.
  const retryWait = battery.retry_now_in;
  const retryButton = isOffline && !isReleased && retryWait != null && (
    <Button
      size="sm"
      busy={retrying}
      disabled={retryWait > 0}
      onClick={retryBms}
    >
      {retryWait > 0 ? `Retry in ${formatCountdown(retryWait)}` : "Retry now"}
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
        {retryButton}
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
  const power = powerRead(Math.abs(battery.current), isCharging);
  const temp = tempRead(battery.temperature, isCharging);
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
      {retryButton}
      {connectButton}
    </Card>
  );
}
