import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import client, { apiError, projects, render as renderApi } from '../api/client'
import { useToast } from '../components/ToastProvider'
import { usePolling } from '../hooks/usePolling'

export default function Result() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()

  const [project, setProject] = useState(null)
  const [job, setJob] = useState(location.state?.job || null)
  const [videoBlobUrl, setVideoBlobUrl] = useState('')
  const [videoError, setVideoError] = useState(null)
  const [blobLoading, setBlobLoading] = useState(false)
  const videoRef = useRef(null)

  const { data: jobs } = usePolling(() => renderApi.jobs(projectId), {
    interval: 2000,
    enabled: !!projectId && (!job || job.status !== 'done'),
  })

  useEffect(() => {
    projects
      .get(projectId)
      .then(setProject)
      .catch((err) => toast.error(apiError(err, 'Could not load this project.')))

    renderApi
      .jobs(projectId)
      .then((list) => {
        const doneJob = (list || []).find((j) => j.status === 'done' && j.output_path)
        if (doneJob) {
          setJob(doneJob)
        } else if (list && list[0]) {
          setJob(list[0])
        }
      })
      .catch(() => {})
  }, [projectId, toast])

  const finished = useMemo(() => {
    if (!jobs || !Array.isArray(jobs)) return null
    return jobs.find((j) => j.status === 'done' && j.output_path)
  }, [jobs])

  useEffect(() => {
    if (finished) setJob(finished)
  }, [finished])

  const directStreamUrl = job?.id ? renderApi.videoUrl(job.id) : ''
  const streamUrl = videoBlobUrl || directStreamUrl
  const downloadUrl = job?.id ? renderApi.downloadUrl(job.id) : ''
  const fileName = `${project?.original_filename?.replace(/\.[^.]+$/, '') || 'reel'}_final.mp4`

  const loadBlobFallback = useCallback(async () => {
    if (!job?.id || videoBlobUrl || blobLoading) return
    try {
      setBlobLoading(true)
      const res = await client.get(`/render/${job.id}/video`, {
        responseType: 'blob',
        timeout: 120000,
      })
      const blobUrl = URL.createObjectURL(res.data)
      setVideoBlobUrl(blobUrl)
      setVideoError(null)
    } catch {
      setVideoError('Could not stream the video directly. Please use the Download button below.')
    } finally {
      setBlobLoading(false)
    }
  }, [job?.id, videoBlobUrl, blobLoading])

  const handleVideoError = useCallback(() => {
    if (!videoBlobUrl) {
      loadBlobFallback()
    } else {
      setVideoError('Playback error. You can download the MP4 file to play it locally.')
    }
  }, [videoBlobUrl, loadBlobFallback])

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      toast.success('Link copied to clipboard.')
    } catch {
      toast.error('Could not copy link.')
    }
  }, [toast])

  return (
    <div className="min-h-screen bg-app-gradient text-slate-100">
      {/* ambient lighting */}
      <div className="pointer-events-none absolute -left-20 top-0 h-96 w-96 rounded-full bg-cyan-glow/10 blur-[120px]" />
      <div className="pointer-events-none absolute right-0 top-1/4 h-96 w-96 rounded-full bg-indigo-500/10 blur-[120px]" />

      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-white/[0.08] bg-ink-950/80 px-6 py-4 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/editor/${projectId}`)}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.06] text-white border border-white/[0.1] transition-all hover:bg-white/[0.12] hover:scale-105 active:scale-95"
            title="Back to Studio Editor"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" viewBox="0 0 24 24">
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-extrabold text-white">Render Complete</h1>
              <span className="rounded-md bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-400">
                Ready to Post
              </span>
            </div>
            <p className="text-[11px] text-slate-400 truncate max-w-sm">
              {project?.original_filename || 'Finished video'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button className="btn-ghost py-1.5 px-3 text-xs" onClick={copyLink}>
            Share Link
          </button>
          <button
            onClick={() => navigate(`/editor/${projectId}`)}
            className="btn-accent py-1.5 px-3.5 text-xs font-bold"
          >
            Open in Editor
          </button>
        </div>
      </header>

      <main className="relative mx-auto flex max-w-5xl flex-col items-center gap-10 px-4 py-10 lg:flex-row lg:items-start">
        {/* video player container */}
        <div className="w-full max-w-[340px] shrink-0">
          <div className="relative overflow-hidden rounded-2xl border border-white/[0.12] bg-black shadow-panel group">
            {streamUrl ? (
              <div className="relative aspect-[9/16] w-full">
                <video
                  ref={videoRef}
                  key={streamUrl}
                  src={streamUrl}
                  controls
                  autoPlay
                  playsInline
                  onError={handleVideoError}
                  className="h-full w-full object-cover"
                />
              </div>
            ) : (
              <div className="flex aspect-[9/16] w-full flex-col items-center justify-center p-6 text-center">
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-glow border-t-transparent" />
                <p className="mt-4 text-xs font-bold text-slate-300">Preparing preview…</p>
              </div>
            )}
          </div>

          {videoError && (
            <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
              {videoError}
            </div>
          )}
        </div>

        {/* details & export actions */}
        <div className="flex-1 space-y-6 w-full">
          <div>
            <h2 className="text-2xl font-black text-white sm:text-3xl">
              Your Viral Reel is Ready!
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Kinetic typography, custom styling, and audio-synchronized subtitles have been rendered.
            </p>
          </div>

          {downloadUrl && (
            <div className="panel p-6 border-cyan-glow/30 bg-gradient-to-br from-ink-900/90 to-cyan-950/20">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <p className="text-base font-extrabold text-white">Download High-Quality MP4</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    1080×1920 Full HD · Optimized for Instagram, TikTok & YouTube Shorts
                  </p>
                </div>
                <a
                  href={downloadUrl}
                  download={fileName}
                  className="btn-primary py-3 px-6 text-sm font-bold text-center self-start sm:self-auto shrink-0"
                >
                  Download Reel (.mp4)
                </a>
              </div>
            </div>
          )}

          {job && (
            <div className="panel p-6">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 mb-4">
                Render Specifications
              </h3>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-6 text-xs">
                {[
                  ['Source File', project?.original_filename],
                  ['Format', '9:16 Vertical Reel'],
                  ['Resolution', `${project?.width || 1080}×${project?.height || 1920}`],
                  ['Duration', `${project?.duration?.toFixed(1) || '—'}s`],
                  ['Subtitles', project?.burn_subtitles ? 'Burned-in' : 'Off'],
                  ['Render Status', job.status === 'done' ? 'Completed Successfully' : job.status],
                  ['Completed', job.finished_at ? new Date(job.finished_at).toLocaleTimeString() : 'Just now'],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between border-b border-white/[0.04] pb-2">
                    <dt className="text-slate-400">{k}</dt>
                    <dd className="font-semibold text-slate-200 truncate max-w-[180px]">{String(v ?? '—')}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={() => navigate('/upload')}
              className="btn-ghost py-2.5 px-4 text-xs font-semibold"
            >
              ← Back to My Projects
            </button>
            <button
              onClick={() => navigate(`/editor/${projectId}`)}
              className="btn-ghost py-2.5 px-4 text-xs font-semibold"
            >
              Re-edit Video
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
