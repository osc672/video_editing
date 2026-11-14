import { formatTime } from '../hooks/useTimeline'

export default function SubtitleBlock({
  subtitle,
  timeline,
  selected,
  onSelect,
  onChange,
  onDelete,
  onEdit,
}) {
  const { timeToPx } = timeline
  const left = timeToPx(subtitle.start_time)
  const width = Math.max(22, timeToPx(subtitle.end_time - subtitle.start_time))
  const isActive = timeline.playhead >= subtitle.start_time && timeline.playhead <= subtitle.end_time

  const drag = (e) => {
    e.stopPropagation()
    onSelect?.(subtitle.id)
    const length = Math.max(0.2, subtitle.end_time - subtitle.start_time)
    timeline.beginDrag('effect', e, {
      onDrag: (event, rect) => {
        const t = timeline.pxToTime(event.clientX - rect.left)
        let start = t - length / 2
        start = Math.max(0, Math.min(start, timeline.duration - length))
        const snapped = Math.round(start * 10) / 10
        onChange(subtitle.id, {
          start_time: snapped,
          end_time: Math.round((snapped + length) * 10) / 10,
        })
      },
    })
  }

  return (
    <div
      onMouseDown={drag}
      onClick={(e) => {
        e.stopPropagation()
        onSelect?.(subtitle.id)
        timeline.movePlayhead(subtitle.start_time)
      }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        onEdit?.(subtitle)
      }}
      className={`group absolute top-1 flex h-[26px] cursor-ew-resize items-center overflow-hidden rounded-md border px-1.5 transition select-none ${
        selected
          ? 'border-cyan-glow bg-cyan-glow/30 shadow-[0_0_12px_rgba(34,211,238,0.5)] z-20'
          : isActive
          ? 'border-amber-300/90 bg-amber-400/25 shadow-[0_0_8px_rgba(251,191,36,0.4)] z-10'
          : 'border-white/20 bg-white/10 hover:border-white/40 hover:bg-white/15'
      }`}
      style={{ left, width }}
      title={`${subtitle.text}\nDouble-click to edit · ${formatTime(subtitle.start_time, { precise: true })} → ${formatTime(subtitle.end_time, { precise: true })}`}
    >
      <span className="truncate text-[10px] font-medium text-white/90">
        {subtitle.text}
      </span>
    </div>
  )
}
