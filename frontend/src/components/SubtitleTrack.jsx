import { useState } from 'react'
import SubtitleBlock from './SubtitleBlock'
import { formatTime } from '../hooks/useTimeline'

const LANGUAGES = [
  { code: 'auto', label: 'Auto Detect' },
  { code: 'en', label: 'English' },
  { code: 'te', label: 'Telugu (తెలుగు)' },
  { code: 'hi', label: 'Hindi (हिन्दी)' },
  { code: 'ta', label: 'Tamil (தமிழ்)' },
  { code: 'kn', label: 'Kannada (ಕನ್ನಡ)' },
  { code: 'ml', label: 'Malayalam (മലയാളം)' },
  { code: 'mr', label: 'Marathi (मराठी)' },
  { code: 'bn', label: 'Bengali (বাংলা)' },
  { code: 'gu', label: 'Gujarati (ગુજરાતી)' },
  { code: 'pa', label: 'Punjabi (ਪੰਜਾਬੀ)' },
  { code: 'es', label: 'Spanish (Español)' },
  { code: 'fr', label: 'French (Français)' },
  { code: 'de', label: 'German (Deutsch)' },
  { code: 'ar', label: 'Arabic (العربية)' },
  { code: 'ja', label: 'Japanese (日本語)' },
  { code: 'zh', label: 'Chinese (中文)' },
]

const FONT_OPTIONS = [
  { label: 'Inter (Clean)', value: 'Inter' },
  { label: 'Nirmala UI (Telugu / Indic)', value: 'Nirmala UI' },
  { label: 'Arial (Universal)', value: 'Arial' },
  { label: 'Impact (Viral Reel)', value: 'Impact' },
  { label: 'Trebuchet (Bold)', value: 'Trebuchet MS' },
  { label: 'Montserrat (Modern)', value: 'Montserrat' },
  { label: 'Verdana (Crisp)', value: 'Verdana' },
]

const SIZE_OPTIONS = [
  { label: '58px (Small)', value: 58 },
  { label: '72px (Medium)', value: 72 },
  { label: '86px (Large)', value: 86 },
  { label: '100px (Extra Large)', value: 100 },
  { label: '118px (Huge)', value: 118 },
]

const COLOR_OPTIONS = [
  { label: 'White', value: 'FFFFFF', hex: '#FFFFFF' },
  { label: 'Yellow', value: 'FFE600', hex: '#FFE600' },
  { label: 'Cyan', value: '00F0FF', hex: '#00F0FF' },
  { label: 'Lime', value: '00FF66', hex: '#00FF66' },
]

const ACCENT_OPTIONS = [
  { label: 'Viral Red', value: 'E5252A', hex: '#E5252A' },
  { label: 'Neon Yellow', value: 'FFE600', hex: '#FFE600' },
  { label: 'Cyan Glow', value: '00F0FF', hex: '#00F0FF' },
  { label: 'Lime Green', value: '00FF66', hex: '#00FF66' },
]

export default function SubtitleTrack({
  subtitles = [],
  timeline,
  selectedId,
  onSelect,
  onChange,
  onDelete,
  onEdit,
  onAdd,
  loading,
  transcribing,
  onTranscribe,
  onPolish,
  onImportScript,
  subtitleStyle = {
    font: 'Inter',
    size: 58,
    color: 'FFFFFF',
    highlightColor: 'E5252A',
    boxed: false,
    bold: true,
    uppercase: true,
    brandTag: '',
  },
  onStyleChange,
}) {
  const [selectedLang, setSelectedLang] = useState('auto')
  const [translateToEn, setTranslateToEn] = useState(false)
  const [showStyle, setShowStyle] = useState(false)
  const [polishing, setPolishing] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [scriptInput, setScriptInput] = useState('')
  const [importing, setImporting] = useState(false)

  const handlePolish = async () => {
    if (!onPolish) return
    try {
      setPolishing(true)
      await onPolish({ brand_name: style.brandTag })
    } finally {
      setPolishing(false)
    }
  }

  const handleImport = async () => {
    if (!onImportScript || !scriptInput.trim()) return
    try {
      setImporting(true)
      await onImportScript(scriptInput.trim())
      setShowImport(false)
      setScriptInput('')
    } finally {
      setImporting(false)
    }
  }

  const style = {
    font: subtitleStyle?.font || 'Inter',
    size: subtitleStyle?.size || 58,
    color: subtitleStyle?.color || 'FFFFFF',
    highlightColor: subtitleStyle?.highlightColor || 'E5252A',
    boxed: subtitleStyle?.boxed === true,
    bold: subtitleStyle?.bold !== false,
    uppercase: subtitleStyle?.uppercase !== false,
    brandTag: subtitleStyle?.brandTag || '',
  }

  const updateStyle = (patch) => {
    onStyleChange?.({ ...style, ...patch })
  }

  return (
    <div className="border-t border-white/10 px-3 pb-3 pt-2.5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-white/50">Subtitles</h3>
          <span className="rounded bg-white/8 px-1.5 py-0.5 text-[10px] font-semibold text-white/45">
            {subtitles.length} block{subtitles.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <select
            value={selectedLang}
            onChange={(e) => setSelectedLang(e.target.value)}
            disabled={transcribing}
            className="rounded-lg border border-white/12 bg-ink-900/80 px-2 py-1 text-[11px] font-medium text-white/90 outline-none transition focus:border-cyan-glow/70 cursor-pointer"
            title="Select audio language"
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code} className="bg-ink-900 text-white">
                {l.label}
              </option>
            ))}
          </select>

          {selectedLang !== 'en' && (
            <label
              className="flex items-center gap-1 text-[10px] text-white/60 cursor-pointer hover:text-white transition px-1"
              title="Translate into English subtitles"
            >
              <input
                type="checkbox"
                checked={translateToEn}
                onChange={(e) => setTranslateToEn(e.target.checked)}
                disabled={transcribing}
                className="h-3 w-3 accent-cyan-glow rounded"
              />
              To English
            </label>
          )}

          <button
            onClick={() =>
              onTranscribe?.({
                language: selectedLang,
                task: translateToEn ? 'translate' : 'transcribe',
              })
            }
            disabled={transcribing}
            className="btn-accent px-2.5 py-1 text-[11px] flex items-center gap-1.5"
            title="Extract subtitles with chosen language"
          >
            {transcribing ? (
              <>
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-ink-900/30 border-t-ink-900" />
                Transcribing…
              </>
            ) : (
              <>
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z" />
                </svg>
                Extract
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handlePolish}
            disabled={polishing || transcribing || subtitles.length === 0}
            className="btn-ghost px-2.5 py-1 text-[11px] flex items-center gap-1.5 border-purple-500/40 text-purple-300 hover:bg-purple-500/10 transition"
            title="Polish subtitles into punchy marketing copy (Script 2 style)"
          >
            {polishing ? (
              <>
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-purple-400 border-t-transparent" />
                <span>Polishing…</span>
              </>
            ) : (
              <>
                <span>✨</span>
                <span>AI Polish</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setShowImport(true)}
            disabled={transcribing}
            className="btn-ghost px-2 py-1 text-[11px] flex items-center gap-1.5 text-white/80 hover:text-white"
            title="Import custom script or SRT with auto-sync"
          >
            <span>📝</span>
            <span>Import Script</span>
          </button>
          <button
            type="button"
            onClick={() => setShowStyle(!showStyle)}
            className={`btn-ghost px-2.5 py-1 text-[11px] flex items-center gap-1.5 transition ${
              showStyle ? 'border-cyan-glow/60 text-cyan-glow bg-cyan-glow/10' : ''
            }`}
            title="Adjust subtitle font size, style and color"
          >
            <span>🎨</span>
            <span>Font & Style</span>
            <span className="font-mono text-[10px] text-cyan-glow font-bold">
              {style.size}px
            </span>
          </button>
          <button onClick={onAdd} className="btn-ghost px-2 py-1 text-[11px]">
            + Add
          </button>
        </div>
      </div>

      {showStyle && (
        <div className="mb-3 rounded-2xl border border-white/[0.1] bg-ink-950/90 p-4 space-y-3 shadow-panel backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-3">
            <div>
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-300 block">
                Subtitle Typography & Style
              </span>
              <span className="text-[10px] text-slate-500">Live preview of captions across your video</span>
            </div>
            <div
              className={`px-4 py-2 border transition-all ${
                style.boxed ? 'rounded-xl bg-black/90 border-white/20 shadow-lg' : 'bg-transparent border-transparent drop-shadow-md'
              }`}
              style={{
                fontFamily: style.font,
                fontWeight: style.bold ? 800 : 500,
                textTransform: style.uppercase ? 'uppercase' : 'none',
              }}
            >
              <div style={{ color: `#${style.color}` }} className="text-xs tracking-wide">SAMPLE CAPTION LINE</div>
              <div style={{ color: `#${style.highlightColor}` }} className="text-xs font-black tracking-wide">PUNCHY ACCENT LINE</div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">Font Family</label>
              <select
                value={style.font}
                onChange={(e) => updateStyle({ font: e.target.value })}
                className="w-full rounded-xl border border-white/[0.1] bg-ink-900 px-3 py-2 text-white outline-none focus:border-cyan-glow cursor-pointer text-xs"
              >
                {FONT_OPTIONS.map((f) => (
                  <option key={f.value} value={f.value} className="bg-ink-900 text-white">
                    {f.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">Font Size</label>
              <select
                value={style.size}
                onChange={(e) => updateStyle({ size: parseInt(e.target.value, 10) })}
                className="w-full rounded-xl border border-white/[0.1] bg-ink-900 px-3 py-2 text-white outline-none focus:border-cyan-glow cursor-pointer font-mono text-xs"
              >
                {SIZE_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value} className="bg-ink-900 text-white">
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">Accent Highlight</label>
              <div className="flex items-center gap-2 pt-1">
                {ACCENT_OPTIONS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => updateStyle({ highlightColor: c.value })}
                    className={`h-6 w-6 rounded-full border-2 transition-transform duration-150 ${
                      style.highlightColor === c.value
                        ? 'border-white scale-115 shadow-md ring-2 ring-cyan-glow'
                        : 'border-white/30 hover:border-white/70 hover:scale-105'
                    }`}
                    style={{ backgroundColor: c.hex }}
                    title={c.label}
                  />
                ))}
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">Display Mode</label>
              <div className="flex items-center gap-1.5 pt-0.5">
                <button
                  type="button"
                  onClick={() => updateStyle({ boxed: !style.boxed })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    style.boxed
                      ? 'bg-cyan-glow text-ink-950 shadow-sm font-extrabold'
                      : 'bg-white/[0.06] text-slate-300 hover:bg-white/[0.12] border border-white/[0.08]'
                  }`}
                  title="Toggle Boxed Background Pill"
                >
                  {style.boxed ? '⬛ Boxed' : '🔲 Outline'}
                </button>
                <button
                  type="button"
                  onClick={() => updateStyle({ uppercase: !style.uppercase })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    style.uppercase
                      ? 'bg-cyan-glow text-ink-950 shadow-sm font-extrabold'
                      : 'bg-white/[0.06] text-slate-300 hover:bg-white/[0.12] border border-white/[0.08]'
                  }`}
                  title="Toggle UPPERCASE"
                >
                  CAPS
                </button>
              </div>
            </div>
          </div>

          {/* Brand watermark / REC badge */}
          <div className="border-t border-white/10 pt-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
              <label className="text-[11px] font-bold text-white/70">
                Camera REC Brand Badge:
              </label>
            </div>
            <div className="flex items-center gap-2 flex-1 max-w-sm">
              <input
                type="text"
                placeholder="e.g. VAIBHAV VENTURE or VONE DIGITALS"
                value={style.brandTag}
                onChange={(e) => updateStyle({ brandTag: e.target.value })}
                className="w-full rounded-lg border border-white/12 bg-ink-900 px-3 py-1.5 text-xs text-white placeholder-white/25 outline-none focus:border-cyan-glow font-mono uppercase"
              />
            </div>
          </div>
        </div>
      )}

      <div
        className="relative h-[34px] rounded-lg border border-white/10 bg-ink-900/50"
        onClick={(e) => {
          // clicking empty space adds a block there
          if (e.target !== e.currentTarget) return
          const rect = e.currentTarget.getBoundingClientRect()
          onAdd?.(timeline.pxToTime(e.clientX - rect.left))
        }}
      >
        {loading && (
          <div className="absolute inset-0 flex items-center gap-3 px-3">
            <div className="skeleton h-4 w-32 rounded" />
            <div className="skeleton h-4 w-24 rounded" />
            <div className="skeleton h-4 w-40 rounded" />
          </div>
        )}

        {!loading && subtitles.length === 0 && (
          <p className="absolute inset-0 flex items-center justify-center text-[11px] text-white/30">
            No subtitles yet — click “Auto-transcribe” or add a block.
          </p>
        )}

        {subtitles.map((s) => (
          <SubtitleBlock
            key={s.id}
            subtitle={s}
            timeline={timeline}
            selected={selectedId === s.id}
            onSelect={onSelect}
            onChange={onChange}
            onDelete={onDelete}
            onEdit={onEdit}
          />
        ))}

        {/* playhead line */}
        <div
          className="pointer-events-none absolute inset-y-0 z-30 w-px bg-white shadow-[0_0_8px_rgba(255,255,255,0.85)]"
          style={{ left: timeline.timeToPx(timeline.playhead) }}
        />
      </div>

      {/* Subtitles list breakdown */}
      {subtitles.length > 0 && (
        <div className="mt-2 max-h-36 overflow-y-auto scroll-thin rounded-lg border border-white/10 bg-ink-900/40 p-1.5">
          <div className="flex flex-col gap-1">
            {subtitles.map((s) => {
              const isActive =
                timeline.playhead >= s.start_time && timeline.playhead <= s.end_time
              return (
                <div
                  key={s.id}
                  onClick={() => {
                    onSelect?.(s.id)
                    timeline.movePlayhead(s.start_time)
                  }}
                  className={`flex items-center justify-between gap-2 rounded-md px-2.5 py-1 text-xs transition cursor-pointer ${
                    selectedId === s.id
                      ? 'border border-cyan-glow/60 bg-cyan-glow/20 text-white'
                      : isActive
                      ? 'border border-amber-400/50 bg-amber-400/15 text-white'
                      : 'border border-transparent bg-white/5 hover:bg-white/10 text-white/80'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="font-mono text-[10px] text-cyan-glow/90 shrink-0 tabular-nums">
                      {formatTime(s.start_time, { precise: true })} → {formatTime(s.end_time, { precise: true })}
                    </span>
                    <span className="truncate text-xs text-white/90">{s.text}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onEdit?.(s)
                      }}
                      className="rounded p-1 text-white/40 hover:text-white hover:bg-white/10 transition"
                      title="Edit text"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onDelete?.(s.id)
                      }}
                      className="rounded p-1 text-white/40 hover:text-rose-400 hover:bg-white/10 transition"
                      title="Delete subtitle"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
          <div className="w-full max-w-xl rounded-2xl border border-white/20 bg-ink-950 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span>📝</span> Import Custom Script or SRT
                </h3>
                <p className="text-xs text-white/60">
                  Paste your script lines (like Script 2) or SRT. We will map and sync the lines to your video's timeline automatically!
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowImport(false)}
                className="text-white/40 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <textarea
              value={scriptInput}
              onChange={(e) => setScriptInput(e.target.value)}
              placeholder={`Paste your custom script lines or SRT timestamps here...

Example:
There are almost 200 digital marketing companies in Vijayawada. What actually is digital marketing?
Just posting graphics, uploading reels, and shooting videos... is that all?
Real digital marketing means scaling client revenue and growing their business.`}
              className="w-full h-56 rounded-xl border border-white/15 bg-black/60 p-3 text-xs text-white font-mono leading-relaxed outline-none focus:border-cyan-glow focus:ring-1 focus:ring-cyan-glow resize-none"
            />

            <div className="flex items-center justify-between pt-2">
              <span className="text-[11px] text-white/40">
                {scriptInput.split('\n').filter((l) => l.trim()).length} line(s) detected
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowImport(false)}
                  className="btn-ghost px-3 py-1.5 text-xs text-white/70"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={importing || !scriptInput.trim()}
                  className="btn-accent px-4 py-1.5 text-xs flex items-center gap-2 font-semibold"
                >
                  {importing ? 'Syncing…' : '⚡ Sync onto Timeline'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
