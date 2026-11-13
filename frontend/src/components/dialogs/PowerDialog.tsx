import { useEffect, useRef, useState } from "react";
import { api, isDemo } from "../../api/client";
import { Button, Dialog } from "../ui";

type Action = "reboot" | "shutdown" | "restart-api";
type Phase = "pick" | "confirm" | "acting" | "offline" | "back" | "declined";

// A restart that never drops a health poll (the API came back between two 2s
// polls) would otherwise sit on the spinner forever.
const API_RESTART_FALLBACK_MS = 20_000;

const COPY = {
  "restart-api": {
    acting: "Restarting the API…",
    offline: "The API is restarting. Waiting for it to come back.",
    back: "The API is back online. The battery monitor takes another 30 to 60 seconds to reconnect.",
  },
  reboot: {
    confirmTitle: "Reboot the Pi?",
    confirm:
      "The dashboard will be unreachable for about a minute while the Pi restarts.",
    acting: "Rebooting the Pi…",
    offline: "The Pi is offline. Waiting for it to come back.",
    back: "The Pi is back online.",
  },
  shutdown: {
    confirmTitle: "Shut down the Pi?",
    confirm:
      "The Pi won't come back until someone powers it on in the van. Flip the house disconnect only after it has shut down.",
    acting: "Shutting down the Pi…",
    offline: "The Pi is off.",
    back: "",
  },
} as const;

async function pingHealth(): Promise<boolean> {
  try {
    const res = await fetch("/api/health", { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Power: Restart API, Reboot, Shut down.
 *
 * Restart API is the only way to unstick a frozen card when nobody is at a
 * terminal, so it is reachable in two taps (Power, then Restart API) with no
 * confirm step in between, and this dialog reads no fetched data, so a hung
 * poll cannot block it. The backend refuses a second restart inside 2
 * minutes (BMS lockout protection) and the dialog says so. Reboot and Shut
 * down confirm first, because both can leave the van without its dashboard.
 */
export function PowerDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("pick");
  const [action, setAction] = useState<Action>("restart-api");
  const [declinedMsg, setDeclinedMsg] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopPolling() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  useEffect(() => {
    if (open) {
      setPhase("pick");
      setAction("restart-api");
    } else stopPolling();
    return stopPolling;
  }, [open]);

  function startPolling(act: Action) {
    // The demo has no /api/health to poll, so it would sit on "offline"
    // forever. Nothing really restarts there; just finish the story.
    if (isDemo) {
      setTimeout(() => setPhase(act === "shutdown" ? "offline" : "back"), 1500);
      return;
    }
    const startedAt = Date.now();
    let wentOffline = false;
    intervalRef.current = setInterval(async () => {
      const alive = await pingHealth();
      if (!alive && !wentOffline) {
        wentOffline = true;
        setPhase("offline");
      }
      if (alive && wentOffline) {
        stopPolling();
        if (act !== "shutdown") setPhase("back");
      }
      if (
        alive &&
        !wentOffline &&
        act === "restart-api" &&
        Date.now() - startedAt > API_RESTART_FALLBACK_MS
      ) {
        stopPolling();
        setPhase("back");
      }
    }, 2000);
  }

  async function run(act: Action) {
    setAction(act);
    setPhase("acting");
    try {
      if (act === "reboot") await api.system.reboot();
      if (act === "shutdown") await api.system.shutdown();
      if (act === "restart-api") {
        const res = await api.system.restartApi();
        if (res.status === "too_soon") {
          setDeclinedMsg(res.message);
          setPhase("declined");
          return;
        }
      }
    } catch {
      /* The Pi may cut the connection mid-response. That's expected. */
    }
    startPolling(act);
  }

  function close() {
    stopPolling();
    onClose();
  }

  const working = phase === "acting" || (phase === "offline" && action !== "shutdown");

  let title = "Power";
  let body: React.ReactNode = "Choose what to do with the Raspberry Pi.";
  let actions: React.ReactNode = (
    <>
      <Button onClick={close}>Cancel</Button>
      <Button variant="danger" onClick={() => { setAction("shutdown"); setPhase("confirm"); }}>
        Shut down…
      </Button>
      <Button onClick={() => { setAction("reboot"); setPhase("confirm"); }}>
        Reboot…
      </Button>
      <Button variant="solid" onClick={() => void run("restart-api")}>
        Restart API
      </Button>
    </>
  );

  if (phase === "pick") {
    body = (
      <>
        <p>
          <strong className="text-ink">Restart API</strong> restarts the dashboard's
          backend only. The Pi stays on and live data goes blank for 10 to 20
          seconds. Use it when a card is stuck, and not twice in quick succession:
          restarting too often can lock up the battery monitor.
        </p>
      </>
    );
  } else if (phase === "confirm") {
    const c = COPY[action as "reboot" | "shutdown"];
    title = c.confirmTitle;
    body = c.confirm;
    actions = (
      <>
        <Button onClick={() => setPhase("pick")}>Back</Button>
        <Button variant="danger" onClick={() => void run(action)}>
          {action === "shutdown" ? "Shut down" : "Reboot"}
        </Button>
      </>
    );
  } else if (phase === "declined") {
    title = "Not yet";
    body = declinedMsg;
    actions = <Button onClick={close}>Close</Button>;
  } else if (phase === "acting") {
    title = COPY[action].acting;
    body = undefined;
    actions = undefined;
  } else if (phase === "offline") {
    title = COPY[action].offline;
    body = undefined;
    // The Pi is still up when only the API restarts, so there is something
    // to go back to if the service never returns.
    actions =
      action === "shutdown" || action === "restart-api" ? (
        <Button onClick={close}>Close</Button>
      ) : undefined;
  } else if (phase === "back") {
    title = "Back online";
    body = COPY[action].back;
    actions = <Button variant="solid" onClick={close}>Close</Button>;
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={title}
      busy={working}
      stacked={phase === "pick"}
      vc="dialog-power"
      actions={actions}
    >
      {body}
    </Dialog>
  );
}
