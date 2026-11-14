import { formatTime } from '../hooks/useTimeline'

/**
 * Cyan trim handles spanning the filmstrip with pixel-accurate alignment.
 */
export default function TrimHandles({ timeline }) {
  const { timeToPx, trim, beginDrag, duration, width } = timeline
  const left = Math.max(0, timeToPx(trim.start))
  const right = Math.min(width || 0, timeToPx(trim.end))

  const handle = (kind) => (e) => beginDrag(kind, e)

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {/* dimmed area outside the trim range */}
      <div
        className="absolute inset-y-0 left-0 bg-ink-900/80 backdrop-blur-[1px]"
        style={{ width: left }}
      />
      <div
        className="absolute inset-y-0 bg-ink-900/80 backdrop-blur-[1px]"
        style={{ left: right, right: 0 }}
      />

      {/* selected range border */}
      <div
        className="absolute inset-y-0 border-y-2 border-cyan-glow/80 pointer-events-none"
        style={{ left, width: Math.max(2, right - left) }}
      />

      {/* start handle */}
      <button
        onMouseDown={handle('trim-start')}
        onTouchStart={handle('trim-start')}
        style={{ left }}
        className="pointer-events-auto absolute inset-y-0 z-30 flex w-4 -translate-x-1/2 cursor-ew-resize flex-col items-center justify-between rounded-l-md border-y-2 border-l-2 border-cyan-glow bg-cyan-glow/90 py-2 shadow-[0_0_14px_rgba(34,211,238,0.75)] transition hover:brightness-110 active:scale-105"
        title="Trim start (drag to adjust in-point)"
      >
        <span className="h-1 w-1 rounded-full bg-ink-900/80" />
        <span className="h-4 w-1 rounded-full bg-ink-900/80" />
        <span className="h-1 w-1 rounded-full bg-ink-900/80" />
      </button>

      {/* end handle */}
      <button
        onMouseDown={handle('trim-end')}
        onTouchStart={handle('trim-end')}
        style={{ left: right }}
        className="pointer-events-auto absolute inset-y-0 z-30 flex w-4 -translate-x-1/2 cursor-ew-resize flex-col items-center justify-between rounded-r-md border-y-2 border-r-2 border-cyan-glow bg-cyan-glow/90 py-2 shadow-[0_0_14px_rgba(34,211,238,0.75)] transition hover:brightness-110 active:scale-105"
        title="Trim end (drag to adjust out-point)"
      >
        <span className="h-1 w-1 rounded-full bg-ink-900/80" />
        <span className="h-4 w-1 rounded-full bg-ink-900/80" />
        <span className="h-1 w-1 rounded-full bg-ink-900/80" />
      </button>

      {/* trim labels */}
      <span
        className="pointer-events-none absolute bottom-1.5 z-20 rounded bg-ink-900/90 px-1.5 py-0.5 text-[9px] font-bold tabular-nums text-cyan-glow shadow"
        style={{ left: left + 10 }}
      >
        {formatTime(trim.start, { precise: true })}
      </span>
      <span
        className="pointer-events-none absolute bottom-1.5 z-20 rounded bg-ink-900/90 px-1.5 py-0.5 text-[9px] font-bold tabular-nums text-cyan-glow shadow"
        style={{ left: Math.max(left + 50, right - 46) }}
      >
        {formatTime(trim.end, { precise: true })}
      </span>
    </div>
  )
}
