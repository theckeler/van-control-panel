import { create } from 'zustand'

export type ToastKind = 'success' | 'error' | 'info'

export interface Toast {
  id: number
  kind: ToastKind
  message: string
}

interface ToastStore {
  toasts: Toast[]
  push: (kind: ToastKind, message: string) => void
  dismiss: (id: number) => void
}

const DURATION: Record<ToastKind, number> = {
  success: 2500,
  info:    3000,
  error:   6000,   // errors linger — the user needs time to read them
}

let nextId = 1

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],

  push: (kind, message) => {
    const id = nextId++

    // Collapse duplicates: if the same message is already showing, don't
    // stack it again. Polling-driven failures can fire repeatedly.
    if (get().toasts.some(t => t.message === message && t.kind === kind)) return

    set(state => ({ toasts: [...state.toasts, { id, kind, message }] }))
    setTimeout(() => get().dismiss(id), DURATION[kind])
  },

  dismiss: (id) => set(state => ({ toasts: state.toasts.filter(t => t.id !== id) })),
}))

/** Non-hook access for use inside store actions. */
export const toast = {
  success: (m: string) => useToastStore.getState().push('success', m),
  error:   (m: string) => useToastStore.getState().push('error', m),
  info:    (m: string) => useToastStore.getState().push('info', m),
}
