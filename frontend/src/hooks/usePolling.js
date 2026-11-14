import { useEffect, useRef, useState } from 'react'

/**
 * Poll an async function on an interval. Polling stops automatically once
 * `stopWhen` returns true (e.g. the render job reached a terminal state).
 */
export function usePolling(fn, { interval = 1200, enabled = true, stopWhen } = {}) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const timer = useRef(null)
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    if (!enabled) return undefined

    let cancelled = false

    const tick = async () => {
      try {
        const result = await fnRef.current()
        if (cancelled) return
        setData(result)
        setError(null)
        if (stopWhen && stopWhen(result)) {
          clearInterval(timer.current)
          timer.current = null
        }
      } catch (err) {
        if (cancelled) return
        setError(err)
        clearInterval(timer.current)
        timer.current = null
      }
    }

    setLoading(true)
    tick()
    timer.current = setInterval(tick, interval)

    return () => {
      cancelled = true
      if (timer.current) clearInterval(timer.current)
      timer.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, interval])

  const refresh = async () => {
    try {
      const result = await fnRef.current()
      setData(result)
      setError(null)
      return result
    } catch (err) {
      setError(err)
      throw err
    }
  }

  return { data, error, loading, refresh }
}
