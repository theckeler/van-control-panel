import clsx from "clsx";
import { useVanStore } from "../../store/van";
import { Panel, StatusDot } from "../ui";

export function ChargeSourcesCard({ className }: { className?: string }) {
  const mppt = useVanStore((s) => s.mppt);
  const shore = useVanStore((s) => s.shore);
  // const orion = useVanStore((s) => s.orion);   // Alternator row hidden below

  return (
    <Panel className={className}>
      <SourceRow
        label="Solar"
        active={!!mppt?.panel_power && mppt.panel_power > 0}
        value={mppt ? `${mppt.panel_power.toFixed(0)}W` : "—"}
        detail={
          mppt
            ? `${mppt.charge_state} · ${mppt.daily_yield.toFixed(0)}Wh today`
            : null
        }
      />
      <SourceRow
        label="Shore"
        active={!!shore?.connected}
        value={
          shore?.connected ? `${shore.charge_current.toFixed(1)}A` : "Unplugged"
        }
        detail={shore?.connected ? shore.charge_mode : null}
      />
      {/* <SourceRow
        label="Alternator"
        active={!!orion?.enabled}
        color="text-charge-dc"
        value={orion?.enabled ? `${orion.max_power}W max` : "Off"}
      /> */}
    </Panel>
  );
}

function SourceRow({
  label,
  active,
  value,
  detail,
}: {
  label: string;
  active?: boolean;
  value: string;
  detail?: string | null;
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
        <StatusDot on={!!active} tone="success" />
        <div
          className={clsx(
            "text-sm  font-semibold",
            active ? "text-lime-600" : "text-gray-400",
          )}
        >
          {label}
        </div>
      </div>
      <div className="text-right">
        <div
          className={clsx(
            "text-sm  font-semibold",
            active ? "text-lime-600" : "text-gray-400",
          )}
        >
          {value}
        </div>
        {detail && (
          <div className="text-xs text-gray-800 max-w-32 truncate">
            {detail}
          </div>
        )}
      </div>
    </div>
  );
}
