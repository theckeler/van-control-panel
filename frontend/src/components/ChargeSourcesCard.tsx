import { useVanStore } from "../store/van";
import clsx from "clsx";

export function ChargeSourcesCard() {
  const mppt = useVanStore((s) => s.mppt);
  const shore = useVanStore((s) => s.shore);
  const orion = useVanStore((s) => s.orion);

  return (
    <div className="bg-panel-surface border border-panel-border rounded-xl p-5">
      <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest">
        Charge Sources
      </span>
      <div className="mt-4 space-y-3">
        <SourceRow
          label="Solar"
          active={!!mppt?.panel_power && mppt.panel_power > 0}
          color="text-charge-solar"
          value={mppt ? `${mppt.panel_power.toFixed(0)}W` : "—"}
          sub={
            mppt
              ? `${mppt.charge_state} · ${mppt.daily_yield.toFixed(0)}Wh today`
              : null
          }
        />

        <SourceRow
          label="Shore"
          active={!!shore?.connected}
          color="text-charge-shore"
          value={
            shore?.connected
              ? `${shore.charge_current.toFixed(1)}A`
              : "Unplugged"
          }
          sub={shore?.connected ? shore.charge_mode : null}
        />

        <SourceRow
          label="Alternator"
          active={!!orion?.enabled}
          color="text-charge-dc"
          value={orion?.enabled ? `${orion.max_power}W max` : "Off"}
          // sub={orion?.note ?? "Static — upgrade to XS 50A for live data"}
          isStatic
        />
      </div>
    </div>
  );
}

function SourceRow({
  label,
  tag,
  active,
  color,
  value,
  sub,
  isStatic,
}: {
  label: string;
  tag?: string;
  active?: boolean;
  color: string;
  value: string;
  sub?: string | null;
  isStatic?: boolean;
}) {
  return (
    <div
      className={clsx(
        "flex items-center justify-between rounded-lg p-3 border",
        active
          ? "bg-panel-bg border-panel-border"
          : "bg-panel-bg/50 border-panel-border/50",
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={clsx(
            "w-2 h-2 rounded-full flex-shrink-0",
            active ? color.replace("text-", "bg-") : "bg-zinc-700",
          )}
        />
        <div>
          <div
            className={clsx(
              "text-sm font-mono font-semibold",
              active ? color : "text-zinc-600",
            )}
          >
            {label}
          </div>
          <div className="text-xs font-mono text-zinc-600">
            {tag}
            {isStatic ? "static" : ""}
          </div>
        </div>
      </div>
      <div className="text-right">
        <div
          className={clsx(
            "text-sm font-mono font-semibold",
            active ? "text-zinc-200" : "text-zinc-600",
          )}
        >
          {value}
        </div>
        <div className="text-xs font-mono text-zinc-600 max-w-32 truncate">
          {sub}
        </div>
      </div>
    </div>
  );
}
