import { create } from "zustand";
import { api } from "../api/client";
import type {
  BatteryData,
  DailyReading,
  DometicData,
  EcoflowData,
  HotspotStatus,
  HourlyReading,
  ModeResponse,
  MpptData,
  OrionData,
  RawReading,
  ShellyUnit,
  ShoreData,
  StarlinkData,
  SystemData,
} from "../types";
import { toast } from "./toast";

/**
 * Turn a thrown value into something worth showing a user.
 * `fetch` rejects with "Failed to fetch" when the Pi is unreachable, which
 * is accurate but unhelpful, so it gets translated.
 */
function describe(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
    return "the Pi is unreachable";
  }
  const status = msg.match(/API error (\d+)/)?.[1];
  if (status === "401" || status === "403")
    return "session expired, reload to sign in";
  if (status === "502" || status === "503") return "the backend is down";
  if (status) return `server returned ${status}`;
  return msg;
}

/**
 * Polling and local changes, and why they need refereeing.
 *
 * Every 5s the dashboard re-reads each endpoint, and a read can take seconds
 * (GET /shelly/ measured 1-3s while two units were unreachable). Two things
 * went wrong when a click landed while a read was already in flight:
 *
 *  1. The slow read came back carrying the state from BEFORE the click and
 *     overwrote it, so a switch flipped on -> off -> on again, and Release BMS
 *     took ~8s to stick.
 *  2. fetchAll waited for every endpoint before updating anything, so every
 *     card refreshed at the pace of the slowest one (the battery card sat
 *     blank for 3s though its endpoint answers in 3ms).
 *
 * So each endpoint is now its own poll: applied the moment it returns, never
 * run twice at once, and dropped if it predates a local change.
 */
type PollKey =
  | "battery"
  | "mppt"
  | "ecoflow"
  | "starlink"
  | "dometic"
  | "shore"
  | "orion"
  | "shellys"
  | "system"
  | "hotspot"
  | "mode";

// One request may take this long before the next poll stops waiting for it.
// fetch() has no timeout of its own, so without this a request that never
// answers would block that endpoint forever.
const POLL_TIMEOUT_MS = 15_000;

const inflight: Partial<Record<PollKey, number>> = {};
const lastApplied: Partial<Record<PollKey, number>> = {};
// When something was last changed locally ("battery", "mode", "hotspot",
// "shelly:<id>"). A poll whose request STARTED before this carries older state.
const touchedAt: Record<string, number> = {};
const touch = (key: string) => {
  touchedAt[key] = performance.now();
};
const isTouchedSince = (key: string, startedAt: number) =>
  (touchedAt[key] ?? 0) > startedAt;

// Actions still waiting on the Pi. Polls for these keys are ignored until the
// action settles, and a second click is ignored so it cannot send the opposite
// command while the first may still be in flight.
const pending = new Set<string>();

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("poll timed out")), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

interface VanStore {
  // Live data
  battery: BatteryData | null;
  mppt: MpptData | null;
  ecoflow: EcoflowData | null;
  starlink: StarlinkData | null;
  dometic: DometicData | null;
  shore: ShoreData | null;
  orion: OrionData | null;
  shellys: ShellyUnit[];
  system: SystemData | null;
  hotspot: HotspotStatus | null;
  mode: ModeResponse | null;
  loading: boolean;
  lastUpdated: Date | null;
  error: string | null;

  // History data
  socRaw: RawReading[];
  solarRaw: RawReading[];
  dailyHistory: DailyReading[];
  hourlyHistory: HourlyReading[];
  historyLoaded: boolean;

  // Actions
  fetchAll: () => Promise<void>;
  fetchHistory: () => Promise<void>;
  toggleShelly: (id: string, on: boolean) => Promise<void>;
  setMode: (mode: string) => Promise<void>;
  releaseBms: () => Promise<void>;
  connectBms: () => Promise<void>;
  toggleHotspot: (on: boolean) => Promise<void>;
}

export const useVanStore = create<VanStore>((set, get) => {
  /**
   * Apply one polled value unless it is stale. Returns whether it was applied.
   * `startedAt` is when the REQUEST began, which is what decides whether the
   * data predates a local change, not when the response arrived.
   */
  function applyPoll(key: PollKey, startedAt: number, value: unknown): boolean {
    // Out of order: something newer for this endpoint was already applied.
    if (startedAt < (lastApplied[key] ?? 0)) return false;

    if (key === "shellys") {
      const current = get().shellys;
      const merged = (value as ShellyUnit[]).map((u) => {
        const k = `shelly:${u.id}`;
        // Keep what the user just did to THIS unit; take the poll for the rest.
        return pending.has(k) || isTouchedSince(k, startedAt)
          ? (current.find((c) => c.id === u.id) ?? u)
          : u;
      });
      lastApplied[key] = startedAt;
      set({ shellys: merged, lastUpdated: new Date() });
      return true;
    }

    if (pending.has(key) || isTouchedSince(key, startedAt)) return false;
    lastApplied[key] = startedAt;
    set({ [key]: value, lastUpdated: new Date() } as Partial<VanStore>);
    return true;
  }

  return {
    battery: null,
    mppt: null,
    ecoflow: null,
    starlink: null,
    dometic: null,
    shore: null,
    orion: null,
    shellys: [],
    system: null,
    hotspot: null,
    mode: null,
    loading: false,
    lastUpdated: null,
    error: null,

    socRaw: [],
    solarRaw: [],
    dailyHistory: [],
    hourlyHistory: [],
    historyLoaded: false,

    fetchAll: async () => {
      set({ loading: true });
      const polls: [PollKey, () => Promise<unknown>][] = [
        ["battery", () => api.battery.get()],
        ["mppt", () => api.mppt.get()],
        ["ecoflow", () => api.ecoflow.get()],
        ["shore", () => api.shore.get()],
        ["orion", () => api.orion.get()],
        ["shellys", () => api.shelly.getAll()],
        ["system", () => api.system.get()],
        ["mode", () => api.mode.current()],
        // Starlink is the other slow endpoint — a gRPC call that can take up to
        // 10s when the dish is unplugged. Independent polls are what keep that
        // from holding up the rest.
        ["starlink", () => api.starlink.get()],
        ["dometic", () => api.dometic.get()],
        ["hotspot", () => api.system.hotspot()],
      ];

      let applied = 0;
      let failed = 0;
      await Promise.all(
        polls.map(async ([key, call]) => {
          // Previous request for this endpoint still running: let it finish
          // rather than stacking another on a Pi that is already slow.
          const since = inflight[key];
          if (since !== undefined && performance.now() - since < POLL_TIMEOUT_MS) {
            return;
          }
          const startedAt = performance.now();
          inflight[key] = startedAt;
          try {
            const value = await withTimeout(call(), POLL_TIMEOUT_MS);
            if (applyPoll(key, startedAt, value)) applied++;
          } catch {
            // Keep the last known value, as before.
            failed++;
          } finally {
            if (inflight[key] === startedAt) delete inflight[key];
          }
        }),
      );

      // Every endpoint failing is the "Pi unreachable" case the Header shows.
      set({
        loading: false,
        ...(applied > 0
          ? { error: null }
          : failed > 0
            ? { error: "Failed to fetch van data" }
            : {}),
      });
    },

    fetchHistory: async () => {
      try {
        const [socRaw, solarRaw, daily, hourly] = await Promise.allSettled([
          api.battery.history.raw(24),
          api.mppt.history.raw(24),
          api.mppt.history.daily(30),
          api.battery.history.hourly(7),
        ]);
        set({
          socRaw: socRaw.status === "fulfilled" ? socRaw.value : get().socRaw,
          solarRaw:
            solarRaw.status === "fulfilled" ? solarRaw.value : get().solarRaw,
          dailyHistory:
            daily.status === "fulfilled" ? daily.value : get().dailyHistory,
          hourlyHistory:
            hourly.status === "fulfilled" ? hourly.value : get().hourlyHistory,
          historyLoaded: true,
        });
      } catch {
        set({ historyLoaded: true });
      }
    },

    toggleShelly: async (id: string, on: boolean) => {
      const key = `shelly:${id}`;
      if (pending.has(key)) return;
      const before = get().shellys.find((s) => s.id === id);
      const label = before?.label ?? id;
      pending.add(key);
      // Optimistic: show the change at click time instead of when the Pi
      // answers. Rolled back below if it says no, so the tile still ends up
      // matching the relay's actual state.
      touch(key);
      set((state) => ({
        shellys: state.shellys.map((s) => (s.id === id ? { ...s, on } : s)),
      }));
      try {
        await api.shelly.toggle(id, on);
        toast.success(`${label} ${on ? "on" : "off"}`);
      } catch (err) {
        set((state) => ({
          shellys: state.shellys.map((s) =>
            s.id === id ? { ...s, on: before?.on ?? !on } : s,
          ),
        }));
        toast.error(`Couldn't switch ${label} — ${describe(err)}`);
      } finally {
        // Any poll that started before now predates the outcome.
        touch(key);
        pending.delete(key);
      }
    },

    setMode: async (mode: string) => {
      try {
        const result = await api.mode.set(mode);
        touch("mode");
        set({ mode: result });
        toast.success(`Mode set to ${result.config.label}`);
      } catch (err) {
        toast.error(`Couldn't set mode — ${describe(err)}`);
      }
    },

    releaseBms: async () => {
      if (pending.has("battery")) return;
      const before = get().battery;
      pending.add("battery");
      // Optimistic: the disconnect takes a second or two on the Pi, and the
      // button should not sit unchanged while it happens.
      touch("battery");
      set((state) => ({
        battery: state.battery
          ? { ...state.battery, released: true, connected: false, status: "released" }
          : null,
      }));
      try {
        await api.battery.release();
        toast.info("BMS released — the Power Queen app can connect now");
      } catch (err) {
        set({ battery: before });
        toast.error(`Release failed — ${describe(err)}`);
      } finally {
        touch("battery");
        pending.delete("battery");
      }
    },

    connectBms: async () => {
      if (pending.has("battery")) return;
      const before = get().battery;
      pending.add("battery");
      touch("battery");
      set((state) => ({
        battery: state.battery
          ? { ...state.battery, released: false, status: "connecting" }
          : null,
      }));
      try {
        await api.battery.connect();
        toast.info("Reconnecting to BMS — this can take up to 35s");
      } catch (err) {
        set({ battery: before });
        toast.error(`Reconnect failed — ${describe(err)}`);
      } finally {
        touch("battery");
        pending.delete("battery");
      }
    },

    toggleHotspot: async (on: boolean) => {
      try {
        const result = await api.system.setHotspot(on);
        if (!result.ok) {
          toast.error(
            `Couldn't turn hotspot ${on ? "on" : "off"} — ${result.message}`,
          );
          return;
        }
        touch("hotspot");
        set({ hotspot: { active: on, ssid: on ? "TwitchWiFi" : null } });
        toast.success(`Hotspot ${on ? "on" : "off"}`);
      } catch (err) {
        toast.error(
          `Couldn't turn hotspot ${on ? "on" : "off"} — ${describe(err)}`,
        );
      }
    },
  };
});
