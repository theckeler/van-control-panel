import type {
  BatteryData, MpptData, ShoreData, OrionData,
  ShellyUnit, Photo, ModeResponse, SystemData
} from '../types'

const BASE = '/api'

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`)
  return res.json()
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`)
  return res.json()
}

export const api = {
  battery: {
    get: () => get<BatteryData>('/battery/'),
    history: (hours = 24) => get<{ hours: number; data: number[] }>(`/battery/history?hours=${hours}`),
  },
  mppt: {
    get: () => get<MpptData>('/mppt/'),
    history: (days = 7) => get<{ days: number; data: number[] }>(`/mppt/history?days=${days}`),
  },
  shore: {
    get: () => get<ShoreData>('/shore/'),
  },
  orion: {
    get: () => get<OrionData>('/orion/'),
    toggle: (enabled: boolean) => post<OrionData>(`/orion/toggle?enabled=${enabled}`),
  },
  shelly: {
    getAll: () => get<ShellyUnit[]>('/shelly/'),
    get: (id: string) => get<ShellyUnit>(`/shelly/${id}`),
    toggle: (id: string, on: boolean) => post<{ unit_id: string; on: boolean }>(`/shelly/${id}/toggle`, { on }),
  },
  camera: {
    latest: (cam: 'interior' | 'exterior') => get<Photo>(`/photos/latest?cam=${cam}`),
    recent: (cam: 'interior' | 'exterior', limit = 20) => get<Photo[]>(`/photos/recent?cam=${cam}&limit=${limit}`),
    capture: (cam: 'interior' | 'exterior') => post(`/photos/capture?cam=${cam}`),
  },
  mode: {
    current: () => get<ModeResponse>('/mode/current'),
    set: (mode: string) => post<ModeResponse>(`/mode/${mode}`),
  },
  system: {
    get: () => get<SystemData>('/system/'),
  },
}
