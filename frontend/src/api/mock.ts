/**
 * Demo-mode API mock.
 *
 * Enabled by VITE_DEMO=true (set in Vercel env vars only — never on the Pi).
 * Mirrors the shape of `api` in client.ts exactly.
 *
 * Data is physically modelled rather than random: a solar bell curve drives
 * charge current, SOC integrates over time, and voltage tracks SOC on a
 * LiFePO4-ish curve. History and live values come from the same simulation,
 * so the charts and the battery card agree with each other.
 */
import type {
  BatteryData, MpptData, EcoflowData, ShoreData, OrionData,
  ShellyUnit, Photo, ModeResponse, ModeName, SystemData, StarlinkData, DometicData,
  RawReading, HourlyReading, DailyReading,
} from '../types'

// --- System constants (match the real van) ---
const BATTERY_WH      = 100 * 12.8   // 100Ah LiFePO4
// Overnight idle draw, not the full ALWAYS_ON_WATTS total. At 3am the lights
// and USB are off and it's mostly the fridge cycling plus the fan, so ~32W is
// closer to reality than the 67W all-loads-on figure. This is what sets the
// depth of the overnight SOC trough: 11 dark hours x 32W = ~350Wh of a
// 1280Wh bank, so roughly a 27 point drop.
const BASELINE_LOAD_W = 32
const PANEL_PEAK_W    = 165          // 200W panel, realistic peak
const SUNRISE         = 6.5
const SUNSET          = 19.5

/** Deterministic PRNG so reloads produce identical charts. */
function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Solar output in watts for a given hour-of-day, with light cloud texture. */
function solarAt(hour: number, dayseed = 1): number {
  if (hour < SUNRISE || hour > SUNSET) return 0
  const t = (hour - SUNRISE) / (SUNSET - SUNRISE)
  const bell = Math.pow(Math.sin(Math.PI * t), 1.3)
  const cloud = 0.82 + 0.18 * Math.sin(hour * 2.7 + dayseed * 3.1)
  return Math.max(0, PANEL_PEAK_W * bell * cloud)
}

/** LiFePO4 resting voltage from SOC, plus a bump while charging. */
function voltageAt(soc: number, charging: boolean): number {
  const base = 12.55 + (soc / 100) * 0.75
  return +(base + (charging ? 0.35 : 0)).toFixed(2)
}

/** Charge state from solar input and SOC. */
function chargeStateAt(solar: number, soc: number): string {
  if (solar < 5) return 'Off'
  if (soc > 97) return 'Float'
  if (soc > 85) return 'Absorption'
  return 'Bulk'
}

/** Cabin temperature, mild diurnal swing. */
function tempAt(hour: number): number {
  return +(19 + 5 * Math.sin(((hour - 9) / 24) * 2 * Math.PI)).toFixed(1)
}

interface Sample {
  ts: Date
  hour: number
  soc: number
  solar: number
  netW: number
  current: number
  voltage: number
  temp: number
  chargeState: string
}

/**
 * Walk a series of samples ending at `end`, integrating SOC forward.
 * Returns oldest-first.
 */
function buildSeries(end: Date, hoursBack: number, stepMin: number, startSoc: number): Sample[] {
  const out: Sample[] = []
  const stepH = stepMin / 60
  let soc = startSoc
  const start = new Date(end.getTime() - hoursBack * 3600_000)

  for (let i = 0; i * stepH <= hoursBack; i++) {
    const ts = new Date(start.getTime() + i * stepMin * 60_000)
    const hour = ts.getHours() + ts.getMinutes() / 60
    const daySeed = ts.getDate()
    const solar = solarAt(hour, daySeed)
    const netW = solar - BASELINE_LOAD_W
    soc = Math.max(18, Math.min(100, soc + (netW * stepH) / BATTERY_WH * 100))
    const voltage = voltageAt(soc, netW > 0)
    out.push({
      ts, hour, solar,
      soc: +soc.toFixed(1),
      netW: +netW.toFixed(1),
      current: +(netW / voltage).toFixed(2),
      voltage,
      temp: tempAt(hour),
      chargeState: chargeStateAt(solar, soc),
    })
  }
  return out
}

// --- Live simulation state -------------------------------------------------
// Rebuilt on load; `now()` reads the tail so live values track the charts.

// Start SOC chosen so the overnight trough lands in the 40s rather than the
// low 20s — a well-sized bank isn't routinely drawn that deep.
const START_SOC = 78
const BOOT = new Date()
let series = buildSeries(BOOT, 24, 5, START_SOC)

/** Current sample, recomputed against wall-clock so the demo drifts realistically. */
function now(): Sample {
  const t = new Date()
  const elapsedMin = (t.getTime() - BOOT.getTime()) / 60_000
  if (elapsedMin > 5) {
    series = buildSeries(t, 24, 5, START_SOC)
  }
  return series[series.length - 1]
}

/** Small per-poll jitter so 5s polling doesn't look frozen. */
function jitter(v: number, pct = 0.015): number {
  return +(v * (1 + (Math.random() - 0.5) * pct)).toFixed(2)
}

// --- Mutable demo state ----------------------------------------------------

let shellys: ShellyUnit[] = [
  { id: 'usb',    label: 'USB Outlets', on: true,  ip: 'shelly-usb.local',    installed: true, reachable: true },
  { id: 'garage', label: 'Garage',      on: false, ip: 'shelly-garage.local', installed: true, reachable: true },
]

let currentMode: ModeName = 'camp'
let bmsReleased = false
let orionEnabled = false

const MODE_CONFIG: Record<ModeName, ModeResponse['config']> = {
  storage: { label: 'Storage', camera_interval_min: 300, camera_exterior_only: false, shellys_off: true,
             description: 'Battery preservation priority. Minimum parasitic draw.' },
  camp:    { label: 'Camp',    camera_interval_min: 30,  camera_exterior_only: false, shellys_off: false,
             description: 'Normal monitoring. Automation schedules active.' },
  trail:   { label: 'Trail',   camera_interval_min: 15,  camera_exterior_only: false, shellys_off: false,
             description: 'Van unattended at a trailhead. Shorter camera interval.' },
  in_town: { label: 'In Town', camera_interval_min: 30,  camera_exterior_only: false, shellys_off: false,
             description: 'Full connectivity. Cooler monitoring. Starlink running.' },
}

/** Simulated network latency so loading states are visible. */
function delay<T>(value: T, ms = 120): Promise<T> {
  return new Promise(resolve => setTimeout(() => resolve(value), ms))
}

// --- History generators ----------------------------------------------------

function rawReadings(hours: number, source: 'bms' | 'mppt'): RawReading[] {
  const s = buildSeries(new Date(), hours, hours > 48 ? 30 : 5, 61)
  return s.map((p, i) => ({
    id: i + 1,
    ts: p.ts.toISOString(),
    source,
    soc:         source === 'bms'  ? p.soc : null,
    voltage:     source === 'bms'  ? p.voltage : null,
    current:     source === 'bms'  ? p.current : null,
    temperature: source === 'bms'  ? p.temp : null,
    solar_power:  source === 'mppt' ? +p.solar.toFixed(1) : null,
    charge_state: source === 'mppt' ? p.chargeState : null,
    daily_yield:  source === 'mppt' ? +(p.solar * 0.6).toFixed(0) : null,
    cell_v1: source === 'bms' ? +(p.voltage / 4).toFixed(3) : null,
    cell_v2: source === 'bms' ? +(p.voltage / 4 + 0.002).toFixed(3) : null,
    cell_v3: source === 'bms' ? +(p.voltage / 4 - 0.001).toFixed(3) : null,
    cell_v4: source === 'bms' ? +(p.voltage / 4 + 0.001).toFixed(3) : null,
  }))
}

function hourlyReadings(days: number): HourlyReading[] {
  const out: HourlyReading[] = []
  const end = new Date()
  const rand = rng(42)
  for (let h = days * 24; h >= 0; h--) {
    const ts = new Date(end.getTime() - h * 3600_000)
    const hour = ts.getHours()
    const weather = 0.55 + 0.45 * rand()
    const solar = solarAt(hour + 0.5, ts.getDate()) * weather
    const soc = 55 + 35 * Math.sin(((hour - 4) / 24) * 2 * Math.PI) * weather
    const clamped = Math.max(28, Math.min(100, soc))
    out.push({
      hour_ts: ts.toISOString(),
      avg_soc: +clamped.toFixed(1),
      min_soc: +(clamped - 2).toFixed(1),
      max_soc: +Math.min(100, clamped + 2).toFixed(1),
      avg_voltage: voltageAt(clamped, solar > BASELINE_LOAD_W),
      avg_current: +((solar - BASELINE_LOAD_W) / 13).toFixed(2),
      avg_temp: tempAt(hour),
      avg_solar: +solar.toFixed(1),
      peak_solar: +(solar * 1.18).toFixed(1),
      sample_count: 120,
    })
  }
  return out
}

function dailyReadings(days: number): DailyReading[] {
  const out: DailyReading[] = []
  const end = new Date()
  const rand = rng(1337)
  for (let d = days; d >= 0; d--) {
    const ts = new Date(end.getTime() - d * 86_400_000)
    const weather = 0.45 + 0.55 * rand()          // overcast days vs bluebird
    const peak = PANEL_PEAK_W * weather
    const yieldWh = peak * 5.2
    const avgSoc = 62 + 28 * weather
    out.push({
      day_ts: ts.toISOString().slice(0, 10),
      avg_soc: +avgSoc.toFixed(1),
      min_soc: +(avgSoc - 22 * (1 - weather * 0.4)).toFixed(1),
      max_soc: +Math.min(100, avgSoc + 14).toFixed(1),
      avg_voltage: voltageAt(avgSoc, false),
      avg_current: +(2.4 * weather).toFixed(2),
      avg_temp: +(18 + 6 * weather).toFixed(1),
      avg_solar: +(peak * 0.42).toFixed(1),
      peak_solar: +peak.toFixed(1),
      total_yield: +yieldWh.toFixed(0),
      sample_count: 2880,
    })
  }
  return out
}

function monthlyReadings(): DailyReading[] {
  const out: DailyReading[] = []
  const rand = rng(7)
  for (let m = 11; m >= 0; m--) {
    const ts = new Date()
    ts.setMonth(ts.getMonth() - m, 1)
    const month = ts.getMonth()
    const seasonal = 0.45 + 0.55 * Math.sin(((month - 2) / 12) * 2 * Math.PI) ** 2
    const peak = PANEL_PEAK_W * (0.6 + 0.4 * seasonal) * (0.9 + 0.2 * rand())
    out.push({
      day_ts: ts.toISOString().slice(0, 7),
      avg_soc: +(68 + 22 * seasonal).toFixed(1),
      min_soc: +(44 + 18 * seasonal).toFixed(1),
      max_soc: 100,
      avg_voltage: voltageAt(68 + 22 * seasonal, false),
      avg_current: +(2.1 * seasonal + 0.6).toFixed(2),
      avg_temp: +(8 + 18 * seasonal).toFixed(1),
      avg_solar: +(peak * 0.4).toFixed(1),
      peak_solar: +peak.toFixed(1),
      total_yield: +(peak * 5 * 30).toFixed(0),
      sample_count: 86400,
    })
  }
  return out
}

// --- Mock API --------------------------------------------------------------

export const mockApi = {
  battery: {
    get: (): Promise<BatteryData> => {
      const p = now()
      return delay({
        soc: p.soc,
        voltage: bmsReleased ? p.voltage : jitter(p.voltage, 0.004),
        current: jitter(p.current, 0.08),
        temperature: p.temp,
        cell_voltages: [0, 1, 2, 3].map(i => +(p.voltage / 4 + (i - 1.5) * 0.002).toFixed(3)),
        cycle_count: 47,
        status: bmsReleased ? 'released' : (p.netW > 0 ? 'charging' : 'discharging'),
        connected: !bmsReleased,
        released: bmsReleased,
        last_seen: new Date().toISOString(),
        retry_in: bmsReleased ? 300 : null,
      })
    },
    release: () => { bmsReleased = true;  return delay({ status: 'ok', message: 'BMS released (demo)' }) },
    connect: () => { bmsReleased = false; return delay({ status: 'ok', message: 'BMS reconnected (demo)' }) },
    history: {
      raw:     (hours = 24) => delay(rawReadings(hours, 'bms'), 200),
      hourly:  (days = 7)   => delay(hourlyReadings(days), 200),
      daily:   (days = 30)  => delay(dailyReadings(days), 200),
      monthly: ()           => delay(monthlyReadings(), 200),
    },
  },

  mppt: {
    get: (): Promise<MpptData> => {
      const p = now()
      const yieldToday = series
        .filter(s => s.ts.getDate() === new Date().getDate())
        .reduce((a, s) => a + (s.solar * 5) / 60, 0)
      return delay({
        panel_voltage: +(p.solar > 5 ? 18.4 + Math.random() * 0.6 : 0).toFixed(1),
        panel_power: jitter(+p.solar.toFixed(1), 0.06),
        battery_voltage: p.voltage,
        battery_current: Math.max(0, +(p.solar / p.voltage).toFixed(2)),
        charge_state: p.chargeState,
        daily_yield: +yieldToday.toFixed(0),
        // ~8 months of a 200W panel at a realistic capacity factor.
        total_yield: 96_400,
        max_power_today: 172,
        error_code: 0,
        connected: true,
      })
    },
    history: {
      raw:     (hours = 24) => delay(rawReadings(hours, 'mppt'), 200),
      hourly:  (days = 7)   => delay(hourlyReadings(days), 200),
      daily:   (days = 30)  => delay(dailyReadings(days), 200),
      monthly: ()           => delay(monthlyReadings(), 200),
    },
  },

  ecoflow: {
    get: (): Promise<EcoflowData> => delay({
      battery_percent: 13,
      serial: 'R613ZAB6XG1P0314',
      connected: true,
    }),
  },

  starlink: {
    get: (): Promise<StarlinkData> => delay({
      reachable: true,
      online: true,
      state: 'CONNECTED',
      uptime_s: 43200,
      latency_ms: 38.4,
      ping_drop_rate: 0,
      downlink_bps: 84_000_000,
      uplink_bps: 9_500_000,
      fraction_obstructed: 0.0021,
      currently_obstructed: false,
      power_w: 27.4,
      alerts: [],
      hardware_version: 'mini',
      software_version: 'demo',
      error: null,
    }),
  },

  dometic: {
    get: (): Promise<DometicData> => delay({
      temp_f: 39.6,
      set_temp_f: 39.2,
      battery_voltage: 12.6,
      cooler_on: true,
      door_open: false,
      power_source: 'DC',
      reachable: true,
      last_seen: new Date().toISOString(),
    }),
  },

  shore: {
    get: (): Promise<ShoreData> => delay({
      connected: false,
      charge_mode: 'Disconnected',
      battery_voltage: now().voltage,
      charge_current: 0,
      error_code: 0,
      inferred: true,
    }),
  },

  orion: {
    get: (): Promise<OrionData> => delay({
      enabled: orionEnabled,
      input_voltage_min: 11.0,
      input_voltage_max: 15.5,
      output_voltage: 14.4,
      max_current: 30,
      max_power: 432,
      note: 'Non-smart Orion-Tr. Static config, no telemetry.',
    }),
    toggle: (enabled: boolean): Promise<OrionData> => {
      orionEnabled = enabled
      return mockApi.orion.get()
    },
  },

  shelly: {
    getAll: (): Promise<ShellyUnit[]> => delay([...shellys]),
    get: (id: string): Promise<ShellyUnit> => delay({ ...shellys.find(s => s.id === id)! }),
    toggle: (id: string, on: boolean) => {
      shellys = shellys.map(s => (s.id === id ? { ...s, on } : s))
      return delay({ unit_id: id, on })
    },
  },

  camera: {
    // Cameras are not installed in the real van either; the component
    // renders "No photo available" on rejection, which is accurate.
    latest: (): Promise<Photo> => Promise.reject(new Error('No cameras installed')),
    recent: (): Promise<Photo[]> => delay([]),
    capture: () => delay({ status: 'unavailable' }),
  },

  mode: {
    current: (): Promise<ModeResponse> => delay({
      current: currentMode,
      config: MODE_CONFIG[currentMode],
      available: ['storage', 'camp', 'trail', 'in_town'],
    }),
    set: (mode: string): Promise<ModeResponse> => {
      currentMode = mode as ModeName
      return mockApi.mode.current()
    },
  },

  system: {
    get: (): Promise<SystemData> => {
      const p = now()
      const sources: string[] = []
      if (p.solar > 5) sources.push('solar')
      if (orionEnabled) sources.push('alternator')
      const runtime = p.netW < 0
        ? +((p.soc / 100) * BATTERY_WH / Math.abs(p.netW)).toFixed(1)
        : null
      return delay({
        net_power_w: +p.netW.toFixed(1),
        estimated_runtime_hrs: runtime,
        charge_sources_active: sources,
        mode: currentMode,
        ssid: 'VanNet',
        band: '5GHz',
        wifi_signal_dbm: -54,
        wifi_ip: '10.0.0.42',
      })
    },
    health: () => delay({
      cpu_temp_c: 47.2,
      load_1: 0.08,
      load_5: 0.12,
      mem_total_mb: 906,
      mem_available_mb: 561,
      disk_total_gb: 28.1,
      disk_free_gb: 23.0,
      uptime_s: 183_240,
      throttle: [] as string[],
    }),
    backupStatus: () => delay({
      db_size_bytes: 1_204_224,
      last_scheduled_run: new Date(Date.now() - 9 * 3600_000).toISOString(),
      pending_failed: 0,
      row_counts: { readings_raw: 84_240, readings_hourly: 1_440, readings_daily: 60, events: 214 },
    }),
    backupUrl: () => '',
    wifiProfiles: () => delay([
      { name: 'vannet', active: true },
      { name: 'backup-wifi', active: false },
    ]),
    switchWifi: (name: string) =>
      delay({ ok: false, message: `Switching to ${name} is disabled in demo mode` }),
    // Destructive controls are inert in demo mode.
    shutdown: () => delay({ status: 'demo', message: 'Shutdown disabled in demo mode' }),
    reboot:   () => delay({ status: 'demo', message: 'Reboot disabled in demo mode' }),
  },
}
