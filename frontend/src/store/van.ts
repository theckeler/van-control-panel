import { create } from 'zustand'
import type {
  BatteryData, MpptData, ShoreData, OrionData,
  ShellyUnit, SystemData, ModeResponse,
  RawReading, HourlyReading, DailyReading,
} from '../types'
import { api } from '../api/client'
import { toast } from './toast'

/**
 * Turn a thrown value into something worth showing a user.
 * `fetch` rejects with "Failed to fetch" when the Pi is unreachable, which
 * is accurate but unhelpful, so it gets translated.
 */
function describe(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
    return 'the Pi is unreachable'
  }
  const status = msg.match(/API error (\d+)/)?.[1]
  if (status === '401' || status === '403') return 'session expired, reload to sign in'
  if (status === '502' || status === '503') return 'the backend is down'
  if (status) return `server returned ${status}`
  return msg
}

interface VanStore {
  // Live data
  battery: BatteryData | null
  mppt: MpptData | null
  shore: ShoreData | null
  orion: OrionData | null
  shellys: ShellyUnit[]
  system: SystemData | null
  mode: ModeResponse | null
  loading: boolean
  lastUpdated: Date | null
  error: string | null

  // History data
  socRaw: RawReading[]
  solarRaw: RawReading[]
  dailyHistory: DailyReading[]
  hourlyHistory: HourlyReading[]
  historyLoaded: boolean

  // Actions
  fetchAll: () => Promise<void>
  fetchHistory: () => Promise<void>
  toggleShelly: (id: string, on: boolean) => Promise<void>
  setMode: (mode: string) => Promise<void>
  releaseBms: () => Promise<void>
  connectBms: () => Promise<void>
}

export const useVanStore = create<VanStore>((set, get) => ({
  battery: null,
  mppt: null,
  shore: null,
  orion: null,
  shellys: [],
  system: null,
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
    set({ loading: true, error: null })
    try {
      const [battery, mppt, shore, orion, shellys, system, mode] = await Promise.allSettled([
        api.battery.get(),
        api.mppt.get(),
        api.shore.get(),
        api.orion.get(),
        api.shelly.getAll(),
        api.system.get(),
        api.mode.current(),
      ])

      set({
        battery: battery.status === 'fulfilled' ? battery.value : get().battery,
        mppt: mppt.status === 'fulfilled' ? mppt.value : get().mppt,
        shore: shore.status === 'fulfilled' ? shore.value : get().shore,
        orion: orion.status === 'fulfilled' ? orion.value : get().orion,
        shellys: shellys.status === 'fulfilled' ? shellys.value : get().shellys,
        system: system.status === 'fulfilled' ? system.value : get().system,
        mode: mode.status === 'fulfilled' ? mode.value : get().mode,
        loading: false,
        lastUpdated: new Date(),
      })
    } catch {
      set({ loading: false, error: 'Failed to fetch van data' })
    }
  },

  fetchHistory: async () => {
    try {
      const [socRaw, solarRaw, daily, hourly] = await Promise.allSettled([
        api.battery.history.raw(24),
        api.mppt.history.raw(24),
        api.mppt.history.daily(30),
        api.battery.history.hourly(7),
      ])
      set({
        socRaw:       socRaw.status   === 'fulfilled' ? socRaw.value   : get().socRaw,
        solarRaw:     solarRaw.status === 'fulfilled' ? solarRaw.value : get().solarRaw,
        dailyHistory: daily.status    === 'fulfilled' ? daily.value    : get().dailyHistory,
        hourlyHistory:hourly.status   === 'fulfilled' ? hourly.value   : get().hourlyHistory,
        historyLoaded: true,
      })
    } catch {
      set({ historyLoaded: true })
    }
  },

  toggleShelly: async (id: string, on: boolean) => {
    const label = get().shellys.find(s => s.id === id)?.label ?? id
    try {
      await api.shelly.toggle(id, on)
      set(state => ({
        shellys: state.shellys.map(s => s.id === id ? { ...s, on } : s)
      }))
      toast.success(`${label} ${on ? 'on' : 'off'}`)
    } catch (err) {
      // No optimistic update on failure — the switch stays where it was,
      // which matches the relay's actual state.
      toast.error(`Couldn't switch ${label} — ${describe(err)}`)
    }
  },

  setMode: async (mode: string) => {
    try {
      const result = await api.mode.set(mode)
      set({ mode: result })
      toast.success(`Mode set to ${result.config.label}`)
    } catch (err) {
      toast.error(`Couldn't set mode — ${describe(err)}`)
    }
  },

  releaseBms: async () => {
    try {
      await api.battery.release()
      // Optimistically update status
      set(state => ({
        battery: state.battery ? { ...state.battery, released: true, connected: false, status: 'released' } : null
      }))
      toast.info('BMS released — the Power Queen app can connect now')
    } catch (err) {
      toast.error(`Release failed — ${describe(err)}`)
    }
  },

  connectBms: async () => {
    try {
      await api.battery.connect()
      set(state => ({
        battery: state.battery ? { ...state.battery, released: false, status: 'connecting' } : null
      }))
      toast.info('Reconnecting to BMS — this can take up to 35s')
    } catch (err) {
      toast.error(`Reconnect failed — ${describe(err)}`)
    }
  },
}))
