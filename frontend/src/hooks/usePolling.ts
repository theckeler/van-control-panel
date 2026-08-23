import { useVanStore } from '../store/van'
import { useVisibleInterval } from './useVisibleInterval'

/**
 * Polls the van API at the given interval.
 * Default: 5 seconds for live feel without hammering the Pi.
 *
 * Pauses while the tab is hidden — see useVisibleInterval.
 */
export function usePolling(intervalMs = 5000) {
  const fetchAll = useVanStore(s => s.fetchAll)
  useVisibleInterval(fetchAll, intervalMs)
}
