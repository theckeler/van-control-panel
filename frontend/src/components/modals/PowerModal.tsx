import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import { Button, Modal, Spinner } from "../ui";

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
  // const dismissible = phase === "pick" || phase === "confirm";
  // const dialogRef = useModalBehavior(
  //   open,
  //   dismissible ? handleClose : undefined,
  // );

  if (!open) return null;
  const act = action ?? "reboot";

  // const dialogLabel =
  //   phase === "pick"
  //     ? "Power options"
  //     : phase === "confirm" && action
  //       ? COPY[action].confirm.title
  //       : COPY[act].acting;

  return (
    <Modal open={open} className="gap-2 justify-stretch">
      {phase === "pick" && (
        <>
          <h2 className="font-semibold text-black">Power options</h2>

          <p className="text-gray-800">
            Choose an action for the Raspberry Pi.
          </p>

          <div className="flex flex-col gap-2 w-full">
            <Button onClick={() => handleAction("reboot")}>↺ Reboot</Button>
            <Button
              onClick={() => handleAction("shutdown")}
              variant="danger"
            >
              ⏻ Shut Down
            </Button>
            <Button onClick={handleClose}>Cancel</Button>
          </div>
        </>
      )}

      {/* CONFIRM */}
      {phase === "confirm" && action && (
        <>
          <h2 className="font-semibold text-black">
            {COPY[action].confirm.title}
          </h2>
          <p className="text-black">{COPY[action].confirm.body}</p>
          <div className="flex flex-col gap-2 w-full">
            <Button onClick={() => setPhase("pick")}>Back</Button>
            <Button onClick={handleConfirm} variant="danger">
              {action === "reboot" ? "↺ Reboot" : "⏻ Shut Down"}
            </Button>
          </div>
        </>
      )}

      {/* ACTING / OFFLINE / BACK */}
      {(phase === "acting" || phase === "offline" || phase === "back") && (
        <div className="flex flex-col items-center gap-4 py-2">
          {phase === "acting" && (
            <>
              <Spinner />
              <p className="text-gray-600">
                {COPY[act].acting}
                <Dots />
              </p>
            </>
          )}
          {phase === "offline" && act === "reboot" && (
            <>
              <Spinner />
              <p className="text-gray-600 text-center">
                {COPY[act].offline}
                <Dots />
              </p>
            </>
          )}
          {phase === "offline" && act === "shutdown" && (
            <>
              <span className="text-2xl">⏻</span>
              <p className="text-gray-600 text-center">{COPY[act].offline}</p>
              <Button
                onClick={handleClose}
                className="hover:text-gray-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-panel-surface"
              >
                Close
              </Button>
            </>
          )}
          {phase === "back" && (
            <>
              <span className="text-2xl text-lime-600">✓</span>
              <p className="text-lime-600">{COPY[act].back}</p>
              <Button onClick={handleClose}>
                Close
              </Button>
            </>
          )}
        </div>
      )}
    </Modal>
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
