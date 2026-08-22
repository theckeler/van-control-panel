import React from "react";
import clsx from "clsx";
import { useEffect, useState } from "react";
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

// Sample raw readings to at most N points for chart performance
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

export function HistoryCard({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const [tab, setTab] = useState<Tab>("soc");
  const {
    socRaw,
    solarRaw,
    dailyHistory,
    fetchHistory,
    historyLoaded,
    battery,
  } = useVanStore((s) => ({
    socRaw: s.socRaw,
    solarRaw: s.solarRaw,
    dailyHistory: s.dailyHistory,
    fetchHistory: s.fetchHistory,
    historyLoaded: s.historyLoaded,
    battery: s.battery,
  }));

  // Fetch history on mount, then every 5 minutes
  useEffect(() => {
    fetchHistory();
    const interval = setInterval(fetchHistory, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // --- SOC chart data ---
  const socData = downsample(
    socRaw
      .filter((r) => r.soc !== null)
      .map((r) => ({ time: formatHour(r.ts), soc: r.soc as number })),
    60,
  );

  // --- Solar chart data ---
  // Prefer daily rollups; fall back to raw grouped by hour if no daily data yet
  const hasDailyData = dailyHistory.some((d) => d.total_yield !== null);

  const solarData = hasDailyData
    ? dailyHistory
        .filter((d) => d.total_yield !== null)
        .map((d) => ({
          day: formatDay(d.day_ts),
          yield: Math.round(d.total_yield as number),
        }))
    : (() => {
        // Group raw MPPT readings into rough hour buckets and take peak solar per bucket
        const buckets = new Map<string, number>();
        solarRaw
          .filter(
            (r) => r.solar_power !== null && (r.solar_power as number) > 0,
          )
          .forEach((r) => {
            const bucket = formatHour(r.ts);
            const existing = buckets.get(bucket) ?? 0;
            buckets.set(bucket, Math.max(existing, r.solar_power as number));
          });
        return Array.from(buckets.entries()).map(([time, peak]) => ({
          day: time,
          yield: Math.round(peak),
        }));
      })();

  const currentSoc = battery?.soc ?? null;

  return (
    <div className={className} style={style}>
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest">
          History
        </span>
        <div className="flex gap-1">
          {(["soc", "solar"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={clsx(
                "text-xs font-mono px-3 py-1 rounded-md transition-colors",
                tab === t
                  ? "bg-zinc-700 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300",
              )}
            >
              {t === "soc"
                ? "SOC 24h"
                : hasDailyData
                  ? "Solar 30d"
                  : "Solar today"}
            </button>
          ))}
        </div>
      </div>

      {!historyLoaded ? (
        <div className="h-32 flex items-center justify-center text-zinc-600 font-mono text-sm animate-pulse">
          Loading...
        </div>
      ) : tab === "soc" ? (
        socData.length < 2 ? (
          <EmptyState message="SOC history building — check back shortly" />
        ) : (
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={socData}
                margin={{ top: 4, right: 4, bottom: 0, left: -20 }}
              >
                <defs>
                  <linearGradient id="socGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor={socColor(
                        currentSoc ?? socData[socData.length - 1]?.soc,
                      )}
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="95%"
                      stopColor={socColor(
                        currentSoc ?? socData[socData.length - 1]?.soc,
                      )}
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="time"
                  tick={{
                    fontSize: 10,
                    fill: "#52525b",
                    fontFamily: "monospace",
                  }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{
                    fontSize: 10,
                    fill: "#52525b",
                    fontFamily: "monospace",
                  }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  contentStyle={{
                    background: "#16181c",
                    border: "1px solid #222428",
                    borderRadius: 8,
                    fontFamily: "monospace",
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "#71717a" }}
                  itemStyle={{ color: "#e4e4e7" }}
                  formatter={(v: number) => [`${v.toFixed(1)}%`, "SOC"]}
                />
                {currentSoc !== null && (
                  <ReferenceLine
                    y={currentSoc}
                    stroke="#3f3f46"
                    strokeDasharray="3 3"
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="soc"
                  stroke={socColor(
                    currentSoc ?? socData[socData.length - 1]?.soc,
                  )}
                  strokeWidth={2}
                  fill="url(#socGrad)"
                  dot={false}
                  activeDot={{ r: 3 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )
      ) : solarData.length === 0 ? (
        <EmptyState message="Solar history builds at midnight each day" />
      ) : (
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={solarData}
              margin={{ top: 4, right: 4, bottom: 0, left: -20 }}
            >
              <XAxis
                dataKey="day"
                tick={{
                  fontSize: 10,
                  fill: "#52525b",
                  fontFamily: "monospace",
                }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{
                  fontSize: 10,
                  fill: "#52525b",
                  fontFamily: "monospace",
                }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => (hasDailyData ? `${v}Wh` : `${v}W`)}
              />
              <Tooltip
                contentStyle={{
                  background: "#16181c",
                  border: "1px solid #222428",
                  borderRadius: 8,
                  fontFamily: "monospace",
                  fontSize: 12,
                }}
                labelStyle={{ color: "#71717a" }}
                itemStyle={{ color: "#e4e4e7" }}
                formatter={(v: number) => [
                  `${v}${hasDailyData ? "Wh" : "W"}`,
                  hasDailyData ? "Daily yield" : "Peak solar",
                ]}
              />
              <Bar dataKey="yield" fill="#f59e0b" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="h-40 flex items-center justify-center text-zinc-600 font-mono text-xs text-center px-4">
      {message}
    </div>
  );
}
