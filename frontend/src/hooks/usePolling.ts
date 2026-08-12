import { useEffect, useRef } from 'react'
import { useVanStore } from '../store/van'

/**
 * Polls the van API at the given interval.
 * Default: 5 seconds for live feel without hammering the Pi.
 */
export function usePolling(intervalMs = 5000) {
  const fetchAll = useVanStore(s => s.fetchAll)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    fetchAll() // Fetch immediately on mount
    timerRef.current = setInterval(fetchAll, intervalMs)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [fetchAll, intervalMs])
}
