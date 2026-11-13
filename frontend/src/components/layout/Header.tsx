import { useVanStore } from "../../store/van";
import { Badge, IconButton } from "../ui";

export function Header({
  isDemo,
  vanName,
  error,
  lastUpdated,
  onOpenMode,
  onOpenSystem,
}: {
  isDemo: boolean;
  vanName: string;
  error?: string | null;
  lastUpdated?: Date | null;
  onOpenMode: () => void;
  onOpenSystem: () => void;
}) {
  const mode = useVanStore((s) => s.mode);
  const modeLabel = mode?.config.label ?? mode?.current.replace("_", " ");

  return (
    <header data-vc="header" className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="flex items-center gap-2 text-title">
          <span className="truncate">{(isDemo && "Demo Van") || vanName}</span>
          {isDemo && <Badge tone="warn">Demo</Badge>}
        </h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
          {lastUpdated && (
            <span className="text-caption tabular-nums text-ink-muted">
              {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          {modeLabel && (
            <span className="text-caption text-ink-muted">{modeLabel} mode</span>
          )}
          {error && (
            <span className="text-caption text-danger-text">{error}</span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {modeLabel && (
          <IconButton
            icon="sliders"
            label={`Mode: ${modeLabel}. Change mode`}
            onClick={onOpenMode}
          />
        )}
        <IconButton icon="settings" label="System" onClick={onOpenSystem} />
      </div>
    </header>
  );
}
