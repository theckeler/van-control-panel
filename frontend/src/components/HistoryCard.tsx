import clsx from "clsx";
import { useState } from "react";
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
import { useVanStore } from "../store/van";
import { useVisibleInterval } from "../hooks/useVisibleInterval";
import { Panel } from "./ui";

type Tab = "soc" | "solar";

function formatHour(ts: string) {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
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
  if (soc > 50) return "#22c55e";
  if (soc > 20) return "#f59e0b";
  return "#ef4444";
}

export function HistoryCard({ className }: { className?: string }) {
  const [tab, setTab] = useState<Tab>("soc");
  const { socRaw, solarRaw, dailyHistory, fetchHistory, historyLoaded, battery } = useVanStore((s) => ({
    socRaw: s.socRaw,
    solarRaw: s.solarRaw,
    dailyHistory: s.dailyHistory,
    fetchHistory: s.fetchHistory,
    historyLoaded: s.historyLoaded,
    battery: s.battery,
  }));

  // Refetch every 5 min, paused while the tab is hidden. History is the
  // heavy payload, so this is the one most worth not doing unwatched.
  useVisibleInterval(fetchHistory, 5 * 60 * 1000);


  const socData = downsample(
    socRaw.filter((r) => r.soc !== null).map((r) => ({ time: formatHour(r.ts), soc: r.soc as number })),
    60,
  );

  const hasDailyData = dailyHistory.some((d) => d.total_yield !== null);

  const solarData = hasDailyData
    ? dailyHistory.filter((d) => d.total_yield !== null).map((d) => ({ day: formatDay(d.day_ts), yield: Math.round(d.total_yield as number) }))
    : (() => {
        const buckets = new Map<string, number>();
        solarRaw.filter((r) => r.solar_power !== null && (r.solar_power as number) > 0).forEach((r) => {
          const bucket = formatHour(r.ts);
          buckets.set(bucket, Math.max(buckets.get(bucket) ?? 0, r.solar_power as number));
        });
        return Array.from(buckets.entries()).map(([time, peak]) => ({ day: time, yield: Math.round(peak) }));
      })();

  // Only show reference line when BMS is live and SOC is meaningful
  const currentSoc = battery?.connected && battery.soc > 0 ? battery.soc : null;
  const chartColor = socColor(currentSoc ?? socData[socData.length - 1]?.soc ?? 99);

  return (
    <Panel className={className}>
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest">History</span>
        <div className="flex gap-1">
          {(["soc", "solar"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={clsx(
                "text-xs font-mono px-3 py-1 rounded-md transition-colors",
                tab === t ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300",
              )}
            >
              {t === "soc" ? "SOC 24h" : hasDailyData ? "Solar 30d" : "Solar today"}
            </button>
          ))}
        </div>
      </div>

      {!historyLoaded ? (
        <div className="h-32 flex items-center justify-center text-zinc-600 font-mono text-sm animate-pulse">Loading...</div>
      ) : tab === "soc" ? (
        socData.length < 2 ? (
          <EmptyState message="SOC history building — check back shortly" />
        ) : (
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={socData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="socGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chartColor} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#52525b", fontFamily: "monospace" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#52525b", fontFamily: "monospace" }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                <Tooltip
                  contentStyle={{ background: "#16181c", border: "1px solid #222428", borderRadius: 8, fontFamily: "monospace", fontSize: 12 }}
                  labelStyle={{ color: "#71717a" }}
                  itemStyle={{ color: "#e4e4e7" }}
                  formatter={(v: number) => [`${v.toFixed(1)}%`, "SOC"]}
                />
                {currentSoc !== null && (
                  <ReferenceLine y={currentSoc} stroke="#3f3f46" strokeDasharray="3 3" />
                )}
                <Area type="monotone" dataKey="soc" stroke={chartColor} strokeWidth={2} fill="url(#socGrad)" dot={false} activeDot={{ r: 3 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )
      ) : solarData.length === 0 ? (
        <EmptyState message="Solar history builds at midnight each day" />
      ) : (
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={solarData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#52525b", fontFamily: "monospace" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#52525b", fontFamily: "monospace" }} tickLine={false} axisLine={false} tickFormatter={(v) => (hasDailyData ? `${v}Wh` : `${v}W`)} />
              <Tooltip
                contentStyle={{ background: "#16181c", border: "1px solid #222428", borderRadius: 8, fontFamily: "monospace", fontSize: 12 }}
                labelStyle={{ color: "#71717a" }}
                itemStyle={{ color: "#e4e4e7" }}
                formatter={(v: number) => [`${v}${hasDailyData ? "Wh" : "W"}`, hasDailyData ? "Daily yield" : "Peak solar"]}
              />
              <Bar dataKey="yield" fill="#f59e0b" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="h-40 flex items-center justify-center text-zinc-600 font-mono text-xs text-center px-4">
      {message}
    </div>
  );
}
