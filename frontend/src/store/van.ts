import { create } from 'zustand'
import type {
  BatteryData, MpptData, ShoreData, OrionData,
  ShellyUnit, SystemData, ModeResponse,
  RawReading, HourlyReading, DailyReading,
} from '../types'
import { api } from '../api/client'

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
    await api.shelly.toggle(id, on)
    set(state => ({
      shellys: state.shellys.map(s => s.id === id ? { ...s, on } : s)
    }))
  },

  setMode: async (mode: string) => {
    const result = await api.mode.set(mode)
    set({ mode: result })
  },

  releaseBms: async () => {
    await api.battery.release()
    // Optimistically update status
    set(state => ({
      battery: state.battery ? { ...state.battery, released: true, connected: false, status: 'released' } : null
    }))
  },

  connectBms: async () => {
    await api.battery.connect()
    set(state => ({
      battery: state.battery ? { ...state.battery, released: false, status: 'connecting' } : null
    }))
  },
}))
