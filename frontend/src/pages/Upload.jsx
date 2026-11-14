import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth, clearSession, getUser, projects, setSession, getToken, apiError } from '../api/client'
import { useToast } from '../components/ToastProvider'

const MAX_MB = 600
const ACCEPT = '.mp4,.mov,.m4v,.webm,.mkv'

export default function Upload() {
  const [user, setUser] = useState(getUser())
  const [dragging, setDragging] = useState(false)
  const [progress, setProgress] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [projectList, setProjectList] = useState([])
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const [studioMode, setStudioMode] = useState('cut') // 'cut' | 'edit'
  const [projectFilter, setProjectFilter] = useState('all') // 'all' | 'cuts' | 'reels'
  const [deletingId, setDeletingId] = useState(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const inputRef = useRef(null)
  const toast = useToast()
  const navigate = useNavigate()

  const loadProjects = useCallback(async () => {
    try {
      setLoadingProjects(true)
      const list = await projects.list()
      setProjectList(list || [])
      if (!list || list.length === 0) {
        setShowUpload(true)
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingProjects(false)
    }
  }, [])

  useEffect(() => {
    auth
      .me()
      .then((u) => {
        if (u?.token && !getToken()) {
          setSession(u.token, u)
        }
        setUser(u)
      })
      .catch(() => {})
    loadProjects()
  }, [loadProjects])

  const handleFile = useCallback(
    async (file) => {
      if (!file) return
      setError('')
      const ext = file.name.split('.').pop()?.toLowerCase()
      if (!ACCEPT.includes(`.${ext}`)) {
        setError('Please upload an MP4 or MOV file.')
        toast.error('Unsupported file type. Use MP4 or MOV.')
        return
      }
      if (file.size > MAX_MB * 1024 * 1024) {
        setError(`File is ${(file.size / 1024 / 1024).toFixed(0)} MB. Limit is ${MAX_MB} MB.`)
        toast.error(`File exceeds maximum limit of ${MAX_MB} MB.`)
        return
      }

      setBusy(true)
      setProgress(0)
      try {
        const project = await projects.upload(file, setProgress)
        if (studioMode === 'cut') {
          toast.success('Upload complete! Opening Video Cut Studio...')
          navigate(`/cut/${project.id}`)
        } else {
          toast.success('Upload complete! Opening Reel Editor...')
          navigate(`/editor/${project.id}`)
        }
      } catch (err) {
        const message = apiError(err, 'Upload failed.')
        setError(message)
        toast.error(message)
        setBusy(false)
        setProgress(0)
      }
    },
    [navigate, toast, studioMode],
  )

  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer.files?.[0])
  }

  const executeDelete = async (projectId, e) => {
    if (e) {
      e.stopPropagation()
      e.preventDefault()
    }
    setDeletingId(projectId)
    try {
      await projects.delete(projectId)
      toast.success('Project deleted.')
      setProjectList((prev) => prev.filter((p) => p.id !== projectId))
      setConfirmDeleteId(null)
      if (projectList.length <= 1) {
        setShowUpload(true)
      }
    } catch (err) {
      const msg = apiError(err, 'Could not delete project.')
      toast.error(msg)
    } finally {
      setDeletingId(null)
    }
  }

  const signOut = () => {
    clearSession()
    navigate('/login')
  }

  const filteredProjects = projectList.filter((p) => {
    if (projectFilter === 'cuts') return p.status === 'cut_saved'
    if (projectFilter === 'reels') return p.has_render
    return true
  })

  return (
    <div className="min-h-screen bg-app-gradient text-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-ink-950/80 px-6 py-3.5 backdrop-blur-xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-glow to-blue-500 text-ink-950 shadow-glow shadow-cyan-glow/20">
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current ml-0.5">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
          <div>
            <span className="text-sm font-extrabold tracking-tight text-white block leading-tight">
              AI Video Suite
            </span>
            <span className="text-[10px] text-slate-400 font-medium">
              Multi-Cut & 51-Effect Reel Studio
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {projectList.length > 0 && !showUpload && (
            <button
              onClick={() => setShowUpload(true)}
              className="btn-accent py-1.5 px-4 text-xs font-bold text-ink-950 shadow-glow shadow-cyan-glow/20 flex items-center gap-1.5"
            >
              <span>+</span> Create New Video
            </button>
          )}

          {projectList.length > 0 && showUpload && (
            <button
              onClick={() => setShowUpload(false)}
              className="btn-ghost py-1.5 px-3 text-xs font-semibold"
            >
              ← My Projects ({projectList.length})
            </button>
          )}

          {user && (
            <div className="hidden sm:flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] py-1 px-3 text-xs">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-sm" />
              <span className="font-semibold text-slate-200">{user.name}</span>
            </div>
          )}

          <button
            onClick={signOut}
            className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-slate-400 transition hover:bg-white/[0.08] hover:text-white"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-6 md:p-10 max-w-7xl mx-auto w-full">
        {/* VIEW 1: SAVED PROJECTS & LIBRARY */}
        {!showUpload && projectList.length > 0 && (
          <div>
            {/* Library Header & Filters */}
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.06] pb-5">
              <div>
                <h2 className="text-2xl font-black text-white">Your Video Projects</h2>
                <p className="text-xs text-slate-400 mt-1">
                  Cut, edit, or continue working on any of your saved videos.
                </p>
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center gap-2 rounded-xl bg-ink-900/90 border border-white/10 p-1 text-xs">
                {[
                  { id: 'all', label: 'All Projects', count: projectList.length },
                  { id: 'cuts', label: '✂️ Cut Clips', count: projectList.filter((p) => p.status === 'cut_saved').length },
                  { id: 'reels', label: '🎬 Finished Reels', count: projectList.filter((p) => p.has_render).length },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setProjectFilter(tab.id)}
                    className={`rounded-lg px-3 py-1.5 font-bold transition flex items-center gap-1.5 ${
                      projectFilter === tab.id
                        ? 'bg-cyan-glow/20 text-cyan-200 border border-cyan-glow/40 shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span className="text-[10px] rounded-full bg-white/10 px-1.5 py-0.2 text-white/70">
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {loadingProjects ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="aspect-[9/16] animate-pulse rounded-2xl bg-white/[0.03] border border-white/[0.06]" />
                ))}
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="panel p-12 text-center my-8">
                <span className="text-3xl mb-3 block">🎬</span>
                <h3 className="text-base font-bold text-white mb-1">No videos found in this view</h3>
                <p className="text-xs text-slate-400 mb-6">Create a new video cut or reel to see it here.</p>
                <button
                  onClick={() => setShowUpload(true)}
                  className="btn-accent py-2 px-5 text-xs font-bold text-ink-950 inline-flex items-center gap-2"
                >
                  + Create New Video
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                {filteredProjects.map((p) => {
                  const createdDate = p.created_at
                    ? new Date(p.created_at).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    : ''

                  const isCutClip = p.status === 'cut_saved'

                  return (
                    <div
                      key={p.id}
                      className="panel-glass group relative flex flex-col justify-between overflow-hidden p-3.5 transition-all duration-200 hover:border-cyan-glow/40 hover:shadow-glow"
                    >
                      {/* Video Thumbnail Container */}
                      <div className="relative aspect-[9/16] w-full overflow-hidden rounded-xl bg-ink-950/80 border border-white/[0.06] flex items-center justify-center">
                        {p.thumbnail_url ? (
                          <img
                            src={p.thumbnail_url}
                            alt=""
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                        ) : (
                          <div className="flex flex-col items-center gap-1.5 text-slate-500">
                            <span className="text-2xl">📹</span>
                            <span className="text-[10px] font-mono">No Preview</span>
                          </div>
                        )}

                        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-transparent to-transparent opacity-80 pointer-events-none" />

                        {/* Duration badge */}
                        {p.duration > 0 && (
                          <span className="absolute bottom-2 left-2 rounded-md bg-ink-950/90 border border-white/[0.1] px-2 py-0.5 font-mono text-[10px] font-bold text-white pointer-events-none">
                            {p.duration.toFixed(1)}s
                          </span>
                        )}

                        {/* Status badge */}
                        <div className="absolute top-2 left-2 pointer-events-none flex flex-col gap-1">
                          {isCutClip && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-cyan-500/90 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-ink-950 shadow-md">
                              ✂️ Cut Video
                            </span>
                          )}
                          {p.has_render && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/90 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-ink-950 shadow-md">
                              ✓ Rendered
                            </span>
                          )}
                        </div>

                        {/* Delete button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            e.preventDefault()
                            setConfirmDeleteId(p.id)
                          }}
                          className="absolute top-2 right-2 z-30 flex h-7 w-7 items-center justify-center rounded-lg bg-ink-950/80 text-slate-400 hover:bg-rose-600 hover:text-white transition backdrop-blur-md cursor-pointer border border-white/[0.08]"
                          title="Delete Project"
                        >
                          <svg className="h-3.5 w-3.5 pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      </div>

                      {/* Info & Action Buttons */}
                      <div className="mt-3 flex flex-col flex-1 justify-between">
                        <div>
                          <p className="truncate text-xs font-bold text-white" title={p.original_filename}>
                            {p.original_filename}
                          </p>
                          <p className="mt-0.5 text-[10px] text-slate-500">{createdDate}</p>
                        </div>

                        {confirmDeleteId === p.id ? (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="mt-3 rounded-xl border border-rose-500/50 bg-rose-950/90 p-2.5 text-center shadow-lg"
                          >
                            <p className="text-[11px] font-bold text-rose-200 mb-1">Delete project?</p>
                            <div className="flex items-center gap-1.5 justify-center mt-2">
                              <button
                                type="button"
                                disabled={deletingId === p.id}
                                onClick={(e) => executeDelete(p.id, e)}
                                className="rounded-lg bg-rose-600 px-3 py-1 text-[10px] font-bold text-white hover:bg-rose-500 transition disabled:opacity-50"
                              >
                                {deletingId === p.id ? 'Deleting…' : 'Delete'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="rounded-lg bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-slate-300 hover:bg-white/20 transition"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-3 flex flex-col gap-1.5 pt-2 border-t border-white/[0.06]">
                            <div className="flex items-center gap-1.5">
                              {/* 1. Open in Video Cut Studio */}
                              <button
                                type="button"
                                onClick={() => navigate(`/cut/${p.id}`)}
                                className="flex-1 rounded-lg border border-cyan-glow/30 bg-cyan-glow/10 py-1.5 text-[11px] font-bold text-cyan-200 hover:bg-cyan-glow/20 transition flex items-center justify-center gap-1"
                                title="Trim, split, or remove middle sections"
                              >
                                <span>✂️</span> Cut
                              </button>

                              {/* 2. Open in Reel Editor */}
                              <button
                                type="button"
                                onClick={() => navigate(`/editor/${p.id}`)}
                                className="flex-1 rounded-lg border border-blue-500/30 bg-blue-500/10 py-1.5 text-[11px] font-bold text-blue-200 hover:bg-blue-500/20 transition flex items-center justify-center gap-1"
                                title="Apply templates, subtitles, and effects"
                              >
                                <span>🎬</span> Edit
                              </button>
                            </div>

                            {/* View Result button if rendered */}
                            {p.has_render && (
                              <button
                                type="button"
                                onClick={() => navigate(`/result/${p.id}`)}
                                className="btn-accent w-full py-1.5 text-[10px] font-bold flex items-center justify-center gap-1"
                              >
                                <span>✓</span> View Final Export
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* VIEW 2: NEW VIDEO STUDIO CHOICE & UPLOAD */}
        {(showUpload || projectList.length === 0) && (
          <div className="flex flex-col items-center">
            {projectList.length > 0 && (
              <div className="mb-6 w-full max-w-3xl flex justify-start">
                <button
                  onClick={() => setShowUpload(false)}
                  className="btn-ghost px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5"
                >
                  <span>←</span>
                  <span>Back to My Projects</span>
                </button>
              </div>
            )}

            <div className="mb-8 max-w-2xl text-center">
              <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
                Choose Studio Mode
              </h1>
              <p className="mx-auto mt-2 max-w-xl text-xs sm:text-sm text-slate-400">
                Select whether you want to slice and remove middle sections first, or jump directly into 51-effect reel styling.
              </p>
            </div>

            {/* 2 Interactive Studio Choice Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-3xl mb-8">
              {/* Option 1: Video Cut Studio */}
              <div
                onClick={() => setStudioMode('cut')}
                className={`panel-glass relative p-5 cursor-pointer rounded-2xl transition-all duration-200 flex flex-col justify-between ${
                  studioMode === 'cut'
                    ? 'border-cyan-glow bg-cyan-glow/[0.08] shadow-glow shadow-cyan-glow/20 ring-2 ring-cyan-glow/50'
                    : 'hover:border-white/20 hover:bg-white/[0.04]'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-glow to-blue-500 text-ink-950 font-black text-lg shadow-md">
                      ✂️
                    </div>
                    {studioMode === 'cut' && (
                      <span className="rounded-full bg-cyan-glow px-2.5 py-0.5 text-[10px] font-black uppercase text-ink-950 shadow-sm">
                        Selected Mode
                      </span>
                    )}
                  </div>
                  <h3 className="text-base font-extrabold text-white mb-1">Option 1: Video Cut Studio</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Cut out unwanted middle portions, pauses, and mistakes with precision. Save the cut video or proceed to full edit.
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-white/[0.06] flex flex-wrap gap-1.5 text-[10px]">
                  <span className="rounded bg-white/5 border border-white/10 px-2 py-0.5 text-cyan-200">✂️ Split at playhead</span>
                  <span className="rounded bg-white/5 border border-white/10 px-2 py-0.5 text-cyan-200">🗑️ Delete middle sections</span>
                  <span className="rounded bg-white/5 border border-white/10 px-2 py-0.5 text-cyan-200">💾 Save cut clip</span>
                </div>
              </div>

              {/* Option 2: Direct Video Edit */}
              <div
                onClick={() => setStudioMode('edit')}
                className={`panel-glass relative p-5 cursor-pointer rounded-2xl transition-all duration-200 flex flex-col justify-between ${
                  studioMode === 'edit'
                    ? 'border-cyan-glow bg-cyan-glow/[0.08] shadow-glow shadow-cyan-glow/20 ring-2 ring-cyan-glow/50'
                    : 'hover:border-white/20 hover:bg-white/[0.04]'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-tr from-fuchsia-400 to-indigo-500 text-white font-black text-lg shadow-md">
                      🎬
                    </div>
                    {studioMode === 'edit' && (
                      <span className="rounded-full bg-cyan-glow px-2.5 py-0.5 text-[10px] font-black uppercase text-ink-950 shadow-sm">
                        Selected Mode
                      </span>
                    )}
                  </div>
                  <h3 className="text-base font-extrabold text-white mb-1">Option 2: Direct Video Edit</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Jump straight into full reel production: automatically transcribe subtitles, stack 51 templates, kinetic text, and export.
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-white/[0.06] flex flex-wrap gap-1.5 text-[10px]">
                  <span className="rounded bg-white/5 border border-white/10 px-2 py-0.5 text-blue-200">✨ 51 effect templates</span>
                  <span className="rounded bg-white/5 border border-white/10 px-2 py-0.5 text-blue-200">💬 Auto speech captions</span>
                  <span className="rounded bg-white/5 border border-white/10 px-2 py-0.5 text-blue-200">🔥 Kinetic typography</span>
                </div>
              </div>
            </div>

            {/* Drag & Drop Upload Zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => !busy && inputRef.current?.click()}
              className={`panel-glass group relative w-full max-w-3xl cursor-pointer overflow-hidden p-10 text-center transition-all duration-300 sm:p-14 ${
                dragging
                  ? 'border-cyan-glow/80 shadow-glow bg-cyan-glow/[0.04]'
                  : 'hover:border-cyan-glow/40 hover:bg-white/[0.04]'
              }`}
            >
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => {
                  handleFile(e.target.files?.[0])
                  e.target.value = ''
                }}
              />

              {busy ? (
                <div className="py-4">
                  <div className="mx-auto mb-4 h-16 w-16 animate-pulse rounded-2xl bg-cyan-glow/15 p-3 flex items-center justify-center">
                    <svg className="h-8 w-8 text-cyan-glow animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                  </div>
                  <p className="text-lg font-extrabold text-white">Uploading Video… {progress}%</p>
                  <div className="mx-auto mt-4 h-2 w-full max-w-md overflow-hidden rounded-full bg-white/[0.08]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-glow to-blue-500 transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="mt-3 text-xs text-slate-400">
                    {studioMode === 'cut' ? 'Preparing timeline for video cut...' : 'Extracting audio and keyframes for reel editor...'}
                  </p>
                </div>
              ) : (
                <>
                  <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/[0.1] bg-white/[0.04] text-cyan-glow transition-all duration-200 group-hover:scale-110 group-hover:border-cyan-glow/40">
                    <svg className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="M12 16V4m0 0L7 9m5-5l5 5" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" />
                    </svg>
                  </div>
                  <p className="text-xl font-bold text-white">
                    {dragging
                      ? 'Drop video to begin'
                      : studioMode === 'cut'
                        ? 'Drop video to open Video Cut Studio'
                        : 'Drop video to open Direct Reel Editor'}
                  </p>
                  <p className="mt-1 text-sm text-slate-400">
                    or <span className="font-semibold text-cyan-glow underline underline-offset-2">browse your files</span>
                  </p>
                  <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-[10px] text-slate-400">
                    <span className="rounded-md border border-white/[0.08] bg-white/[0.02] px-2.5 py-1 font-mono">MP4 / MOV / WEBM</span>
                    <span className="rounded-md border border-white/[0.08] bg-white/[0.02] px-2.5 py-1 font-mono">Max 600 MB</span>
                    <span className="rounded-md border border-white/[0.08] bg-white/[0.02] px-2.5 py-1 font-mono">9:16 Vertical or 16:9</span>
                  </div>
                </>
              )}
            </div>

            {error && (
              <div className="mt-4 w-full max-w-3xl rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">
                {error}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
