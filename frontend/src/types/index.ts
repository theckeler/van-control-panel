export interface RawReading {
  id: number
  ts: string
  source: string
  soc: number | null
  voltage: number | null
  current: number | null
  temperature: number | null
  solar_power: number | null
  charge_state: string | null
  daily_yield: number | null
  cell_v1: number | null
  cell_v2: number | null
  cell_v3: number | null
  cell_v4: number | null
}

export interface HourlyReading {
  hour_ts: string
  avg_soc: number | null
  min_soc: number | null
  max_soc: number | null
  avg_voltage: number | null
  avg_current: number | null
  avg_temp: number | null
  avg_solar: number | null
  peak_solar: number | null
  sample_count: number
}

export interface DailyReading {
  day_ts: string
  avg_soc: number | null
  min_soc: number | null
  max_soc: number | null
  avg_voltage: number | null
  avg_current: number | null
  avg_temp: number | null
  avg_solar: number | null
  peak_solar: number | null
  total_yield: number | null
  sample_count: number
}

export interface BatteryData {
  soc: number
  voltage: number
  current: number
  temperature: number
  cell_voltages: number[]
  cycle_count: number
  status: string
  connected: boolean
  last_seen: string | null
  retry_in: number | null
}

export interface MpptData {
  panel_voltage: number
  panel_power: number
  battery_voltage: number
  battery_current: number
  charge_state: string
  daily_yield: number
  total_yield: number
  max_power_today: number
  error_code: number
  connected: boolean
}

export interface ShoreData {
  connected: boolean
  charge_mode: string
  battery_voltage: number
  charge_current: number
  error_code: number
  inferred: boolean
}

export interface OrionData {
  enabled: boolean
  input_voltage_min: number
  input_voltage_max: number
  output_voltage: number
  max_current: number
  max_power: number
  note: string
}

export interface ShellyUnit {
  id: string
  label: string
  on: boolean
  ip: string
}

export interface Photo {
  filename: string
  url: string
  timestamp: string
}

export type ModeName = 'storage' | 'camp' | 'trail' | 'in_town'

export interface ModeConfig {
  label: string
  camera_interval_min: number
  camera_exterior_only: boolean
  shellys_off: boolean
  description: string
}

export interface ModeResponse {
  current: ModeName
  config: ModeConfig
  available: ModeName[]
}

export interface SystemData {
  net_power_w: number
  estimated_runtime_hrs: number | null
  charge_sources_active: string[]
  mode: ModeName
}
