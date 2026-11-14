import { useRef, useState } from 'react'
import { apiError, projects } from '../api/client'
import { useToast } from './ToastProvider'

const MAX_FILES = 30

export default function ImageUploader({ images, onChanged, compact = false }) {
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  const list = images?.images || []
  const count = images?.count ?? list.length

  const upload = async (files) => {
    const accepted = Array.from(files).filter((f) =>
      ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(f.type),
    )
    if (!accepted.length) {
      toast.error('Only JPG, PNG, WEBP or GIF images work here.')
      return
    }
    setBusy(true)
    try {
      const res = await projects.uploadImages(images.projectId, accepted.slice(0, MAX_FILES))
      if (res.rejected?.length) {
        toast.error(`Skipped: ${res.rejected.join(', ')}`)
      }
      toast.success(`Added ${res.saved.length} image${res.saved.length === 1 ? '' : 's'}.`)
      await onChanged?.()
    } catch (err) {
      toast.error(apiError(err, 'Could not upload those images.'))
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const remove = async (name) => {
    try {
      await projects.deleteImage(images.projectId, name)
      await onChanged?.()
    } catch (err) {
      toast.error(apiError(err, 'Could not delete that image.'))
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        className="hidden"
        onChange={(e) => upload(e.target.files)}
      />

      <div
        onClick={() => !busy && inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          upload(e.dataTransfer.files)
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-white/20 bg-white/[0.03] text-center transition hover:border-cyan-glow/60 hover:bg-cyan-glow/[0.06] ${
          compact ? 'px-3 py-3' : 'px-4 py-6'
        }`}
      >
        <svg
          className={`${compact ? 'h-5 w-5' : 'h-7 w-7'} text-cyan-glow`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
        </svg>
        <p className={`${compact ? 'mt-1 text-[11px]' : 'mt-2 text-xs'} font-semibold text-white/75`}>
          {busy ? 'Uploading…' : 'Add images'}
        </p>
        {!compact && <p className="mt-0.5 text-[11px] text-white/35">or drag them here</p>}
      </div>

      <div className="mt-2 flex items-center justify-between text-[11px]">
        <span className={count >= 3 ? 'text-emerald-300' : 'text-amber-300/90'}>
          {count} image{count === 1 ? '' : 's'} uploaded
          {count < 3 && ' · 3 minimum'}
        </span>
        {count > 0 && (
          <button
            onClick={() => {
              const first = list[0]
              if (first) remove(first.name)
            }}
            className="text-white/35 hover:text-rose-300"
          >
            Clear all
          </button>
        )}
      </div>

      {count > 0 && (
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {list.map((img) => (
            <div
              key={img.name}
              className="group relative aspect-square overflow-hidden rounded-lg border border-white/10 bg-ink-900"
            >
              <img src={img.url} alt={img.name} className="h-full w-full object-cover" />
              <button
                onClick={() => remove(img.name)}
                className="absolute inset-0 flex items-center justify-center bg-rose-500/75 text-xs font-bold opacity-0 transition group-hover:opacity-100"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
