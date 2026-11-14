import { useState } from 'react'

export default function TemplateCard({ template, selected, onSelect, isAdded, onRemove, timingSuggestion }) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

  return (
    <div className="relative group">
      <button
        onClick={() => onSelect(template)}
        title={`${template.name} — ${template.description}${isAdded ? ' (Already on reel - click to edit)' : ' (Click to add to reel)'}`}
        className={`relative w-full overflow-hidden rounded-xl border text-left transition-all duration-150 ${
          selected
            ? 'border-cyan-glow shadow-glow ring-2 ring-cyan-glow/40'
            : isAdded
            ? 'border-emerald-500/80 bg-emerald-950/20 shadow-md shadow-emerald-500/10 hover:border-emerald-400'
            : 'border-white/10 hover:-translate-y-0.5 hover:border-white/30'
        }`}
      >
        <div className="relative aspect-[9/14] w-full overflow-hidden bg-ink-900">
          {!failed && (
            <img
              src={template.thumbnail_url}
              alt={template.name}
              loading="lazy"
              onLoad={() => setLoaded(true)}
              onError={() => setFailed(true)}
              className={`h-full w-full object-cover transition-opacity duration-300 ${
                loaded ? 'opacity-100' : 'opacity-0'
              }`}
            />
          )}
          {failed && (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-ink-700 to-ink-600 text-2xl font-black text-white/25">
              {String(template.number).padStart(2, '0')}
            </div>
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-ink-900 via-ink-900/25 to-transparent opacity-90" />

          <span className="absolute left-1.5 top-1.5 rounded-md bg-ink-900/85 px-1.5 py-0.5 text-[10px] font-black text-cyan-glow backdrop-blur">
            {String(template.number).padStart(2, '0')}
          </span>

          {isAdded ? (
            <span
              className="absolute right-1.5 top-1.5 rounded-md bg-emerald-500/95 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-white shadow-sm flex items-center gap-1"
              title="Added to reel"
            >
              ✓ ON REEL
            </span>
          ) : (template.number === 6 || template.number === 23 || template.number === 24 || template.number === 27) ? (
            <span
              className="absolute right-1.5 top-1.5 rounded-md bg-rose-500/95 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-white shadow-sm"
              title="Featured in reference reels"
            >
              🔥 VIRAL
            </span>
          ) : null}

          {template.needs_images && (
            <span
              className={`absolute top-1.5 rounded-md bg-amber-400/90 px-1.5 py-0.5 text-[9px] font-black text-ink-900 ${
                isAdded || template.number === 6 || template.number === 23 ? 'right-16' : 'right-1.5'
              }`}
              title="Auto-captures cards from video or upload custom covers"
            >
              CARDS
            </span>
          )}

          <div className="absolute inset-x-0 bottom-0 p-2">
            {timingSuggestion && (
              <span className="mb-1 inline-block rounded bg-cyan-glow/20 border border-cyan-glow/40 px-1 py-0.2 text-[8px] font-black text-cyan-glow backdrop-blur-sm truncate max-w-full">
                ⏱ {timingSuggestion}
              </span>
            )}
            <p className="truncate text-[11px] font-bold leading-tight text-white">{template.name}</p>
            <p className="truncate text-[10px] text-white/45">{template.category}</p>
          </div>

          {selected && (
            <span className="absolute right-1.5 bottom-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-cyan-glow text-ink-900 shadow-sm">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          )}
        </div>
      </button>

      {/* Quick remove button if added */}
      {isAdded && onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onRemove(template.id)
          }}
          title="Remove from reel"
          className="absolute -top-1.5 -left-1.5 hidden group-hover:flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-white shadow-md hover:bg-rose-500 transition text-[10px] font-bold z-20"
        >
          ✕
        </button>
      )}
    </div>
  )
}
