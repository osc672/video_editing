import { useEffect, useMemo, useState } from 'react'
import { projects } from '../api/client'
import Toolbar from './Toolbar'
import TrimHandles from './TrimHandles'
import EffectBar from './EffectBar'
import SubtitleTrack from './SubtitleTrack'
import { formatTime } from '../hooks/useTimeline'

export default function Timeline({
  project,
  templates,
  effects,
  subtitles,
  timeline,
  playing,
  onTogglePlay,
  onTrimChange,
  onSave,
  saving,
  onEffectChange,
  onEffectSelect,
  selectedEffectId,
  onSubtitleChange,
  onSubtitleSelect,
  selectedSubtitleId,
  onSubtitleDelete,
  onSubtitleEdit,
  onSubtitleAdd,
  subtitleLoading,
  transcribing,
  onTranscribe,
  onSubtitlePolish,
  onSubtitleImport,
  onPreviewFrame,
  previewLoading,
  subtitleStyle,
  onStyleChange,
}) {
  const [thumbnails, setThumbnails] = useState([])
  const [activeTool, setActiveTool] = useState('trim')

  const { duration, trim, timeToPx, pxToTime, playhead, beginDrag, scrub, width } = timeline

  useEffect(() => {
    if (!project?.id) return
    let cancelled = false
    projects
      .thumbnails(project.id)
      .then((data) => {
        if (!cancelled) setThumbnails(data.thumbnails || [])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [project?.id])

  const templateById = useMemo(() => {
    const map = {}
    for (const t of templates || []) map[t.id] = t
    return map
  }, [templates])

  const [startInput, setStartInput] = useState(trim.start)
  const [endInput, setEndInput] = useState(trim.end)

  useEffect(() => setStartInput(trim.start), [trim.start])
  useEffect(() => setEndInput(trim.end), [trim.end])

  const commitRange = (start, end) => {
    const s = Math.max(0, Math.min(Number(start) || 0, duration))
    const e = Math.max(0, Math.min(Number(end) || 0, duration))
    if (e - s < 0.5) return
    onTrimChange(s, e)
  }

  const trimLength = Math.max(0, trim.end - trim.start)
  const playheadPx = timeToPx(playhead)

  return (
    <div className="panel flex flex-col overflow-hidden">
      {/* toolbar row */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-3 py-2.5">
        <Toolbar active={activeTool} onSelect={setActiveTool} />

        <div className="flex flex-wrap items-center gap-2">
          {/* trim numeric inputs */}
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-white/40">In</label>
            <input
              type="number"
              step="0.1"
              min="0"
              max={duration}
              value={startInput}
              onChange={(e) => setStartInput(e.target.value)}
              onBlur={() => commitRange(startInput, trim.end)}
              onKeyDown={(e) => e.key === 'Enter' && commitRange(startInput, trim.end)}
              className="w-[68px] rounded-lg border border-white/12 bg-ink-900/60 px-2 py-1.5 text-xs tabular-nums text-white outline-none focus:border-cyan-glow/70"
            />
            <span className="text-white/25">→</span>
            <label className="text-[10px] font-bold uppercase tracking-wider text-white/40">Out</label>
            <input
              type="number"
              step="0.1"
              min="0"
              max={duration}
              value={endInput}
              onChange={(e) => setEndInput(e.target.value)}
              onBlur={() => commitRange(trim.start, endInput)}
              onKeyDown={(e) => e.key === 'Enter' && commitRange(trim.start, endInput)}
              className="w-[68px] rounded-lg border border-white/12 bg-ink-900/60 px-2 py-1.5 text-xs tabular-nums text-white outline-none focus:border-cyan-glow/70"
            />
          </div>

          <button
            onClick={onPreviewFrame}
            disabled={previewLoading}
            className="btn-ghost px-3 py-1.5 text-[11px]"
            title="Render the selected effect on the current frame"
          >
            {previewLoading ? (
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/25 border-t-cyan-glow" />
            ) : null}
            Preview frame
          </button>

          <button onClick={onSave} disabled={saving} className="btn-primary px-3 py-1.5 text-[11px]">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* filmstrip */}
      <div className="relative select-none px-3 pt-3">
        <div
          ref={timeline.measureRef}
          onClick={scrub}
          className="relative h-[74px] cursor-pointer overflow-hidden rounded-lg border border-white/10 bg-ink-900"
        >          {thumbnails.length > 0 && (
            <div className="absolute inset-0 flex">
              {thumbnails.map((src, i) => (
                <img
                  key={src}
                  src={src}
                  alt=""
                  draggable={false}
                  className="h-full min-w-0 flex-1 object-cover"
                  style={{ opacity: 0.85 }}
                />
              ))}
            </div>
          )}
          {!thumbnails.length && (
            <div className="absolute inset-0 flex items-center justify-center text-[11px] text-white/25">
              Filmstrip
            </div>
          )}

          <TrimHandles timeline={timeline} />

          {/* playhead */}
          <div
            className="pointer-events-none absolute inset-y-0 z-30 w-px bg-white shadow-[0_0_10px_rgba(255,255,255,0.85)]"
            style={{ left: playheadPx }}
          >
            <div className="absolute -left-[5px] -top-[3px] h-3 w-3 rotate-45 rounded-[2px] bg-white" />
          </div>
        </div>

        {/* ruler */}
        <div className="relative mt-1 h-4">
          {Array.from({ length: 11 }).map((_, i) => {
            const t = (duration * i) / 10
            return (
              <span
                key={i}
                className="absolute top-0 -translate-x-1/2 text-[9px] tabular-nums text-white/25"
                style={{ left: `${(i / 10) * 100}%` }}
              >
                {formatTime(t)}
              </span>
            )
          })}
        </div>
      </div>

      {/* effect bars */}
      <div className="relative mx-3 mt-1 h-[34px] rounded-lg border border-white/10 bg-ink-900/35">
        {effects.length === 0 && (
          <p className="absolute inset-0 flex items-center px-3 text-[11px] text-white/25">
            No effects yet — pick a template and press “Add to timeline”.
          </p>
        )}
        {effects.map((effect, index) => (
          <EffectBar
            key={effect.id}
            effect={effect}
            index={index}
            template={templateById[effect.template_id]}
            timeline={timeline}
            selected={selectedEffectId === effect.id}
            onSelect={onEffectSelect}
            onChange={onEffectChange}
          />
        ))}
      </div>

      <SubtitleTrack
        subtitles={subtitles}
        timeline={timeline}
        selectedId={selectedSubtitleId}
        onSelect={onSubtitleSelect}
        onChange={onSubtitleChange}
        onDelete={onSubtitleDelete}
        onEdit={onSubtitleEdit}
        onAdd={onSubtitleAdd}
        loading={subtitleLoading}
        transcribing={transcribing}
        onTranscribe={onTranscribe}
        onPolish={onSubtitlePolish}
        onImportScript={onSubtitleImport}
        subtitleStyle={subtitleStyle}
        onStyleChange={onStyleChange}
      />

      {/* transport bar */}
      <div className="flex items-center justify-between border-t border-white/10 px-3 py-2">
        <div className="flex items-center gap-2">
          <button
            onClick={onTogglePlay}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-ink-900 transition hover:bg-cyan-glow"
            title="Play / pause (Space)"
          >
            {playing ? (
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                <path d="M8 5.5v13l11-6.5z" />
              </svg>
            )}
          </button>
          <span className="font-mono text-xs tabular-nums text-white/60">
            {formatTime(playhead, { precise: true })}
            <span className="text-white/25"> / {formatTime(duration, { precise: true })}</span>
          </span>
        </div>

        <div className="flex items-center gap-3 text-[11px] text-white/40">
          <span>
            Clip:{' '}
            <span className="font-semibold text-cyan-glow">
              {formatTime(trimLength, { precise: true })}
            </span>
          </span>
          <span className="hidden sm:inline">
            <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-[10px]">Space</kbd> play
            <kbd className="ml-1.5 rounded bg-white/10 px-1.5 py-0.5 text-[10px]">←/→</kbd> nudge
            <kbd className="ml-1.5 rounded bg-white/10 px-1.5 py-0.5 text-[10px]">Del</kbd> remove subtitle
          </span>
        </div>
      </div>
    </div>
  )
}
