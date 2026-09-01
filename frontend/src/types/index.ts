export interface RawReading {
  id: number;
  ts: string;
  source: string;
  soc: number | null;
  voltage: number | null;
  current: number | null;
  temperature: number | null;
  solar_power: number | null;
  charge_state: string | null;
  daily_yield: number | null;
  cell_v1: number | null;
  cell_v2: number | null;
  cell_v3: number | null;
  cell_v4: number | null;
}

export interface HourlyReading {
  hour_ts: string;
  avg_soc: number | null;
  min_soc: number | null;
  max_soc: number | null;
  avg_voltage: number | null;
  avg_current: number | null;
  avg_temp: number | null;
  avg_solar: number | null;
  peak_solar: number | null;
  sample_count: number;
}

export interface DailyReading {
  day_ts: string;
  avg_soc: number | null;
  min_soc: number | null;
  max_soc: number | null;
  avg_voltage: number | null;
  avg_current: number | null;
  avg_temp: number | null;
  avg_solar: number | null;
  peak_solar: number | null;
  total_yield: number | null;
  sample_count: number;
}

export interface BatteryData {
  soc: number;
  voltage: number;
  current: number;
  temperature: number;
  cell_voltages: number[];
  cycle_count: number;
  status: string;
  connected: boolean;
  released: boolean;
  last_seen: string | null;
  retry_in: number | null;
}

export interface MpptData {
  panel_voltage: number;
  panel_power: number;
  battery_voltage: number;
  battery_current: number;
  charge_state: string;
  daily_yield: number;
  total_yield: number;
  max_power_today: number;
  error_code: number;
  connected: boolean;
}

export interface EcoflowData {
  battery_percent: number | null;
  serial: string | null;
  connected: boolean;
}

export interface StarlinkData {
  reachable: boolean;
  online: boolean;
  state: string | null;
  uptime_s: number | null;
  latency_ms: number | null;
  ping_drop_rate: number | null;
  downlink_bps: number | null;
  uplink_bps: number | null;
  fraction_obstructed: number | null;
  currently_obstructed: boolean | null;
  power_w: number | null;
  alerts: string[];
  hardware_version: string | null;
  software_version: string | null;
  error: string | null;
}

export interface DometicData {
  temp_f: number | null;
  set_temp_f: number | null;
  battery_voltage: number | null;
  cooler_on: boolean | null;
  door_open: boolean | null;
  power_source: string | null;
  reachable: boolean;
  last_seen: string | null;
}

export interface ShoreData {
  connected: boolean;
  charge_mode: string;
  battery_voltage: number;
  charge_current: number;
  error_code: number;
  inferred: boolean;
}

export interface OrionData {
  enabled: boolean;
  input_voltage_min: number;
  input_voltage_max: number;
  output_voltage: number;
  max_current: number;
  max_power: number;
  note: string;
}

export interface ShellyUnit {
  id: string;
  label: string;
  on: boolean;
  ip: string;
  installed?: boolean;
  /** false when the Pi couldn't reach the switch — distinct from off */
  reachable?: boolean;
}

export interface Photo {
  filename: string;
  url: string;
  timestamp: string;
}

export type ModeName = "storage" | "camp" | "trail" | "in_town";

export interface ModeConfig {
  label: string;
  camera_interval_min: number;
  camera_exterior_only: boolean;
  shellys_off: boolean;
  description: string;
}

export interface ModeResponse {
  current: ModeName;
  config: ModeConfig;
  available: ModeName[];
}

export interface PiHealth {
  cpu_temp_c: number | null;
  load_1: number | null;
  load_5: number | null;
  mem_total_mb: number | null;
  mem_available_mb: number | null;
  disk_total_gb: number | null;
  disk_free_gb: number | null;
  uptime_s: number | null;
  /** Undervoltage / throttling flags. 'since-boot' entries persist. */
  throttle: string[];
}

export interface BackupStatus {
  db_size_bytes: number | null;
  last_scheduled_run: string | null;
  pending_failed: number;
  row_counts: Record<string, number>;
}

export interface WifiProfile {
  name: string;
  active: boolean;
}

export interface HotspotStatus {
  active: boolean;
  ssid: string | null;
}

export interface WifiNetwork {
  ssid: string;
  signal: number | null;
  security: string | null;
  band: string | null;
  bssid: string | null;
}

export interface DiskImageStatus {
  state: "running" | "done" | "error" | null;
  bytes_written: number | null;
  filename: string | null;
  error: string | null;
}

export interface SystemData {
  net_power_w: number;
  estimated_runtime_hrs: number | null;
  charge_sources_active: string[];
  mode: ModeName;
  /** Which WiFi network the Pi is on. Null when unassociated. */
  ssid: string | null;
  band: string | null;
  wifi_signal_dbm: number | null;
  wifi_ip: string | null;
  /** True when an Ethernet cable is plugged into the wired rescue port. */
  eth0_connected: boolean;
}
