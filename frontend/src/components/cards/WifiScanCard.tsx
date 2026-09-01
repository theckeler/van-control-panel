import clsx from "clsx";
import { Fragment, useRef, useState } from "react";
import { api } from "../../api/client";
import { toast } from "../../store/toast";
import { useVanStore } from "../../store/van";
import type { WifiNetwork } from "../../types";
import { Label } from "../ui";
import { ProgressModal } from "../modals/ProgressModal";

function SignalBars({ signal }: { signal: number | null }) {
  const pct = signal ?? 0;
  const tone =
    pct >= 70 ? "text-black" : pct >= 45 ? "text-black/75" : "text-black/50";
  return (
    <span className={clsx("text-[10px]  tabular-nums", tone)}>
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
    // is nothing on the Pi side to revert. See ProgressModal's PR notes for
    // why connect does NOT get the same treatment.
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
      // thrown fetch here is expected and not necessarily a failure.
      toast.info(
        `Connect sent to ${label} — the Pi may be switching networks now`,
      );
    } finally {
      setConnecting(false);
    }
  }

  const needsPassword = !!selected?.security;

  return (
    <div>
      <ProgressModal
        open={scanning}
        title="Scanning for networks"
        message="Rescanning wlan1 — takes a few seconds"
        onCancel={cancelScan}
      />

      <button
        type="button"
        disabled={scanning}
        onClick={doScan}
        className="w-full text-xs  px-4 py-3 rounded border border-gray-800 text-gray-800 disabled:opacity-50"
      >
        Scan for networks
        <span className="block text-[10px] text-black mt-0.5">
          Shows nearby networks
        </span>
      </button>

      {networks.length > 0 && (
        <section className="mt-4">
          <Label as="h3" className="block mb-2">
            Available networks
          </Label>
          <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto pr-1">
            {networks.map((n) => {
              const key = `${n.ssid}-${n.band ?? ""}-${n.bssid ?? ""}`;
              const isSelected = selected?.bssid
                ? selected.bssid === n.bssid
                : selected?.ssid === n.ssid && selected?.band === n.band;
              return (
                <Fragment key={key}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(isSelected ? null : n);
                      setPassword("");
                    }}
                    className={clsx(
                      "w-full text-xs px-3 py-2 rounded border text-left border-gray-800 text-black",
                      isSelected ? "bg-lime-200" : "",
                    )}
                  >
                    <span className="flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <span>{n.ssid}</span>
                        {n.band && <span>{n.band}</span>}
                      </span>
                      <span className="flex items-center gap-2">
                        {n.security && <span>{n.security}</span>}
                        <SignalBars signal={n.signal} />
                      </span>
                    </span>
                  </button>

                  {isSelected && (
                    <div className="rounded border border-gray-800 p-3 flex flex-col gap-2">
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
                        className="w-full text-xs  px-4 py-3 rounded border border-accent bg-amber-600 text-black font-bold disabled:opacity-50"
                      >
                        {connecting ? "Connecting…" : `Connect to ${n.ssid}`}
                      </button>
                    </div>
                  )}
                </Fragment>
              );
            })}
          </div>

          <p className="text-[10px] text-black leading-relaxed mt-2">
            Connecting drops the Pi's LAN address. The dashboard reconnects over
            Tailscale; on the LAN you may need to rejoin the new network.
          </p>
        </section>
      )}
    </div>
  );
}
