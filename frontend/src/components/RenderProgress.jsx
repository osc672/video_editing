const STAGES = {
  queued: { label: 'Queued', hint: 'Waiting for a render slot.' },
  trim: { label: 'Trimming', hint: 'Cutting your selected range.' },
  plan: { label: 'Building plan', hint: 'Shifting effects into the trimmed clip.' },
  check: { label: 'Check frames', hint: 'Rendering a test frame of every effect.' },
  render: { label: 'Rendering effects', hint: 'The engine is compositing your reel.' },
  subtitles: { label: 'Burning subtitles', hint: 'Adding the caption track.' },
  done: { label: 'Finished', hint: 'Your MP4 is ready to download.' },
  error: { label: 'Failed', hint: 'Something went wrong.' },
}

export default function RenderProgress({ job, onCancel }) {
  if (!job) return null

  const stage = STAGES[job.stage] || STAGES.queued
  const failed = job.status === 'failed'
  const done = job.status === 'done'
  const progress = job.progress ?? 0

  return (
    <div className="panel p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-white">
            {done ? 'Your reel is ready' : failed ? 'Render failed' : stage.label}
          </h3>
          <p className="mt-1 text-xs text-white/45">
            {failed ? job.error || 'Unknown error.' : stage.hint}
          </p>
        </div>
        <span className="font-mono text-2xl font-black tabular-nums text-cyan-glow">
          {progress}%
        </span>
      </div>

      <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            failed ? 'bg-rose-500' : 'bg-gradient-to-r from-cyan-glow to-sky-300'
          }`}
          style={{ width: `${Math.min(100, progress)}%` }}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-white/40">
        <span>
          Stage: <span className="font-semibold text-white/70">{stage.label}</span>
          {job.status === 'queued' && job.queue_position > 0 && (
            <span> · queue position {job.queue_position}</span>
          )}
        </span>
        <span>Keep this tab open — the render runs on the server.</span>
      </div>

      {failed && job.error && (
        <pre className="scroll-thin mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-rose-400/25 bg-rose-950/40 p-3 text-[10px] leading-relaxed text-rose-100/80">
          {job.error}
        </pre>
      )}
    </div>
  )
}
