import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { projects, subtitles, apiError } from '../api/client'
import { useToast } from '../components/ToastProvider'

function formatTime(sec) {
  if (isNaN(sec) || sec < 0) sec = 0
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  const ms = Math.floor((sec % 1) * 10)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${ms}`
}

export default function VideoCut() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const videoRef = useRef(null)
  const timelineRef = useRef(null)

  const [project, setProject] = useState(null)
  const [loading, setLoading] = useState(true)
  const [thumbnails, setThumbnails] = useState([])
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1.0)

  // Segments state: [{ id, start, end, kept }]
  const [segments, setSegments] = useState([])
  const [selectedSegId, setSelectedSegId] = useState(null)
  const [history, setHistory] = useState([])

  const [processing, setProcessing] = useState(false)
  const [processStage, setProcessStage] = useState('')
  const [savedCutUrl, setSavedCutUrl] = useState(null)

  // Load project & thumbs
  useEffect(() => {
    let mounted = true
    setLoading(true)
    projects
      .get(projectId)
      .then((p) => {
        if (!mounted) return
        setProject(p)
        const dur = Number(p.duration) || 10
        setDuration(dur)
        const initial = [{ id: 'seg-1', start: 0, end: dur, kept: true }]
        setSegments(initial)
        setSelectedSegId('seg-1')
      })
      .catch((err) => {
        toast.error(apiError(err, 'Failed to load project.'))
        navigate('/upload')
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    projects
      .thumbnails(projectId)
      .then((res) => {
        if (mounted && res?.thumbnails) setThumbnails(res.thumbnails)
      })
      .catch(() => {})

    return () => {
      mounted = false
    }
  }, [projectId, navigate, toast])

  // Computed kept stats
  const keptSegments = useMemo(() => segments.filter((s) => s.kept), [segments])
  const cutSegments = useMemo(() => segments.filter((s) => !s.kept), [segments])

  const totalKeptDuration = useMemo(() => {
    return keptSegments.reduce((acc, s) => acc + (s.end - s.start), 0)
  }, [keptSegments])

  const totalCutDuration = useMemo(() => {
    return cutSegments.reduce((acc, s) => acc + (s.end - s.start), 0)
  }, [cutSegments])

  // Save history snapshot before mutation
  const pushHistory = useCallback(() => {
    setHistory((prev) => [...prev.slice(-15), JSON.parse(JSON.stringify(segments))])
  }, [segments])

  const undo = useCallback(() => {
    if (history.length === 0) return
    const prev = history[history.length - 1]
    setHistory((h) => h.slice(0, -1))
    setSegments(prev)
    toast.success('Action undone')
  }, [history, toast])

  // Split at playhead
  const handleSplit = useCallback(() => {
    if (!duration) return
    const t = Math.max(0.1, Math.min(currentTime, duration - 0.1))
    const segIdx = segments.findIndex((s) => t > s.start + 0.15 && t < s.end - 0.15)
    if (segIdx === -1) {
      toast.error('Cannot split here: too close to segment start or end boundary.')
      return
    }

    pushHistory()
    const target = segments[segIdx]
    const left = { id: `seg-${Date.now()}-a`, start: target.start, end: t, kept: target.kept }
    const right = { id: `seg-${Date.now()}-b`, start: t, end: target.end, kept: target.kept }

    const nextSegs = [...segments.slice(0, segIdx), left, right, ...segments.slice(segIdx + 1)]
    setSegments(nextSegs)
    setSelectedSegId(right.id)
    toast.success(`Split video at ${formatTime(t)}`)
  }, [currentTime, duration, segments, pushHistory, toast])

  // Toggle Keep/Cut
  const toggleSegmentKeep = useCallback(
    (id) => {
      pushHistory()
      setSegments((prev) =>
        prev.map((s) => {
          if (s.id !== id) return s
          const willKeep = !s.kept
          return { ...s, kept: willKeep }
        }),
      )
    },
    [pushHistory],
  )

  // Smart preview playback: automatically skip cut sections
  const handleTimeUpdate = useCallback(() => {
    if (!videoRef.current) return
    const cur = videoRef.current.currentTime
    setCurrentTime(cur)

    // Check if current time falls in a cut segment
    const activeCut = segments.find((s) => !s.kept && cur >= s.start && cur < s.end)
    if (activeCut) {
      // Find the next kept segment after this cut
      const nextKept = segments.find((s) => s.kept && s.start >= activeCut.end)
      if (nextKept) {
        videoRef.current.currentTime = nextKept.start
        setCurrentTime(nextKept.start)
      } else {
        // No more kept content, pause at end of last kept
        videoRef.current.pause()
        setPlaying(false)
      }
    }
  }, [segments])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if typing in input
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return

      if (e.code === 'Space') {
        e.preventDefault()
        if (videoRef.current) {
          if (videoRef.current.paused) {
            videoRef.current.play()
            setPlaying(true)
          } else {
            videoRef.current.pause()
            setPlaying(false)
          }
        }
      } else if (e.key === 's' || e.key === 'S' || e.key === 'c' || e.key === 'C') {
        e.preventDefault()
        handleSplit()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (videoRef.current) {
          const delta = e.shiftKey ? 2.0 : 0.5
          videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - delta)
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        if (videoRef.current) {
          const delta = e.shiftKey ? 2.0 : 0.5
          videoRef.current.currentTime = Math.min(duration, videoRef.current.currentTime + delta)
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedSegId) {
          e.preventDefault()
          toggleSegmentKeep(selectedSegId)
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault()
        undo()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSplit, selectedSegId, toggleSegmentKeep, undo, duration])

  // Seek on timeline click
  const handleTimelineClick = (e) => {
    if (!timelineRef.current || !duration || !videoRef.current) return
    const rect = timelineRef.current.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const pct = Math.max(0, Math.min(1, clickX / rect.width))
    const targetTime = pct * duration
    videoRef.current.currentTime = targetTime
    setCurrentTime(targetTime)
  }

  // Save Cut Video
  const handleSaveCut = async () => {
    if (keptSegments.length === 0) {
      toast.error('All video sections are cut! Please keep at least one section.')
      return
    }
    try {
      setProcessing(true)
      setProcessStage('Slicing and concatenating clean video clips...')
      const ranges = keptSegments.map((s) => [s.start, s.end])
      const res = await projects.cut(projectId, { kept_ranges: ranges, action: 'save' })
      const dur = Number(res.duration) || totalKeptDuration
      setDuration(dur)
      setSegments([{ id: `seg-${Date.now()}`, start: 0, end: dur, kept: true }])
      const baseVideo = projects.videoUrl(projectId)
      const baseCut = projects.cutVideoUrl(projectId)
      const sep = (u) => (u.includes('?') ? '&' : '?')
      if (videoRef.current) {
        videoRef.current.src = `${baseVideo}${sep(baseVideo)}_t=${Date.now()}`
        videoRef.current.currentTime = 0
        setCurrentTime(0)
      }
      setSavedCutUrl(`${baseCut}${sep(baseCut)}_t=${Date.now()}`)
      toast.success('Cut video saved successfully! You can download it now or edit later.')
    } catch (err) {
      toast.error(apiError(err, 'Failed to save cut video.'))
    } finally {
      setProcessing(false)
      setProcessStage('')
    }
  }

  // Proceed to Reel Edit
  const handleProceedToEdit = async () => {
    if (keptSegments.length === 0) {
      toast.error('All video sections are cut! Please keep at least one section.')
      return
    }
    try {
      setProcessing(true)
      setProcessStage('Cutting video & syncing clean timeline...')
      const ranges = keptSegments.map((s) => [s.start, s.end])
      const res = await projects.cut(projectId, { kept_ranges: ranges, action: 'proceed' })
      
      // Kick off whisper speech transcription in the background
      setProcessStage('Transcribing spoken speech for subtitles...')
      try {
        await subtitles.transcribe(projectId)
      } catch {
        /* proceed anyway */
      }
      
      toast.success('Cut applied! Opening Reel Editor...')
      navigate(`/editor/${projectId}`)
    } catch (err) {
      toast.error(apiError(err, 'Failed to proceed to Reel Editor.'))
      setProcessing(false)
      setProcessStage('')
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-app-canvas text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-glow border-t-transparent" />
          <span className="text-sm font-semibold tracking-wide text-slate-300">Loading Video Cut Studio...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-app-canvas text-white font-sans">
      {/* Studio Top Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.07] bg-ink-950/80 px-6 backdrop-blur-md z-20">
        <div className="flex items-center gap-4">
          <Link
            to="/upload"
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
          >
            ← Back
          </Link>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-tr from-cyan-glow to-blue-500 text-ink-950 font-black text-xs shadow-glow shadow-cyan-glow/20">
              ✂
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold tracking-wide text-white uppercase">Video Cut Studio</span>
                <span className="rounded-full bg-cyan-glow/15 border border-cyan-glow/30 px-2 py-0.5 text-[9px] font-mono font-bold text-cyan-300">
                  MULTI-CUT MODE
                </span>
              </div>
              <p className="text-[10px] text-slate-400 truncate max-w-xs">{project?.original_filename}</p>
            </div>
          </div>
        </div>

        {/* Stats Pills */}
        <div className="hidden md:flex items-center gap-3 text-xs">
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1 text-slate-400">
            Original: <span className="font-mono text-white font-semibold">{formatTime(duration)}</span>
          </div>
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-rose-300">
            Cut Out: <span className="font-mono font-semibold">-{formatTime(totalCutDuration)}</span> ({cutSegments.length} cut{cutSegments.length !== 1 ? 's' : ''})
          </div>
          <div className="rounded-lg border border-cyan-glow/30 bg-cyan-glow/10 px-3 py-1 text-cyan-200">
            Final Length: <span className="font-mono font-bold text-cyan-300">{formatTime(totalKeptDuration)}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          {history.length > 0 && (
            <button
              onClick={undo}
              className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.08]"
              title="Undo last cut (Ctrl+Z)"
            >
              ↩ Undo
            </button>
          )}

          <button
            onClick={handleSaveCut}
            disabled={processing || keptSegments.length === 0}
            className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/[0.12] active:scale-95 disabled:opacity-40"
          >
            💾 Save Cut Video
          </button>

          <button
            onClick={handleProceedToEdit}
            disabled={processing || keptSegments.length === 0}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-glow via-blue-500 to-indigo-500 px-5 py-2 text-xs font-bold text-ink-950 shadow-glow shadow-cyan-glow/20 transition hover:brightness-110 active:scale-95 disabled:opacity-40"
          >
            ✨ Proceed to Reel Edit →
          </button>
        </div>
      </header>

      {/* Main Studio Body: Player Canvas + Controls */}
      <div className="relative flex flex-1 flex-col overflow-hidden">
        {/* Video Stage Container */}
        <div className="relative flex flex-1 items-center justify-center p-4 bg-app-canvas overflow-hidden">
          {/* Ambient Video Glow */}
          <div className="pointer-events-none absolute h-96 w-72 rounded-full bg-cyan-glow/10 blur-[130px]" />

          <div className="relative flex h-full max-h-[62vh] max-w-[90vw] items-center justify-center rounded-2xl border border-white/[0.08] bg-black/60 shadow-2xl overflow-hidden backdrop-blur-sm">
            <video
              ref={videoRef}
              src={projects.videoUrl(projectId)}
              onTimeUpdate={handleTimeUpdate}
              onEnded={() => setPlaying(false)}
              className="h-full w-full object-contain"
              playsInline
            />

            {/* Timecode Badge Overlay */}
            <div className="absolute top-3 left-3 flex items-center gap-2 rounded-lg bg-black/75 px-3 py-1.5 font-mono text-xs backdrop-blur-md border border-white/10 shadow-lg">
              <span className="text-cyan-300 font-bold">{formatTime(currentTime)}</span>
              <span className="text-white/40">/</span>
              <span className="text-slate-300">{formatTime(duration)}</span>
            </div>

            {/* Active Segment State Badge */}
            <div className="absolute top-3 right-3">
              {(() => {
                const curSeg = segments.find((s) => currentTime >= s.start && currentTime <= s.end)
                if (!curSeg) return null
                return curSeg.kept ? (
                  <span className="flex items-center gap-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 px-2.5 py-1 text-[11px] font-bold text-emerald-300 backdrop-blur-md shadow-md">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                    PLAYING (KEPT)
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 rounded-lg bg-rose-500/20 border border-rose-500/40 px-2.5 py-1 text-[11px] font-bold text-rose-300 backdrop-blur-md shadow-md">
                    <span className="h-2 w-2 rounded-full bg-rose-400" />
                    CUT OUT (SKIPPED)
                  </span>
                )
              })()}
            </div>
          </div>
        </div>

        {/* Transport Toolbar */}
        <div className="flex h-12 shrink-0 items-center justify-between border-t border-white/[0.06] bg-ink-950/90 px-8">
          {/* Left: Speed control */}
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <span>Speed:</span>
            {[1.0, 1.25, 1.5, 2.0].map((rate) => (
              <button
                key={rate}
                onClick={() => {
                  setPlaybackRate(rate)
                  if (videoRef.current) videoRef.current.playbackRate = rate
                }}
                className={`rounded px-2 py-0.5 font-mono text-[11px] transition ${
                  playbackRate === rate
                    ? 'bg-cyan-glow/20 text-cyan-300 font-bold border border-cyan-glow/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {rate}x
              </button>
            ))}
          </div>

          {/* Center: Play, Step, Split Controls */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (videoRef.current) videoRef.current.currentTime = Math.max(0, currentTime - 1)
              }}
              className="rounded-lg p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
              title="Step backward 1s (←)"
            >
              ⏪ -1s
            </button>

            <button
              onClick={() => {
                if (videoRef.current) {
                  if (videoRef.current.paused) {
                    videoRef.current.play()
                    setPlaying(true)
                  } else {
                    videoRef.current.pause()
                    setPlaying(false)
                  }
                }
              }}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-glow to-blue-500 text-ink-950 font-black shadow-glow shadow-cyan-glow/30 transition hover:scale-105 active:scale-95"
              title="Play / Pause (Space)"
            >
              {playing ? '⏸' : '▶'}
            </button>

            <button
              onClick={() => {
                if (videoRef.current) videoRef.current.currentTime = Math.min(duration, currentTime + 1)
              }}
              className="rounded-lg p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
              title="Step forward 1s (→)"
            >
              +1s ⏩
            </button>

            <div className="h-5 w-px bg-white/10 mx-2" />

            {/* Split Button */}
            <button
              onClick={handleSplit}
              className="flex items-center gap-2 rounded-xl border border-cyan-glow/40 bg-cyan-glow/15 px-4 py-2 text-xs font-bold text-cyan-200 transition hover:bg-cyan-glow/25 hover:border-cyan-glow/70 active:scale-95 shadow-glow shadow-cyan-glow/10"
              title="Split clip at playhead (Hotkey: S)"
            >
              <span className="text-sm">✂️</span> Split at {formatTime(currentTime)}
              <kbd className="rounded bg-black/40 px-1 py-0.5 font-mono text-[9px] text-cyan-300">S</kbd>
            </button>
          </div>

          {/* Right: Shortcuts Guide */}
          <div className="flex items-center gap-3 text-[11px] text-slate-500">
            <span><kbd className="rounded bg-white/10 px-1 font-mono text-slate-300">Space</kbd> Play</span>
            <span><kbd className="rounded bg-white/10 px-1 font-mono text-slate-300">S</kbd> Split</span>
            <span><kbd className="rounded bg-white/10 px-1 font-mono text-slate-300">Del</kbd> Cut</span>
          </div>
        </div>

        {/* Multi-Cut Filmstrip Timeline Dock */}
        <div className="flex h-44 shrink-0 flex-col justify-between border-t border-white/[0.08] bg-ink-950/95 p-4 z-10">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-semibold text-slate-300">
              Interactive Video Cut Timeline ({segments.length} segment{segments.length !== 1 ? 's' : ''})
            </span>
            <span className="text-[11px] text-slate-500">
              Click playhead to scrub • Click segment to select & cut out
            </span>
          </div>

          {/* Multi-Segment Filmstrip Area */}
          <div
            ref={timelineRef}
            onClick={handleTimelineClick}
            className="relative h-24 w-full cursor-pointer select-none rounded-xl border border-white/10 bg-ink-900/90 overflow-hidden shadow-inner"
          >
            {/* 1. Underlying Filmstrip Thumbnails */}
            <div className="absolute inset-0 flex opacity-25 pointer-events-none">
              {thumbnails.length > 0
                ? thumbnails.map((t, idx) => (
                    <img key={idx} src={t} alt="" className="h-full flex-1 object-cover" />
                  ))
                : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-slate-600 font-mono">
                    Generating Filmstrip...
                  </div>
                )}
            </div>

            {/* 2. Interactive Segments Track */}
            <div className="absolute inset-0 flex">
              {segments.map((seg, idx) => {
                const segDur = seg.end - seg.start
                const widthPct = (segDur / duration) * 100
                const isSelected = selectedSegId === seg.id

                return (
                  <div
                    key={seg.id}
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedSegId(seg.id)
                      if (videoRef.current) {
                        videoRef.current.currentTime = seg.start
                        setCurrentTime(seg.start)
                      }
                    }}
                    style={{ width: `${widthPct}%` }}
                    className={`group relative h-full flex flex-col justify-between p-2 border-r border-white/30 transition-all ${
                      seg.kept
                        ? isSelected
                          ? 'bg-cyan-500/35 border-2 border-cyan-glow shadow-lg'
                          : 'bg-cyan-500/20 hover:bg-cyan-500/30'
                        : isSelected
                          ? 'bg-rose-950/80 border-2 border-rose-500 shadow-lg'
                          : 'bg-rose-950/60 opacity-80 hover:opacity-100'
                    }`}
                  >
                    {/* Top segment label & time */}
                    <div className="flex items-center justify-between text-[10px] font-mono pointer-events-none">
                      <span className={`font-bold ${seg.kept ? 'text-cyan-200' : 'text-rose-300'}`}>
                        #{idx + 1} {seg.kept ? 'KEEP' : 'CUT OUT'}
                      </span>
                      <span className="text-white/60">{(seg.end - seg.start).toFixed(1)}s</span>
                    </div>

                    {/* Middle: Delete / Restore pill */}
                    <div className="flex justify-center items-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleSegmentKeep(seg.id)
                        }}
                        className={`rounded-lg px-2.5 py-1 text-[10px] font-bold shadow-md transition transform active:scale-90 ${
                          seg.kept
                            ? 'bg-rose-600/90 text-white hover:bg-rose-500'
                            : 'bg-emerald-600/90 text-white hover:bg-emerald-500'
                        }`}
                        title={seg.kept ? 'Cut out this section' : 'Keep this section'}
                      >
                        {seg.kept ? '🗑️ Cut Out' : '↩️ Keep'}
                      </button>
                    </div>

                    {/* Bottom timestamps */}
                    <div className="flex items-center justify-between text-[9px] font-mono text-white/40 pointer-events-none">
                      <span>{formatTime(seg.start)}</span>
                      <span>{formatTime(seg.end)}</span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* 3. Sliding Playhead Scrubber */}
            <div
              style={{ left: `${(currentTime / duration) * 100}%` }}
              className="pointer-events-none absolute top-0 bottom-0 z-20 w-1 -translate-x-1/2 bg-cyan-glow shadow-glow shadow-cyan-glow"
            >
              <div className="absolute -top-1.5 left-1/2 h-3.5 w-3.5 -translate-x-1/2 rounded-full border-2 border-white bg-cyan-glow shadow-md" />
            </div>
          </div>
        </div>
      </div>

      {/* Processing Modal Overlay */}
      {processing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-md rounded-2xl border border-white/15 bg-ink-900/95 p-8 text-center shadow-panel">
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-3 border-cyan-glow border-t-transparent" />
            <h3 className="text-base font-bold text-white mb-2">Processing Your Video Cut</h3>
            <p className="text-xs text-slate-300 leading-relaxed mb-4">{processStage}</p>
            <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-cyan-glow to-blue-500 animate-pulse w-3/4" />
            </div>
          </div>
        </div>
      )}

      {/* Download Saved Cut Modal */}
      {savedCutUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="w-full max-w-md rounded-2xl border border-emerald-500/40 bg-ink-900/95 p-6 text-center shadow-panel">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/20 text-2xl border border-emerald-500/40">
              ✅
            </div>
            <h3 className="text-base font-bold text-white mb-1">Cut Video Saved Successfully!</h3>
            <p className="text-xs text-slate-300 mb-6">
              Your video has been trimmed and concatenated to{' '}
              <span className="font-mono font-bold text-cyan-300">{formatTime(totalKeptDuration)}</span>.
            </p>

            <div className="flex flex-col gap-2.5">
              <a
                href={savedCutUrl}
                download={`cut_${project?.original_filename || 'video.mp4'}`}
                className="btn-accent py-2.5 text-xs font-bold text-ink-950 flex items-center justify-center gap-2"
              >
                ⬇️ Download Cut Video (MP4)
              </a>

              <button
                onClick={handleProceedToEdit}
                className="rounded-xl border border-white/15 bg-white/[0.06] py-2.5 text-xs font-bold text-white hover:bg-white/[0.12] transition flex items-center justify-center gap-2"
              >
                ✨ Proceed to Reel Editor With This Cut →
              </button>

              <button
                onClick={() => setSavedCutUrl(null)}
                className="mt-2 text-xs text-slate-400 hover:text-white transition"
              >
                Close & Keep Editing
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

