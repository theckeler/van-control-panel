import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { formatDateTime } from "../../lib/format";
import type { Photo } from "../../types";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useVisibleInterval } from "../../hooks/useVisibleInterval";
import { token } from "../../lib/tokens";
import { useVanStore } from "../../store/van";
import { Button, Dialog, Drawer, Section, Spinner } from "../ui";

export type HistoryTab = "soc" | "solar" | "photos";

function formatHour(ts: string) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDay(ts: string) {
  return new Date(ts + "T00:00:00").toLocaleDateString([], {
    weekday: "short",
    month: "numeric",
    day: "numeric",
  });
}

function downsample<T>(arr: T[], maxPoints: number): T[] {
  if (arr.length <= maxPoints) return arr;
  const step = Math.ceil(arr.length / maxPoints);
  return arr.filter((_, i) => i % step === 0);
}

function socColor(soc: number) {
  if (soc > 50) return token("on");
  if (soc > 20) return token("warn");
  return token("danger");
}

export function HistoryDrawer({
  open,
  onClose,
  tab,
  onTabChange,
}: {
  open: boolean;
  onClose: () => void;
  tab: HistoryTab;
  onTabChange: (tab: HistoryTab) => void;
}) {
  return (
    <Drawer open={open} onClose={onClose} title="History" vc="drawer-history">
      <HistoryBody tab={tab} onTabChange={onTabChange} />
    </Drawer>
  );
}

// Mounted only while the drawer is open, so the heavy history payload is
// fetched on open and not every 5 seconds with the dashboard poll.
function HistoryBody({
  tab,
  onTabChange,
}: {
  tab: HistoryTab;
  onTabChange: (tab: HistoryTab) => void;
}) {
  const socRaw = useVanStore((s) => s.socRaw);
  const solarRaw = useVanStore((s) => s.solarRaw);
  const dailyHistory = useVanStore((s) => s.dailyHistory);
  const fetchHistory = useVanStore((s) => s.fetchHistory);
  const historyLoaded = useVanStore((s) => s.historyLoaded);
  const battery = useVanStore((s) => s.battery);

  // Fetch on open, then every 5 min while open and the tab is visible.
  useVisibleInterval(fetchHistory, 5 * 60 * 1000);

  const socData = downsample(
    socRaw
      .filter((r) => r.soc !== null)
      .map((r) => ({ time: formatHour(r.ts), soc: r.soc as number })),
    60,
  );

  const hasDailyData = dailyHistory.some((d) => d.total_yield !== null);

  const solarData = hasDailyData
    ? dailyHistory
        .filter((d) => d.total_yield !== null)
        .map((d) => ({
          day: formatDay(d.day_ts),
          yield: Math.round(d.total_yield as number),
        }))
    : (() => {
        const buckets = new Map<string, number>();
        solarRaw
          .filter((r) => r.solar_power !== null && (r.solar_power as number) > 0)
          .forEach((r) => {
            const bucket = formatHour(r.ts);
            buckets.set(bucket, Math.max(buckets.get(bucket) ?? 0, r.solar_power as number));
          });
        return Array.from(buckets.entries()).map(([time, peak]) => ({
          day: time,
          yield: Math.round(peak),
        }));
      })();

  // Only show the reference line when the BMS is live and SOC is meaningful.
  const currentSoc = battery?.connected && battery.soc > 0 ? battery.soc : null;
  const chartColor = socColor(currentSoc ?? socData[socData.length - 1]?.soc ?? 99);
  const axis = { fontSize: 12, fill: token("ink-muted") };
  const tooltip = {
    contentStyle: {
      background: token("surface"),
      border: `1px solid ${token("line")}`,
      borderRadius: 6,
      fontSize: 12,
    },
    labelStyle: { color: token("ink-muted") },
    itemStyle: { color: token("ink") },
  };

  const tabs: { id: HistoryTab; label: string }[] = [
    { id: "soc", label: "SOC 24h" },
    { id: "solar", label: hasDailyData ? "Solar 30d" : "Solar" },
    { id: "photos", label: "Photos" },
  ];

  return (
    <Section title={tab === "photos" ? "Camera, last 24 hours" : "Battery and solar"}>
      <div role="group" aria-label="History range" className="grid grid-cols-3 gap-2">
        {tabs.map((t) => (
          <Button
            key={t.id}
            variant={tab === t.id ? "solid" : "outline"}
            aria-pressed={tab === t.id}
            onClick={() => onTabChange(t.id)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {tab === "photos" ? (
        <PhotoHistory />
      ) : !historyLoaded ? (
        <Empty message="Loading…" />
      ) : tab === "soc" ? (
        socData.length < 2 ? (
          <Empty message="SOC history is building. Check back shortly." />
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={socData} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
                <defs>
                  <linearGradient id="socGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chartColor} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" tick={axis} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis domain={[0, 100]} tick={axis} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                <Tooltip {...tooltip} formatter={(v: number) => [`${v.toFixed(1)}%`, "SOC"]} />
                {currentSoc !== null && (
                  <ReferenceLine y={currentSoc} stroke={token("ink-subtle")} strokeDasharray="3 3" />
                )}
                <Area dataKey="soc" stroke={chartColor} strokeWidth={2} fill="url(#socGrad)" dot={false} activeDot={{ r: 3 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )
      ) : solarData.length === 0 ? (
        <Empty message="Solar history builds at midnight each day." />
      ) : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={solarData} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
              <XAxis dataKey="day" tick={axis} tickLine={false} axisLine={false} />
              <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={(v) => (hasDailyData ? `${v}Wh` : `${v}W`)} />
              <Tooltip
                {...tooltip}
                formatter={(v: number) => [
                  `${v}${hasDailyData ? "Wh" : "W"}`,
                  hasDailyData ? "Daily yield" : "Peak solar",
                ]}
              />
              <Bar dataKey="yield" fill={token("warn")} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Section>
  );
}

function Empty({ message }: { message: string }) {
  return (
    <div className="flex h-40 items-center justify-center px-4 text-center text-body text-ink-muted">
      {message}
    </div>
  );
}

// Mounted only while the Photos tab is showing, so the list loads on demand.
function PhotoHistory() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Photo | null>(null);

  useEffect(() => {
    api.camera
      .recent("interior", 20)
      .then(setPhotos)
      .catch(() => setPhotos([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Spinner />
      </div>
    );
  }

  if (!photos.length) return <Empty message="No photos yet." />;

  const when = selected ? formatDateTime(selected.timestamp) : null;

  return (
    <>
      <ul className="flex flex-col gap-2">
        {photos.map((p) => {
          const { date, time } = formatDateTime(p.timestamp);
          return (
            <li key={p.filename}>
              <Button onClick={() => setSelected(p)}>
                <span className="flex w-full justify-between font-normal tabular-nums">
                  <span>{date}</span>
                  <span>{time}</span>
                </span>
              </Button>
            </li>
          );
        })}
      </ul>

      <Dialog
        open={!!selected}
        onClose={() => setSelected(null)}
        title={when ? `${when.date}, ${when.time}` : "Photo"}
        vc="dialog-camera-photo"
        actions={<Button onClick={() => setSelected(null)}>Close</Button>}
      >
        {selected && when && (
          <img
            src={selected.url}
            alt={`Camera, captured ${when.time}`}
            className="w-full rounded"
          />
        )}
      </Dialog>
    </>
  );
}
