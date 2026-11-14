const TOOLS = [
  { id: 'trim', label: 'Trim & Crop', icon: 'crop', enabled: true },
  { id: 'rotate', label: 'Rotate', icon: 'rotate', enabled: false },
  { id: 'flip', label: 'Flip', icon: 'flip', enabled: false },
  { id: 'speed', label: 'Speed', icon: 'speed', enabled: false },
  { id: 'volume', label: 'Volume', icon: 'volume', enabled: false },
  { id: 'text', label: 'Text', icon: 'text', enabled: false },
]

const ICONS = {
  crop: (
    <path
      d="M6 2v14a2 2 0 002 2h14M2 6h14a2 2 0 012 2v14"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  rotate: (
    <path
      d="M21 12a9 9 0 11-3-6.7M21 4v5h-5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  flip: (
    <>
      <path d="M12 3v18" strokeLinecap="round" strokeDasharray="2 3" />
      <path d="M9 7L4 12l5 5V7zM15 7l5 5-5 5V7z" strokeLinejoin="round" />
    </>
  ),
  speed: (
    <>
      <path d="M13 2L4.5 13H11l-1 9 8.5-11H12l1-9z" strokeLinejoin="round" />
    </>
  ),
  volume: (
    <>
      <path d="M11 5L6 9H2v6h4l5 4V5z" strokeLinejoin="round" />
      <path d="M15.5 8.5a5 5 0 010 7" strokeLinecap="round" />
    </>
  ),
  text: (
    <>
      <path d="M4 6V4h16v2M12 4v16M9 20h6" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
}

export default function Toolbar({ active, onSelect }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {TOOLS.map((tool) => {
        const isActive = active === tool.id
        const cls = tool.enabled
          ? isActive
            ? 'border-cyan-glow/70 bg-cyan-glow/15 text-cyan-glow'
            : 'border-white/12 bg-white/5 text-white/70 hover:border-white/30 hover:text-white'
          : 'border-white/8 bg-white/[0.02] text-white/30'
        return (
          <button
            key={tool.id}
            onClick={() => tool.enabled && onSelect?.(tool.id)}
            disabled={!tool.enabled}
            title={
              tool.enabled
                ? tool.label
                : `${tool.label} — coming soon`
            }
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition ${cls} ${
              tool.enabled ? 'cursor-pointer' : 'cursor-not-allowed'
            }`}
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              viewBox="0 0 24 24"
            >
              {ICONS[tool.icon]}
            </svg>
            {tool.label}
            {!tool.enabled && (
              <span className="rounded bg-white/10 px-1 text-[9px] font-bold uppercase tracking-wide">
                soon
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
