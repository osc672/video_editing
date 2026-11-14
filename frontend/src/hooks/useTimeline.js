import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export const SNAP = 0.1 // seconds - trim handles and playhead snap to this

export function snap(value, step = SNAP) {
  return Math.round(value / step) * step
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

/**
 * Timeline state: pixel-accurate mapping between seconds and pixels, the
 * trim range, the playhead and the subtitle blocks.
 *
 * `pxPerSecond` is shared by the filmstrip, the effect bars and the subtitle
 * track so every layer lines up exactly.
 *
 * The timeline element is attached through the returned `measureRef` callback
 * ref. A callback ref (rather than a plain ref) is required because the
 * timeline only mounts once the project has loaded - a `useEffect` that
 * measured a plain ref would run while the element did not exist yet.
 */
export function useTimeline({ duration = 0, trimStart = 0, trimEnd = 0 }) {
  const [width, setWidth] = useState(0)
  const [playhead, setPlayhead] = useState(0)
  const [trim, setTrim] = useState({ start: trimStart, end: trimEnd })
  const trimRef = useRef(trim)
  useEffect(() => {
    trimRef.current = trim
  }, [trim])
  const elRef = useRef(null)
  const roRef = useRef(null)

  useEffect(() => {
    const s = trimStart || 0
    const e = trimEnd || duration || 0
    setTrim({ start: s, end: e > s ? e : s + 1 })
  }, [trimStart, trimEnd, duration])

  useEffect(() => () => roRef.current?.disconnect(), [])

  const measureRef = useCallback((el) => {
    if (elRef.current === el) return
    roRef.current?.disconnect()
    roRef.current = null
    elRef.current = el
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    roRef.current = ro
    setWidth(el.clientWidth)
  }, [])

  const safeDuration = Math.max(duration, 0.001)
  const pxPerSecond = width > 0 ? width / safeDuration : 0

  const timeToPx = useCallback((t) => t * pxPerSecond, [pxPerSecond])
  const pxToTime = useCallback((px) => (pxPerSecond ? px / pxPerSecond : 0), [pxPerSecond])

  const movePlayhead = useCallback(
    (t) => {
      setPlayhead(clamp(t, 0, safeDuration))
    },
    [safeDuration],
  )

  const setTrimRange = useCallback(
    (start, end) => {
      const s = clamp(snap(start), 0, safeDuration)
      const e = clamp(snap(end), 0, safeDuration)
      if (e - s < 0.5) return
      setTrim({ start: s, end: e })
    },
    [safeDuration],
  )

  // ---- dragging ----------------------------------------------------------
  const drag = useRef(null)

  const beginDrag = useCallback(
    (kind, event, extra = {}) => {
      const rect = elRef.current?.getBoundingClientRect()
      if (!rect) return
      event.preventDefault()
      event.stopPropagation()
      drag.current = { kind, extra }
      const move = (e) => {
        const d = drag.current
        if (!d) return
        const clientX = e.touches && e.touches.length > 0 ? e.touches[0].clientX : e.clientX
        const x = clientX - rect.left
        if (d.kind === 'playhead') {
          setPlayhead(clamp(snap(pxToTime(x)), 0, safeDuration))
        } else if (d.kind === 'trim-start') {
          setTrim((prev) => {
            const maxStart = Math.max(0, (prev?.end ?? safeDuration) - 0.5)
            const t = clamp(snap(pxToTime(x)), 0, maxStart)
            return { ...prev, start: t }
          })
        } else if (d.kind === 'trim-end') {
          setTrim((prev) => {
            const minEnd = Math.min(safeDuration, (prev?.start ?? 0) + 0.5)
            const t = clamp(snap(pxToTime(x)), minEnd, safeDuration)
            return { ...prev, end: t }
          })
        } else if (d.kind === 'effect') {
          d.extra.onDrag(e, rect)
        }
      }
      const up = () => {
        drag.current = null
        window.removeEventListener('mousemove', move)
        window.removeEventListener('mouseup', up)
        window.removeEventListener('touchmove', move)
        window.removeEventListener('touchend', up)
      }
      window.addEventListener('mousemove', move)
      window.addEventListener('mouseup', up)
      window.addEventListener('touchmove', move, { passive: false })
      window.addEventListener('touchend', up)
    },
    [pxToTime, safeDuration],
  )

  // Click on the filmstrip to scrub
  const scrub = useCallback(
    (event) => {
      const rect = elRef.current?.getBoundingClientRect()
      if (!rect) return
      const x = event.clientX - rect.left
      setPlayhead(clamp(snap(pxToTime(x)), 0, safeDuration))
    },
    [pxToTime, safeDuration],
  )

  return {
    width,
    pxPerSecond,
    timeToPx,
    pxToTime,
    playhead,
    movePlayhead,
    setPlayhead,
    trim,
    setTrim,
    setTrimRange,
    beginDrag,
    scrub,
    duration: safeDuration,
    measureRef,
  }
}

export function formatTime(seconds, { precise = false } = {}) {
  const s = Math.max(0, seconds || 0)
  const m = Math.floor(s / 60)
  const rest = s - m * 60
  if (precise) return `${m}:${rest.toFixed(1).padStart(4, '0')}`
  return `${m}:${String(Math.floor(rest)).padStart(2, '0')}`
}
