import clsx from "clsx";
import { useState } from "react";
import { api } from "../../api/client";
import { toast } from "../../store/toast";
import type { WifiNetwork } from "../../types";
import { Label } from "../ui";

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

export function WifiScanCard({}: {}) {
  const [networks, setNetworks] = useState<WifiNetwork[]>([]);
  const [scanning, setScanning] = useState(false);
  const [selected, setSelected] = useState<WifiNetwork | null>(null);
  const [password, setPassword] = useState("");
  const [connecting, setConnecting] = useState(false);

  async function doScan() {
    setScanning(true);
    setSelected(null);
    setPassword("");
    try {
      const results = await api.system.wifiScan();
      setNetworks(results);
      if (results.length === 0) toast.info("No networks found");
    } catch {
      toast.error("Scan failed");
    } finally {
      setScanning(false);
    }
  }

  async function doConnect() {
    if (!selected) return;
    setConnecting(true);
    try {
      const res = await api.system.wifiConnect(
        selected.ssid,
        password,
        selected.bssid ?? undefined,
      );
      toast[res.ok ? "success" : "error"](
        res.ok ? `Connected to ${selected.ssid}` : res.message,
      );
    } catch {
      toast.info("Connect sent — Pi may be switching networks");
    } finally {
      setConnecting(false);
    }
  }

  const needsPassword = !!selected?.security;

  return (
    <div>
      <button
        type="button"
        disabled={scanning}
        onClick={doScan}
        className="w-full text-xs  px-4 py-3 rounded border border-gray-800 text-gray-800"
      >
        {scanning ? "Scanning…" : "Scan for networks"}
        <span className="block text-[10px] text-black mt-0.5">
          Shows nearby networks
        </span>
      </button>

      {networks.length > 0 && (
        <section>
          <Label as="h3" className="block mb-2">
            Available networks
          </Label>
          <div className="flex flex-col gap-1.5">
            {networks.map((n) => {
              const key = `${n.ssid}-${n.band ?? ""}-${n.bssid ?? ""}`;
              const isSelected = selected?.bssid
                ? selected.bssid === n.bssid
                : selected?.ssid === n.ssid && selected?.band === n.band;
              return (
                <button
                  key={key}
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
              );
            })}
          </div>
        </section>
      )}

      {selected && (
        <section>
          <Label as="h3" className="block mb-2">
            {selected.ssid}
            {selected.band && (
              <span className="text-zinc-500"> · {selected.band}</span>
            )}
          </Label>
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
              className="w-full px-3 py-2 mb-2 rounded border border-gray-800 bg-transparent text-zinc-300 placeholder-gray-400"
            />
          )}
          <button
            type="button"
            disabled={connecting || (needsPassword && !password)}
            onClick={doConnect}
            className="w-full text-xs  px-4 py-3 rounded border border-accent bg-amber-600 text-black font-bold text-left"
          >
            {connecting ? "Connecting…" : `Connect to ${selected.ssid}`}
          </button>
          <p className="text-[10px] text-black leading-relaxed mt-2">
            Connecting drops the Pi's LAN address. The dashboard reconnects over
            Tailscale; on the LAN you may need to rejoin the new network.
          </p>
        </section>
      )}
    </div>
  );
}
