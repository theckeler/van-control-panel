import clsx from "clsx";
import { Fragment, useRef, useState } from "react";
import { api } from "../../api/client";
import { toast } from "../../store/toast";
import { useVanStore } from "../../store/van";
import type { WifiNetwork } from "../../types";
import { Button, Label, Spinner, StatusDot } from "../ui";

// Passwords for networks connected through this form, keyed by SSID, so
// reconnecting to a place you've already been (a hostel, a coffee shop)
// doesn't mean retyping it. Client-side only — this dashboard is already
// password-gated and single-user, and the alternative (an API exposing
// nmcli's stored secrets) would mean exposing every saved profile's
// password, including home WiFi, not just what's typed here.
const PASSWORD_STORAGE_KEY = "van-wifi-passwords";

function loadSavedPassword(ssid: string): string {
  try {
    const raw = localStorage.getItem(PASSWORD_STORAGE_KEY);
    if (!raw) return "";
    const map = JSON.parse(raw) as Record<string, string>;
    return map[ssid] ?? "";
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
    // best effort — a full or unavailable localStorage isn't worth surfacing
  }
}

function SignalBars({ signal }: { signal: number | null }) {
  const pct = signal ?? 0;
  const tone =
    pct >= 70 ? "text-black" : pct >= 45 ? "text-black/75" : "text-black/50";
  return (
    <span className={clsx("text-[10px] tabular-nums", tone)}>
      {signal != null ? `${signal}%` : "—"}
    </span>
  );
}

export function WifiScanCard() {
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
        results.length
          ? `Found ${results.length} networks`
          : "No networks found",
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // Cancel button — this is the expected path, not a failure.
        return;
      }
      toast.error(
        `Scan failed — ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setScanning(false);
      abortRef.current = null;
    }
  }

  function cancelScan() {
    // Genuinely aborts the in-flight request — scan is read-only, so there
    // is nothing on the Pi side to revert. Connect does NOT get the same
    // treatment (see doConnect) since a network switch can't be undone
    // mid-flight.
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
        // nmcli's stderr is the only thing that says *why* — surface it
        // rather than a generic failure.
        toast.error(res.message || `Couldn't connect to ${label}`);
      }
    } catch {
      // Switching networks drops the Pi's LAN address mid-request, so a
      // thrown fetch here is expected and not necessarily a failure — nmcli
      // already has the request, whether or not this response arrived. Close
      // out the same as success rather than leaving a stale password box up.
      rememberPassword(selected.ssid, password);
      toast.info(
        `Connect sent to ${label} — the Pi may be switching networks now`,
      );
      setPassword("");
      setSelected(null);
    } finally {
      setConnecting(false);
    }
  }

  const needsPassword = !!selected?.security;

  return (
    <div className="grid grid-rows-[24px_46px_1fr] gap-2 h-full">
      <Label as="h3" className="block mb-2">
        Available networks
      </Label>

      <Button
        disabled={scanning}
        onClick={doScan}
        className="bg-amber-500 text-gray-900 border-gray-900"
        bold
        uppercase
      >
        Scan for networks
      </Button>

      <div
        className={clsx(
          "flex flex-col gap-2 min-h-32 h-full overflow-y-auto bg-gray-100 rounded p-4",
          (scanning || !networks.length) && "justify-center items-center",
        )}
      >
        {scanning ? (
          <>
            <Spinner />
            <span className="text-xs text-gray-600">Scanning…</span>
            <Button size="sm" fullWidth={false} onClick={cancelScan}>
              Cancel
            </Button>
          </>
        ) : networks.length ? (
          networks.map((n) => {
            const key = `${n.ssid}-${n.band ?? ""}-${n.bssid ?? ""}`;
            const isSelected = selected?.bssid
              ? selected.bssid === n.bssid
              : selected?.ssid === n.ssid && selected?.band === n.band;
            const isActive = !!system?.ssid && system.ssid === n.ssid;
            return (
              <Fragment key={key}>
                <Button
                  onClick={() => {
                    const next = isSelected ? null : n;
                    setSelected(next);
                    setPassword(next ? loadSavedPassword(next.ssid) : "");
                  }}
                  className={clsx(
                    "w-full text-xs px-3 py-2 rounded border text-left border-gray-800 text-black",
                    isSelected ? "bg-lime-200" : "",
                  )}
                >
                  <span className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      {isActive && <StatusDot on tone="success" />}
                      <span>{n.ssid}</span>
                      {n.band && <span>{n.band}</span>}
                      {isActive && (
                        <span className="text-[10px] text-lime-700 uppercase tracking-widest">
                          Connected
                        </span>
                      )}
                    </span>
                    <span className="flex items-center gap-2">
                      {n.security && <span>{n.security}</span>}
                      <SignalBars signal={n.signal} />
                    </span>
                  </span>
                </Button>

                {isSelected && (
                  <div className="rounded border border-gray-800 p-2 flex flex-col gap-2">
                    {isActive ? (
                      <span className="text-xs text-gray-600 px-1 py-1">
                        Already connected to this network.
                      </span>
                    ) : (
                      <>
                        {needsPassword && (
                          <input
                            type="password"
                            placeholder="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && password) doConnect();
                            }}
                            autoComplete="new-password"
                            autoFocus
                            className="w-full px-3 py-2 rounded border border-gray-800 bg-transparent text-black placeholder-gray-400"
                          />
                        )}
                        <button
                          type="button"
                          disabled={connecting || (needsPassword && !password)}
                          onClick={doConnect}
                          className="w-full text-xs px-4 py-3 rounded border border-accent bg-amber-600 text-black font-bold disabled:bg-gray-200 disabled:text-gray-400"
                        >
                          {connecting ? "Connecting…" : `Connect to ${n.ssid}`}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </Fragment>
            );
          })
        ) : (
          <span className="text-xs text-gray-600">No networks scanned yet</span>
        )}
      </div>
    </div>
  );
}
