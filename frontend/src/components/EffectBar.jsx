import { formatTime } from '../hooks/useTimeline'

const BAR_COLORS = [
  'from-cyan-400 to-sky-500',
  'from-fuchsia-400 to-purple-500',
  'from-amber-400 to-orange-500',
  'from-emerald-400 to-teal-500',
  'from-rose-400 to-pink-500',
  'from-indigo-400 to-blue-500',
]

export default function EffectBar({ effect, index, template, timeline, selected, onSelect, onChange }) {
  const { timeToPx, beginDrag, duration } = timeline
  const effectDuration = Math.max(0.1, effect.end_time - effect.start_time)
  const left = timeToPx(effect.start_time)
  const width = Math.max(12, timeToPx(effectDuration))
  const color = BAR_COLORS[index % BAR_COLORS.length]

  const dragMove = (e) => {
    onSelect?.(effect.id)
    beginDrag('effect-move', e, {
      onDrag: (event, rect) => {
        const x = event.clientX - rect.left
        const t = timeline.pxToTime(x)
        const length = effect.end_time - effect.start_time
        let start = t - length / 2
        start = Math.max(0, Math.min(start, duration - length))
        const snapped = Math.round(start * 10) / 10
        onChange?.(effect.id, {
          start_time: snapped,
          end_time: Math.round((snapped + length) * 10) / 10,
        })
      },
    })
  }

  const dragLeft = (e) => {
    e.stopPropagation()
    onSelect?.(effect.id)
    beginDrag('effect-resize-left', e, {
      onDrag: (event, rect) => {
        const x = event.clientX - rect.left
        const t = timeline.pxToTime(x)
        const minLen = 0.5
        let start = Math.max(0, Math.min(t, effect.end_time - minLen))
        start = Math.round(start * 10) / 10
        onChange?.(effect.id, { start_time: start, end_time: effect.end_time })
      },
    })
  }

  const dragRight = (e) => {
    e.stopPropagation()
    onSelect?.(effect.id)
    beginDrag('effect-resize-right', e, {
      onDrag: (event, rect) => {
        const x = event.clientX - rect.left
        const t = timeline.pxToTime(x)
        const minLen = 0.5
        let end = Math.max(effect.start_time + minLen, Math.min(t, duration))
        end = Math.round(end * 10) / 10
        onChange?.(effect.id, { start_time: effect.start_time, end_time: end })
      },
    })
  }

  return (
    <div
      onMouseDown={dragMove}
      className={`group absolute top-1 h-[26px] cursor-grab active:cursor-grabbing overflow-hidden rounded-md bg-gradient-to-r ${color} shadow-lg transition-shadow select-none ${
        selected ? 'ring-2 ring-white/95 shadow-cyan-glow/20' : 'ring-1 ring-white/20 hover:ring-white/50'
      }`}
      style={{ left, width }}
      title={`${template?.name || 'Effect'} · ${effectDuration.toFixed(1)}s (${formatTime(effect.start_time, { precise: true })} → ${formatTime(effect.end_time, { precise: true })})`}
    >
      {/* Left resize handle */}
      <div
        onMouseDown={dragLeft}
        className="absolute inset-y-0 left-0 z-20 flex w-3 cursor-w-resize items-center justify-center bg-black/20 hover:bg-white/40 active:bg-white/60 transition"
        title="Drag left edge to change start time"
      >
        <span className="h-3 w-0.5 rounded-full bg-white/80" />
      </div>

      {/* Content */}
      <div className="flex h-full items-center justify-between gap-1.5 px-3.5">
        <span className="truncate text-[10px] font-bold text-ink-900 drop-shadow-sm">
          {template?.name || 'Effect'}
        </span>
        <span className="shrink-0 rounded bg-ink-900/70 px-1 py-0.2 text-[9px] font-extrabold text-white">
          {effectDuration.toFixed(1)}s
        </span>
      </div>

      {/* Right resize handle */}
      <div
        onMouseDown={dragRight}
        className="absolute inset-y-0 right-0 z-20 flex w-3 cursor-e-resize items-center justify-center bg-black/20 hover:bg-white/40 active:bg-white/60 transition"
        title="Drag right edge to change duration / end time"
      >
        <span className="h-3 w-0.5 rounded-full bg-white/80" />
      </div>
    </div>
  )
}
