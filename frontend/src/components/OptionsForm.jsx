import { useEffect, useMemo, useState } from 'react'
import ImageUploader from './ImageUploader'

function defaultsFor(template) {
  const out = {}
  for (const opt of template?.options_json || []) {
    out[opt.key] = opt.default ?? ''
  }
  return out
}

function ListEditor({ option, value, onChange }) {
  const rows = useMemo(
    () => (value ? String(value).split('|') : ['']),
    [value],
  )

  const update = (index, next) => {
    const copy = [...rows]
    copy[index] = next
    onChange(copy.filter((r, i) => r !== '' || copy.length === 1).join('|'))
  }

  return (
    <div className="space-y-1.5">
      {rows.map((row, index) => (
        <div key={index} className="flex items-center gap-1.5">
          <input
            className="field flex-1"
            value={row}
            placeholder={`${option.label} ${index + 1}`}
            onChange={(e) => update(index, e.target.value)}
          />
          {rows.length > 1 && (
            <button
              type="button"
              onClick={() => onChange(rows.filter((_, i) => i !== index).join('|'))}
              className="btn h-9 w-9 shrink-0 border border-white/12 bg-white/5 px-0 text-white/50 hover:border-rose-400/40 hover:text-rose-300"
              title="Remove row"
            >
              −
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...rows, ''].join('|'))}
        className="btn-ghost w-full py-1.5 text-xs"
      >
        + Add row
      </button>
      <p className="text-[10px] text-white/35">
        Each row becomes one line. Use <code className="text-cyan-glow">::</code> inside a row for a
        secondary value (e.g. <code>step::detail</code>).
      </p>
    </div>
  )
}

function extractSpokenKeyword(subtitles, targetTime, fallback = '') {
  if (!subtitles || subtitles.length === 0) return fallback
  let cue = subtitles.find((s) => targetTime >= s.start_time && targetTime <= s.end_time)
  if (!cue) {
    cue = [...subtitles].sort(
      (a, b) => Math.abs(a.start_time - targetTime) - Math.abs(b.start_time - targetTime),
    )[0]
  }
  if (!cue || !cue.text) return fallback
  const clean = cue.text.trim().replace(/[.,!?:;"'()\-]/g, '')
  const stopwords = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'to', 'in', 'on', 'at',
    'by', 'for', 'with', 'about', 'of', 'we', 'you', 'i', 'he', 'she', 'it', 'they', 'this',
    'that', 'now', 'going', 'so', 'if', 'as', 'do', 'does', 'did', 'have', 'has', 'had',
  ])
  const words = clean.split(/\s+/).filter(Boolean)
  const keywords = words.filter((w) => !stopwords.has(w.toLowerCase()))
  if (keywords.length > 0) return keywords.slice(0, 3).join(' ').toUpperCase()
  return words.slice(0, 3).join(' ').toUpperCase() || fallback
}

export default function OptionsForm({
  template,
  values,
  onChange,
  images,
  onImagesChanged,
  selectedEffect,
  onTimingChange,
  timelineDuration,
  subtitles,
  playhead,
}) {
  const merged = useMemo(() => {
    const defs = defaultsFor(template)
    return { ...defs, ...(values || {}) }
  }, [template, values])

  const [local, setLocal] = useState(merged)

  useEffect(() => {
    setLocal(merged)
  }, [merged])

  const targetTime = selectedEffect ? selectedEffect.start_time : playhead || 0.0
  const spokenKeyword = useMemo(() => extractSpokenKeyword(subtitles, targetTime), [subtitles, targetTime])

  if (!template) {
    return (
      <div className="px-4 py-10 text-center">
        <p className="text-sm font-semibold text-white/60">No template selected</p>
        <p className="mt-1 text-xs text-white/35">Pick an effect from the gallery or timeline to edit its options.</p>
      </div>
    )
  }

  const options = template.options_json || []
  const setValue = (key, value) => {
    const next = { ...local, [key]: value }
    setLocal(next)
    onChange?.(next)
  }

  const effectLen = selectedEffect
    ? Math.max(0.1, selectedEffect.end_time - selectedEffect.start_time)
    : 3.0

  return (
    <div className="space-y-4 p-4">
      <div>
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-cyan-glow/15 px-1.5 py-0.5 text-[11px] font-black text-cyan-glow">
            #{String(template.number).padStart(2, '0')}
          </span>
          <h3 className="text-sm font-bold text-white">{template.name}</h3>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-white/45">{template.description}</p>
      </div>

      {selectedEffect && (
        <div className="rounded-xl border border-white/12 bg-white/[0.04] p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-white/50">
              Duration & Timing
            </span>
            <span className="font-mono text-xs font-bold text-cyan-glow">
              {effectLen.toFixed(1)}s
            </span>
          </div>

          {/* Quick presets */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] text-white/40 mr-0.5">Presets:</span>
            {[2, 3, 4, 5, 6, 8].map((sec) => (
              <button
                key={sec}
                type="button"
                onClick={() => {
                  const maxDuration = timelineDuration || 9999
                  const newEnd = Math.min(
                    maxDuration,
                    Math.round((selectedEffect.start_time + sec) * 10) / 10,
                  )
                  onTimingChange?.({ start_time: selectedEffect.start_time, end_time: newEnd })
                }}
                className={`rounded-md px-2 py-0.5 text-xs font-bold transition ${
                  Math.abs(effectLen - sec) < 0.15
                    ? 'bg-cyan-glow text-ink-900 shadow-sm'
                    : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
                }`}
              >
                {sec}s
              </button>
            ))}
          </div>

          {/* Precision inputs */}
          <div className="grid grid-cols-3 gap-2 pt-1 text-xs">
            <div>
              <label className="text-[10px] text-white/40 block mb-1">Start (s)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={Number.isFinite(Number(selectedEffect.start_time)) ? selectedEffect.start_time : 0}
                onChange={(e) => {
                  const raw = parseFloat(e.target.value)
                  if (isNaN(raw)) return
                  const val = Math.max(0, raw)
                  const curEnd = Number.isFinite(Number(selectedEffect.end_time))
                    ? Number(selectedEffect.end_time)
                    : val + 3
                  const len = Math.max(0.5, curEnd - val)
                  onTimingChange?.({ start_time: val, end_time: Math.round((val + len) * 10) / 10 })
                }}
                className="w-full rounded-lg border border-white/12 bg-ink-900/60 px-2 py-1 font-mono text-white outline-none focus:border-cyan-glow"
              />
            </div>
            <div>
              <label className="text-[10px] text-white/40 block mb-1">End (s)</label>
              <input
                type="number"
                step="0.1"
                min="0.5"
                value={Number.isFinite(Number(selectedEffect.end_time)) ? selectedEffect.end_time : 3}
                onChange={(e) => {
                  const raw = parseFloat(e.target.value)
                  if (isNaN(raw)) return
                  const curStart = Number.isFinite(Number(selectedEffect.start_time))
                    ? Number(selectedEffect.start_time)
                    : 0
                  const val = Math.max(curStart + 0.5, raw)
                  onTimingChange?.({ start_time: curStart, end_time: Math.round(val * 10) / 10 })
                }}
                className="w-full rounded-lg border border-white/12 bg-ink-900/60 px-2 py-1 font-mono text-white outline-none focus:border-cyan-glow"
              />
            </div>
            <div>
              <label className="text-[10px] text-white/40 block mb-1">Duration (s)</label>
              <input
                type="number"
                step="0.5"
                min="0.5"
                value={Math.round(effectLen * 10) / 10}
                onChange={(e) => {
                  const raw = parseFloat(e.target.value)
                  if (isNaN(raw)) return
                  const dur = Math.max(0.5, raw)
                  const curStart = Number.isFinite(Number(selectedEffect.start_time))
                    ? Number(selectedEffect.start_time)
                    : 0
                  onTimingChange?.({
                    start_time: curStart,
                    end_time: Math.round((curStart + dur) * 10) / 10,
                  })
                }}
                className="w-full rounded-lg border border-white/12 bg-ink-900/60 px-2 py-1 font-mono text-white outline-none focus:border-cyan-glow"
              />
            </div>
          </div>
        </div>
      )}

      {options.length === 0 && (
        <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-4 text-center text-xs text-white/45">
          This effect has no options — it works on its own.
        </div>
      )}

      {options.map((option) => {
        const value = local[option.key] ?? ''

        if (option.type === 'images') {
          return (
            <div key={option.key}>
              <span className="label">{option.label}</span>
              <ImageUploader images={images} onChanged={onImagesChanged} />
              <p className="mt-2 text-[11px] text-white/40">
                Add at least 3 images. They become the reel covers, boards or cards in this effect.
              </p>
            </div>
          )
        }

        if (option.type === 'list') {
          return (
            <div key={option.key}>
              <span className="label">{option.label}</span>
              <ListEditor option={option} value={value} onChange={(v) => setValue(option.key, v)} />
            </div>
          )
        }

        if (option.type === 'color') {
          return (
            <div key={option.key}>
              <span className="label">{option.label}</span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  className="h-9 w-12 cursor-pointer rounded-lg border border-white/12 bg-ink-900 p-1"
                  value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#ffffff'}
                  onChange={(e) => setValue(option.key, e.target.value)}
                />
                <input
                  className="field flex-1 font-mono text-xs"
                  value={value}
                  onChange={(e) => setValue(option.key, e.target.value)}
                  placeholder="#FF3B30"
                />
              </div>
            </div>
          )
        }

        if (option.type === 'number') {
          return (
            <div key={option.key}>
              <span className="label">{option.label}</span>
              <input
                type="number"
                step="0.01"
                className="field"
                value={value}
                onChange={(e) => setValue(option.key, e.target.value)}
              />
            </div>
          )
        }

        if (option.type === 'bool') {
          const isChecked = value === true || String(value).toLowerCase() === 'true'
          return (
            <div
              key={option.key}
              onClick={() => setValue(option.key, !isChecked)}
              className="flex items-center justify-between rounded-xl border border-white/12 bg-white/[0.04] p-3 cursor-pointer hover:border-white/20 transition"
            >
              <div>
                <span className="text-xs font-bold text-white block">{option.label}</span>
                <span className="text-[10px] text-white/40 block">Toggle this option</span>
              </div>
              <input
                type="checkbox"
                checked={isChecked}
                onChange={(e) => setValue(option.key, e.target.checked)}
                className="h-4 w-4 accent-cyan-glow cursor-pointer"
              />
            </div>
          )
        }

        if (option.type === 'enum') {
          return (
            <div key={option.key}>
              <span className="label">{option.label}</span>
              <div className="flex flex-wrap gap-1.5">
                {(option.enum_values || []).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setValue(option.key, v)}
                    className={`chip capitalize ${value === v ? 'chip-active' : ''}`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          )
        }

        return (
          <div key={option.key}>
            <div className="flex items-center justify-between mb-1">
              <span className="label mb-0">{option.label}</span>
              {spokenKeyword && (
                <button
                  type="button"
                  onClick={() => {
                    const fill = option.key === 'tag' ? `REC · ${spokenKeyword}` : spokenKeyword
                    setValue(option.key, fill)
                  }}
                  className="text-[10px] text-cyan-glow hover:underline flex items-center gap-1 font-semibold"
                  title="Auto-fill with extracted speech from subtitles"
                >
                  <span>✨ Auto-fill speech</span>
                </button>
              )}
            </div>
            <input
              className="field"
              value={value}
              onChange={(e) => setValue(option.key, e.target.value)}
              placeholder={option.default || option.key}
            />
          </div>
        )
      })}
    </div>
  )
}
