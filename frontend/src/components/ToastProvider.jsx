import { createContext, useCallback, useContext, useMemo, useState } from 'react'

const ToastContext = createContext(null)

let counter = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id))
  }, [])

  const push = useCallback(
    (message, type = 'info', ttl = 4200) => {
      const id = ++counter
      setToasts((list) => [...list, { id, message, type }])
      if (ttl) setTimeout(() => dismiss(id), ttl)
      return id
    },
    [dismiss],
  )

  const value = useMemo(
    () => ({
      toast: push,
      success: (m) => push(m, 'success'),
      error: (m) => push(m, 'error', 6500),
      info: (m) => push(m, 'info'),
    }),
    [push],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex w-[min(92vw,380px)] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            onClick={() => dismiss(t.id)}
            className={`pointer-events-auto cursor-pointer rounded-xl border px-4 py-3 text-sm shadow-panel backdrop-blur-xl transition ${
              t.type === 'error'
                ? 'border-rose-400/40 bg-rose-500/15 text-rose-100'
                : t.type === 'success'
                  ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-100'
                  : 'border-white/15 bg-ink-800/90 text-white/90'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
