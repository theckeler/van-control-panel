import { create } from 'zustand'
import type { BatteryData, MpptData, ShoreData, OrionData, ShellyUnit, SystemData, ModeResponse } from '../types'
import { api } from '../api/client'

interface VanStore {
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

  fetchAll: () => Promise<void>
  toggleShelly: (id: string, on: boolean) => Promise<void>
  setMode: (mode: string) => Promise<void>
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
    } catch (err) {
      set({ loading: false, error: 'Failed to fetch van data' })
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
}))
