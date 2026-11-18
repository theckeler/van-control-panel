import { useRef, useState } from "react";
import { api } from "../../api/client";
import { toast } from "../../store/toast";
import { useVanStore } from "../../store/van";
import type { WifiNetwork } from "../../types";
import { Badge, Button, TextField } from "../ui";

// Passwords for networks connected through this form, keyed by SSID, so
// reconnecting to a place you've already been (a hostel, a coffee shop)
// doesn't mean retyping it. Client-side only: this dashboard is already
// password-gated and single-user, and the alternative (an API exposing
// nmcli's stored secrets) would expose every saved profile's password,
// including home WiFi, not just what's typed here.
const PASSWORD_STORAGE_KEY = "van-wifi-passwords";

function loadSavedPassword(ssid: string): string {
  try {
    const raw = localStorage.getItem(PASSWORD_STORAGE_KEY);
    if (!raw) return "";
    return (JSON.parse(raw) as Record<string, string>)[ssid] ?? "";
  } catch {
    return "";
  }
}

function rememberPassword(ssid: string, password: string) {
  if (!password) return;
  try {
    const raw = localStorage.getItem(PASSWORD_STORAGE_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    map[ssid] = password;
    localStorage.setItem(PASSWORD_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // best effort: a full or unavailable localStorage isn't worth surfacing
  }
}

export function WifiScan() {
  const [networks, setNetworks] = useState<WifiNetwork[]>([]);
  const [scanning, setScanning] = useState(false);
  const [selected, setSelected] = useState<WifiNetwork | null>(null);
  const [password, setPassword] = useState("");
  const [connecting, setConnecting] = useState(false);
  const system = useVanStore((s) => s.system);
  const fetchAll = useVanStore((s) => s.fetchAll);
  const abortRef = useRef<AbortController | null>(null);

  async function doScan() {
    setScanning(true);
    setSelected(null);
    setPassword("");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const results = await api.system.wifiScan({ signal: controller.signal });
      setNetworks(results);
      toast[results.length ? "success" : "info"](
        results.length ? `Found ${results.length} networks` : "No networks found",
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      toast.error(
        `Scan failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setScanning(false);
      abortRef.current = null;
    }
  }

  // Genuinely aborts the in-flight request. A scan is read-only, so there is
  // nothing on the Pi to revert. Connect does not get the same treatment: a
  // network switch can't be undone mid-flight.
  function cancelScan() {
    abortRef.current?.abort();
  }

  async function doConnect() {
    if (!selected) return;
    setConnecting(true);
    const label = `${selected.ssid}${selected.band ? ` (${selected.band})` : ""}`;
    try {
      const res = await api.system.wifiConnect(
        selected.ssid,
        password,
        selected.bssid ?? undefined,
      );
      if (res.ok) {
        rememberPassword(selected.ssid, password);
        toast.success(`Connected to ${label}`);
        setPassword("");
        setSelected(null);
        fetchAll();
      } else {
        // nmcli's stderr is the only thing that says why.
        toast.error(res.message || `Couldn't connect to ${label}`);
      }
    } catch {
      // Switching networks drops the Pi's LAN address mid-request, so a
      // thrown fetch here is expected and not necessarily a failure.
      rememberPassword(selected.ssid, password);
      toast.info(`Connect sent to ${label}. The Pi may be switching networks now`);
      setPassword("");
      setSelected(null);
    } finally {
      setConnecting(false);
    }
  }

  const needsPassword = !!selected?.security;

  return (
    <div data-vc="drawer-wifi-scan" className="flex flex-col gap-3">
      {scanning ? (
        <Button busy onClick={cancelScan}>
          Scanning… tap to cancel
        </Button>
      ) : (
        <Button variant="solid" onClick={doScan}>
          Scan for networks
        </Button>
      )}

      {!scanning && !networks.length && (
        <p className="text-body text-ink-muted">No networks scanned yet.</p>
      )}

      <ul className="flex flex-col gap-2">
        {networks.map((n) => {
          const key = `${n.ssid}-${n.band ?? ""}-${n.bssid ?? ""}`;
          const isSelected = selected?.bssid
            ? selected.bssid === n.bssid
            : selected?.ssid === n.ssid && selected?.band === n.band;
          const isActive = !!system?.ssid && system.ssid === n.ssid;
          return (
            <li key={key} className="flex flex-col gap-2">
              <Button
                variant={isSelected ? "solid" : "outline"}
                aria-pressed={isSelected}
                onClick={() => {
                  const next = isSelected ? null : n;
                  setSelected(next);
                  setPassword(next ? loadSavedPassword(next.ssid) : "");
                }}
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-left">
                    {n.ssid}
                    {n.band && <span className="font-normal">{n.band}</span>}
                    {isActive && <Badge tone="on">Connected</Badge>}
                  </span>
                  <span className="font-normal tabular-nums">
                    {n.security ? `${n.security} · ` : ""}
                    {n.signal != null ? `${n.signal}%` : "—"}
                  </span>
                </span>
              </Button>

              {isSelected &&
                (isActive ? (
                  <p className="text-body text-ink-muted">
                    Already connected to this network.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2 rounded border border-line p-3">
                    {needsPassword && (
                      <TextField
                        label="Password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && password) void doConnect();
                        }}
                        autoComplete="new-password"
                        autoFocus
                      />
                    )}
                    <Button
                      variant="solid"
                      busy={connecting}
                      disabled={needsPassword && !password}
                      onClick={doConnect}
                    >
                      {connecting ? "Connecting…" : `Connect to ${n.ssid}`}
                    </Button>
                  </div>
                ))}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
