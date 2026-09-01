import { WifiBadge } from "./WifiBadge";
import { Button } from "./ui";

export function Header({
  isDemo,
  vanName,
  error,
  lastUpdated,
  setSettingsOpen,
}: {
  isDemo: boolean;
  vanName: string;
  error?: string | null;
  lastUpdated?: Date | null;
  setSettingsOpen: (open: boolean) => void;
}) {
  return (
    <header className="flex items-center justify-between pt-4">
      <h1 className="text-lg  font-bold text-black tracking-tight">
        {(isDemo && "Demo Van") || vanName}
        {isDemo && (
          <span className="ml-2 px-1.5 py-0.5 text-[10px]  uppercase tracking-widest text-amber-500 border border-amber-500/40 rounded align-middle">
            demo
          </span>
        )}
      </h1>
      <div className="flex items-center gap-2">
        <div className="text-right">
          {error && <div className="text-xs  text-red-500 mb-1">⚠ {error}</div>}
          {lastUpdated && (
            <div className="text-xs  text-black">
              {lastUpdated.toLocaleTimeString()}
            </div>
          )}
          <WifiBadge className="block" />
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSettingsOpen(true)}
          aria-label="Settings"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-4 h-4"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </Button>
      </div>
    </header>
  );
}
