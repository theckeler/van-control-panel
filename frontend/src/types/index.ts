export interface BatteryData {
  soc: number
  voltage: number
  current: number
  temperature: number
  cell_voltages: number[]
  cycle_count: number
  status: string
  connected: boolean
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
