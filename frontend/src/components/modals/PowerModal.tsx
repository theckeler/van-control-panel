import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import { useModalBehavior } from "../../hooks/useModalBehavior";

type Action = "reboot" | "shutdown";
type Phase = "pick" | "confirm" | "acting" | "offline" | "back";

interface PowerModalProps {
  open: boolean;
  onClose: () => void;
}

const COPY = {
  reboot: {
    confirm: {
      title: "Reboot the Pi?",
      body: "The dashboard will be unavailable for about 30 seconds while the Pi restarts.",
    },
    acting: "Rebooting Pi",
    offline: "Pi is offline — waiting for it to come back",
    back: "Pi is back online",
  },
  shutdown: {
    confirm: {
      title: "Shut down the Pi?",
      body: "The dashboard will go offline. Flip the house disconnect only after the Pi has shut down.",
    },
    acting: "Shutting down Pi",
    offline: "Pi is offline",
    back: "",
  },
} satisfies Record<
  Action,
  {
    confirm: { title: string; body: string };
    acting: string;
    offline: string;
    back: string;
  }
>;

async function pingHealth(): Promise<boolean> {
  try {
    const res = await fetch("/api/health", {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function PowerModal({ open, onClose }: PowerModalProps) {
  const [phase, setPhase] = useState<Phase>("pick");
  const [action, setAction] = useState<Action | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset when modal opens
  useEffect(() => {
    if (open) {
      setPhase("pick");
      setAction(null);
    } else stopPolling();
  }, [open]);

  function stopPolling() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  function startPolling(act: Action) {
    let wentOffline = false;
    intervalRef.current = setInterval(async () => {
      const alive = await pingHealth();
      if (!alive && !wentOffline) {
        wentOffline = true;
        setPhase("offline");
      }
      if (alive && wentOffline) {
        stopPolling();
        if (act === "reboot") setPhase("back");
        // shutdown: stay on offline — user closes manually
      }
    }, 2000);
  }

  async function handleAction(act: Action) {
    setAction(act);
    setPhase("confirm");
  }

  async function handleConfirm() {
    if (!action) return;
    setPhase("acting");
    try {
      if (action === "reboot") await api.system.reboot();
      if (action === "shutdown") await api.system.shutdown();
    } catch {
      /* Pi may cut the connection mid-response — that's fine */
    }
    startPolling(action);
  }

  function handleClose() {
    stopPolling();
    onClose();
  }

  // Escape only where there is something sensible to return to. Mid-reboot or
  // mid-shutdown the Pi is already going down, so dismissing would just hide
  // the status without stopping anything.
  const dismissible = phase === "pick" || phase === "confirm";
  const dialogRef = useModalBehavior(
    open,
    dismissible ? handleClose : undefined,
  );

  if (!open) return null;
  const act = action ?? "reboot";

  const dialogLabel =
    phase === "pick"
      ? "Power options"
      : phase === "confirm" && action
        ? COPY[action].confirm.title
        : COPY[act].acting;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={phase === "pick" ? handleClose : undefined}
        aria-hidden="true"
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={dialogLabel}
        tabIndex={-1}
        className="relative bg-panel-surface border border-panel-border rounded-xl p-6 w-full max-w-sm shadow-xl focus:outline-none"
      >
        {/* PICK */}
        {phase === "pick" && (
          <>
            <h2 className="text-sm  font-semibold text-zinc-100 mb-1">
              Power options
            </h2>
            <p className="text-xs  text-zinc-500 mb-5">
              Choose an action for the Raspberry Pi.
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => handleAction("reboot")}
                className="w-full text-xs  px-4 py-3 rounded-lg border border-amber-800 bg-amber-900/40 text-amber-300 hover:bg-amber-800/50 transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-panel-surface"
              >
                ↺ Reboot
              </button>
              <button
                type="button"
                onClick={() => handleAction("shutdown")}
                className="w-full text-xs  px-4 py-3 rounded-lg border border-red-800 bg-red-900/40 text-red-300 hover:bg-red-800/50 transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-panel-surface"
              >
                ⏻ Shut Down
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="w-full text-xs  px-4 py-3 rounded-lg border border-panel-border text-zinc-400 hover:text-zinc-200 transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-panel-surface"
              >
                Cancel
              </button>
            </div>
          </>
        )}

        {/* CONFIRM */}
        {phase === "confirm" && action && (
          <>
            <h2 className="text-sm  font-semibold text-zinc-100 mb-2">
              {COPY[action].confirm.title}
            </h2>
            <p className="text-xs  text-zinc-400 leading-relaxed mb-6">
              {COPY[action].confirm.body}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setPhase("pick")}
                className="text-xs  px-4 py-2 rounded-lg border border-panel-border text-zinc-400 hover:text-zinc-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-panel-surface"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className={clsx(
                  "text-xs  px-4 py-2 rounded-lg border transition-colors",
                  action === "shutdown"
                    ? "bg-red-900/60 hover:bg-red-800/60 text-red-300 border-red-800"
                    : "bg-amber-900/60 hover:bg-amber-800/60 text-amber-300 border-amber-800",
                )}
              >
                {action === "reboot" ? "↺ Reboot" : "⏻ Shut Down"}
              </button>
            </div>
          </>
        )}

        {/* ACTING / OFFLINE / BACK */}
        {(phase === "acting" || phase === "offline" || phase === "back") && (
          <div className="flex flex-col items-center gap-4 py-2">
            {phase === "acting" && (
              <>
                <Spinner />
                <p className="text-xs  text-zinc-400">
                  {COPY[act].acting}
                  <Dots />
                </p>
              </>
            )}
            {phase === "offline" && act === "reboot" && (
              <>
                <Spinner />
                <p className="text-xs  text-zinc-400 text-center">
                  {COPY[act].offline}
                  <Dots />
                </p>
              </>
            )}
            {phase === "offline" && act === "shutdown" && (
              <>
                <span className="text-2xl">⏻</span>
                <p className="text-xs  text-zinc-400 text-center">
                  {COPY[act].offline}
                </p>
                <button
                  type="button"
                  onClick={handleClose}
                  className="text-xs  px-4 py-2 rounded-lg border border-panel-border text-zinc-400 hover:text-zinc-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-panel-surface"
                >
                  Close
                </button>
              </>
            )}
            {phase === "back" && (
              <>
                <span className="text-2xl text-lime-500">✓</span>
                <p className="text-xs  text-lime-500">{COPY[act].back}</p>
                <button
                  type="button"
                  onClick={handleClose}
                  className="text-xs  px-4 py-2 rounded-lg border border-panel-border text-zinc-400 hover:text-zinc-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-panel-surface"
                >
                  Close
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="w-8 h-8 animate-spin text-zinc-600"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

function Dots() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setCount((c) => (c + 1) % 4), 500);
    return () => clearInterval(t);
  }, []);
  return <span className="inline-block w-4">{".".repeat(count)}</span>;
}
