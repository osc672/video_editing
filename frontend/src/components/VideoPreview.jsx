import { useEffect, useRef, useState } from 'react'
import { apiError, projects } from '../api/client'
import { formatTime } from '../hooks/useTimeline'

export default function VideoPreview({
  projectId,
  videoRef,
  playing,
  onTimeUpdate,
  onEnded,
  still,
  stillLoading,
  stillError,
  onRefreshStill,
  onDismissStill,
  overlayLabel,
  trim,
  subtitles = [],
  playhead = 0,
  subtitleStyle,
}) {
  const [muted, setMuted] = useState(true)
  const stillTimer = useRef(null)

  const activeSubtitle = (subtitles || []).find(
    (s) => playhead >= s.start_time && playhead <= s.end_time,
  )

  const previewFontSize = Math.max(12, Math.round(((subtitleStyle?.size || 58) * 300) / 1080))

  // The still stays on screen until the user dismisses it or asks for a new
  // one - it is a reference image, not a transient notification.
  useEffect(() => {
    if (!still) return undefined
    clearTimeout(stillTimer.current)
    return () => clearTimeout(stillTimer.current)
  }, [still])

  if (!projectId) return null

  const src = projects.videoUrl(projectId)

  return (
    <div className="flex flex-col items-center">
      <div className="relative aspect-[9/16] w-full max-w-[300px] overflow-hidden rounded-2xl border border-white/12 bg-black shadow-panel">
        <video
          ref={videoRef}
          src={src}
          muted={muted}
          playsInline
          className="h-full w-full object-contain"
          onTimeUpdate={onTimeUpdate}
          onEnded={onEnded}
          onLoadedMetadata={(e) => {
            if (onTimeUpdate) onTimeUpdate(e)
          }}
        />

        {/* Live subtitle overlay */}
        {activeSubtitle && !still && (
          <div className="pointer-events-none absolute inset-x-3 bottom-14 z-10 flex justify-center">
            <div
              className={`px-3 py-1.5 text-center leading-snug transition-all ${
                subtitleStyle?.boxed === true
                  ? 'rounded-lg bg-black/90 shadow-xl'
                  : 'bg-transparent drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]'
              }`}
              style={{
                fontFamily: subtitleStyle?.font || 'Inter, sans-serif',
                fontSize: `${previewFontSize}px`,
                fontWeight: subtitleStyle?.bold !== false ? 800 : 500,
                textTransform: subtitleStyle?.uppercase !== false ? 'uppercase' : 'none',
              }}
            >
              {(() => {
                const raw = activeSubtitle.text || ''
                let lines = raw.split('\n').filter(Boolean)
                if (lines.length <= 1) {
                  const words = raw.trim().split(' ')
                  if (words.length >= 6) {
                    const mid = Math.floor(words.length / 2)
                    lines = [words.slice(0, mid).join(' '), words.slice(mid).join(' ')]
                  } else {
                    lines = [raw]
                  }
                }
                const hlColor = `#${subtitleStyle?.highlightColor || 'E5252A'}`
                const normalColor = `#${subtitleStyle?.color || 'FFFFFF'}`
                return lines.map((line, idx) => {
                  const isHl =
                    (lines.length === 2 && idx === 1) || (lines.length >= 3 && idx === 1)
                  return (
                    <div
                      key={idx}
                      style={{ color: isHl ? hlColor : normalColor }}
                    >
                      {line}
                    </div>
                  )
                })
              })()}
            </div>
          </div>
        )}

        {/* Live Brand / REC badge overlay */}
        {subtitleStyle?.brandTag && !still && (
          <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center">
            <div className="flex items-center gap-1.5 rounded-full bg-black/80 px-2.5 py-0.5 text-[9px] font-bold tracking-wider text-white shadow-md border border-white/10 font-mono uppercase">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
              <span className="text-rose-400">REC</span>
              <span className="text-white/40">•</span>
              <span>{subtitleStyle.brandTag}</span>
            </div>
          </div>
        )}

        {still && (
          <div className="absolute inset-0 bg-ink-900/40">
            <img
              src={still}
              alt="Effect preview frame"
              className="h-full w-full object-contain"
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-900/95 to-transparent px-3 pb-2.5 pt-8">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-cyan-glow">
                    Preview frame
                  </p>
                  <p className="text-[10px] leading-snug text-white/45">
                    Final render may take a few minutes.
                  </p>
                </div>
                <button
                  onClick={onDismissStill}
                  className="rounded-md bg-white/10 px-2 py-1 text-[10px] font-semibold text-white/70 transition hover:bg-white/20 hover:text-white"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {stillLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-ink-900/70 backdrop-blur-sm">
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-white/15 border-t-cyan-glow" />
            <p className="text-[11px] font-medium text-white/60">Rendering preview frame…</p>
          </div>
        )}

        {!playing && !stillLoading && (
          <button
            onClick={() => {
              const v = videoRef.current
              if (!v) return
              if (v.paused) v.play()
              else v.pause()
            }}
            className="absolute inset-0 flex items-center justify-center opacity-0 transition hover:opacity-100"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-ink-900 shadow-panel">
              <svg viewBox="0 0 100 100" className="ml-0.5 h-6 w-6" fill="currentColor">
                <path d="M38 26l30 24-30 24z" />
              </svg>
            </span>
          </button>
        )}
      </div>

      <div className="mt-3 flex w-full max-w-[300px] items-center justify-between text-[11px] text-white/40">
        <button
          onClick={() => setMuted((m) => !m)}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 transition hover:bg-white/5 hover:text-white/70"
        >
          {muted ? (
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M11 5L6 9H2v6h4l5 4V5z" />
              <path d="m22 9-6 6M16 9l6 6" strokeLinecap="round" />
            </svg>
          ) : (
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M11 5L6 9H2v6h4l5 4V5z" />
              <path d="M15.5 8.5a5 5 0 010 7M19 5a9 9 0 010 14" strokeLinecap="round" />
            </svg>
          )}
          {muted ? 'Muted' : 'Sound on'}
        </button>

        {onRefreshStill && (
          <button
            onClick={onRefreshStill}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 transition hover:bg-white/5 hover:text-white/70"
            title="Render the effect on the current frame"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M3 12a9 9 0 0115.5-6.2M21 12a9 9 0 01-15.5 6.2" strokeLinecap="round" />
              <path d="M18 3v4h-4M6 21v-4h4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Preview effect
          </button>
        )}
      </div>

      {stillError && (
        <p className="mt-2 max-w-[300px] rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-200">
          {stillError}
        </p>
      )}

      {overlayLabel && (
        <p className="mt-2 text-[11px] text-white/35">{overlayLabel}</p>
      )}
    </div>
  )
}
