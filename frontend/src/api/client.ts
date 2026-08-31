import type {
  BackupStatus,
  BatteryData,
  DailyReading,
  DiskImageStatus,
  DometicData,
  EcoflowData,
  HotspotStatus,
  HourlyReading,
  ModeResponse,
  MpptData,
  OrionData,
  Photo,
  PiHealth,
  RawReading,
  ShellyUnit,
  ShoreData,
  StarlinkData,
  SystemData,
  WifiNetwork,
  WifiProfile,
} from "../types";
import { mockApi } from "./mock";

const BASE = "/api";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json();
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json();
}

async function del_<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json();
}

const realApi = {
  battery: {
    get: () => get<BatteryData>("/battery/"),
    release: () =>
      post<{ status: string; message: string }>("/battery/release"),
    connect: () =>
      post<{ status: string; message: string }>("/battery/connect"),
    history: {
      raw: (hours = 24) =>
        get<RawReading[]>(`/battery/history/raw?hours=${hours}`),
      hourly: (days = 7) =>
        get<HourlyReading[]>(`/battery/history/hourly?days=${days}`),
      daily: (days = 30) =>
        get<DailyReading[]>(`/battery/history/daily?days=${days}`),
      monthly: () => get<DailyReading[]>(`/battery/history/monthly`),
    },
  },
  mppt: {
    get: () => get<MpptData>("/mppt/"),
    history: {
      raw: (hours = 24) =>
        get<RawReading[]>(`/mppt/history/raw?hours=${hours}`),
      hourly: (days = 7) =>
        get<HourlyReading[]>(`/mppt/history/hourly?days=${days}`),
      daily: (days = 30) =>
        get<DailyReading[]>(`/mppt/history/daily?days=${days}`),
      monthly: () => get<DailyReading[]>(`/mppt/history/monthly`),
    },
  },
  ecoflow: {
    get: () => get<EcoflowData>("/ecoflow/"),
  },
  starlink: {
    get: () => get<StarlinkData>("/starlink/"),
  },
  dometic: {
    get: () => get<DometicData>("/dometic/"),
  },
  shore: {
    get: () => get<ShoreData>("/shore/"),
  },
  orion: {
    get: () => get<OrionData>("/orion/"),
    toggle: (enabled: boolean) =>
      post<OrionData>(`/orion/toggle?enabled=${enabled}`),
  },
  shelly: {
    getAll: () => get<ShellyUnit[]>("/shelly/"),
    get: (id: string) => get<ShellyUnit>(`/shelly/${id}`),
    toggle: (id: string, on: boolean) =>
      post<{ unit_id: string; on: boolean }>(`/shelly/${id}/toggle`, { on }),
  },
  camera: {
    latest: (cam: "interior" | "exterior") =>
      get<Photo>(`/photos/latest?cam=${cam}`),
    recent: (cam: "interior" | "exterior", limit = 20) =>
      get<Photo[]>(`/photos/recent?cam=${cam}&limit=${limit}`),
    capture: (cam: "interior" | "exterior") =>
      post(`/photos/capture?cam=${cam}`),
  },
  mode: {
    current: () => get<ModeResponse>("/mode/current"),
    set: (mode: string) => post<ModeResponse>(`/mode/${mode}`),
  },
  system: {
    get: () => get<SystemData>("/system/"),
    health: () => get<PiHealth>("/system/health-detail"),
    wifiProfiles: () => get<WifiProfile[]>("/system/wifi/profiles"),
    wifiScan: () => get<WifiNetwork[]>("/system/wifi/scan"),
    wifiConnect: (ssid: string, password: string) =>
      post<{ ok: boolean; message: string }>("/system/wifi/connect", {
        ssid,
        password,
      }),
    hotspot: () => get<HotspotStatus>("/system/wifi/hotspot"),
    setHotspot: (on: boolean) =>
      post<{ ok: boolean; message: string }>(
        `/system/wifi/hotspot/${on ? "on" : "off"}`,
      ),
    backupStatus: () => get<BackupStatus>("/system/backup/status"),
    backupUrl: () => `${BASE}/system/backup`,
    switchWifi: (name: string) =>
      post<{ ok: boolean; message: string }>(
        `/system/wifi/switch/${encodeURIComponent(name)}`,
      ),
    shutdown: () =>
      post<{ status: string; message: string }>("/system/shutdown"),
    reboot: () => post<{ status: string; message: string }>("/system/reboot"),
    diskImageStart: () =>
      post<{ ok: boolean; message: string }>("/system/disk-image/start"),
    diskImageStatus: () => get<DiskImageStatus>("/system/disk-image/status"),
    diskImageUrl: () => `${BASE}/system/disk-image/download`,
    diskImageCancel: () => del_<{ ok: boolean }>("/system/disk-image"),
  },
};

/**
 * Demo mode swaps in a fully mocked API so the dashboard can run on Vercel
 * with no Pi, no Tailscale, and no backend. Set VITE_DEMO=true in the Vercel
 * environment only — the Pi build never sets it, so production is unaffected
 * and the mock is tree-shaken out of that bundle.
 */
export const isDemo = import.meta.env.VITE_DEMO === "true";

export const api = isDemo ? (mockApi as typeof realApi) : realApi;
