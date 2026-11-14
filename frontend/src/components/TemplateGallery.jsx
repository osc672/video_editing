import { useMemo, useState } from 'react'
import TemplateCard from './TemplateCard'

const CATEGORIES = [
  'All',
  '🔥 Viral Reels',
  'Camera',
  'Text/Headline',
  'UI/Social',
  'Lists/Data',
  'Reels/Images',
  'Grade/Transitions',
  'Fun',
]

export default function TemplateGallery({
  templates,
  loading,
  selectedId,
  onSelect,
  effects = [],
  onRemoveEffect,
  onApplyViralTrio,
}) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')

  const activeTemplateIds = useMemo(() => new Set(effects.map((e) => e.template_id)), [effects])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (templates || []).filter((t) => {
      if (category === '🔥 Viral Reels') {
        if (t.number !== 6 && t.number !== 23 && t.category !== 'UI/Social' && t.category !== 'Text/Headline') {
          return false
        }
      } else if (category !== 'All' && t.category !== category) {
        return false
      }
      if (!q) return true
      return (
        t.name.toLowerCase().includes(q) ||
        t.fx.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q)
      )
    })
  }, [templates, search, category])

  return (
    <div className="flex h-full flex-col bg-ink-900/60">
      <div className="border-b border-white/[0.08] p-3.5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-300">
            Effect Library
          </h2>
          <span className="text-[10px] font-bold text-cyan-glow bg-cyan-glow/10 px-2 py-0.5 rounded-full border border-cyan-glow/20">
            51 Effects
          </span>
        </div>
        <div className="relative">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            viewBox="0 0 24 24"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
          <input
            className="field pl-8 py-2 text-xs"
            placeholder="Search effects & styles…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="scroll-thin flex gap-1.5 overflow-x-auto border-b border-white/[0.08] p-2.5">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`chip whitespace-nowrap text-[11px] ${category === c ? 'chip-active font-bold' : ''}`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="scroll-thin flex-1 overflow-y-auto p-2.5">
        {loading && (
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="skeleton aspect-[9/14] w-full rounded-xl" />
            ))}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="px-4 py-12 text-center">
            <p className="text-sm font-semibold text-slate-300">No effects found</p>
            <p className="mt-1 text-xs text-slate-500">Try adjusting your search query.</p>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {filtered.map((t) => {
              let timingSuggestion = null
              if (t.number === 6 || t.fx === 'backdrop-word') timingSuggestion = '0s – 12s (Hook)'
              else if (t.number === 24 || t.fx === 'red-collage') timingSuggestion = '0s – 12s (Hook)'
              else if (t.number === 23 || t.fx === 'glass-widgets') timingSuggestion = '12s – 30s (Stats)'
              else if (t.number === 27 || t.fx === 'check-pills') timingSuggestion = '30s – End (CTA)'
              else if (t.number === 25 || t.fx === 'split-headline') timingSuggestion = '3s – 8s (Headline)'
              else if (t.number === 11 || t.fx === 'todo') timingSuggestion = '3s – 8s (List)'
              else if (t.number === 13 || t.fx === 'tap') timingSuggestion = 'End (Follow)'
              else if (t.number === 7 || t.fx === 'spotlight') timingSuggestion = 'End (CTA)'

              return (
                <TemplateCard
                  key={t.id}
                  template={t}
                  selected={t.id === selectedId}
                  isAdded={activeTemplateIds.has(t.id)}
                  onSelect={onSelect}
                  onRemove={onRemoveEffect}
                  timingSuggestion={timingSuggestion}
                />
              )
            })}
          </div>
        )}
      </div>

      <div className="border-t border-white/[0.08] px-3.5 py-2 text-[11px] text-slate-400 flex items-center justify-between">
        <span>{filtered.length} of {templates?.length || 0} templates</span>
        <span className="text-[10px] text-slate-500">Click to preview</span>
      </div>
    </div>
  )
}
