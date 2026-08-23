import { useEffect, useRef } from 'react'

/**
 * Runs `callback` on an interval, but only while the tab is visible.
 *
 * The dashboard tends to sit open in a background tab for hours. Polling on
 * regardless means thousands of requests an hour nobody is looking at, over
 * Starlink, against a Pi. On regaining visibility we fire immediately so the
 * view isn't stale, then resume the interval.
 *
 * `callback` is held in a ref, so passing an inline function doesn't restart
 * the timer on every render.
 */
export function useVisibleInterval(callback: () => void, intervalMs: number) {
  const savedCallback = useRef(callback)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    savedCallback.current = callback
  }, [callback])

  useEffect(() => {
    const tick = () => savedCallback.current()

    const stop = () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }

    const start = () => {
      if (timerRef.current) return   // already running
      tick()
      timerRef.current = setInterval(tick, intervalMs)
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') start()
      else stop()
    }

    // Don't start a timer if we mount into a hidden tab.
    if (document.visibilityState === 'visible') start()

    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      stop()
    }
  }, [intervalMs])
}
