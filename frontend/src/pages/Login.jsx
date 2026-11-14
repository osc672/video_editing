import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { apiError, auth, getToken, setSession } from '../api/client'
import { useToast } from '../components/ToastProvider'

export default function Login() {
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const toast = useToast()
  const navigate = useNavigate()
  const [params] = useSearchParams()

  useEffect(() => {
    if (getToken()) navigate('/upload', { replace: true })
    if (params.get('expired')) {
      setError('Your session expired. Please sign in again.')
    }
  }, [navigate, params])

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const payload =
        mode === 'login'
          ? { email: form.email, password: form.password }
          : { name: form.name, email: form.email, password: form.password }
      const data = mode === 'login' ? await auth.login(payload) : await auth.register(payload)
      setSession(data.access_token, data.user)
      toast.success(`Welcome ${mode === 'login' ? 'back' : ''}, ${data.user.name}!`.trim())
      navigate('/upload', { replace: true })
    } catch (err) {
      const message = apiError(err, 'Could not sign you in.')
      setError(message)
      toast.error(message)
    } finally {
      setBusy(false)
    }
  }

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  return (
    <div className="relative min-h-screen overflow-hidden bg-app-gradient flex items-center justify-center p-4">
      {/* decorative ambient glows */}
      <div className="pointer-events-none absolute -left-40 -top-40 h-[32rem] w-[32rem] rounded-full bg-cyan-glow/15 blur-[120px]" />
      <div className="pointer-events-none absolute -right-32 -bottom-32 h-[30rem] w-[30rem] rounded-full bg-indigo-500/15 blur-[120px]" />

      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-cyan-glow to-blue-500 text-ink-950 shadow-glow shadow-cyan-glow/25">
            <svg viewBox="0 0 24 24" className="h-7 w-7 fill-current ml-0.5">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">
            AI Reel Studio
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Turn your clips into viral, production-ready reels.
          </p>
        </div>

        <div className="panel p-8">
          <div className="mb-6 grid grid-cols-2 gap-1.5 rounded-xl bg-ink-950/70 p-1 border border-white/[0.06]">
            {['login', 'register'].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m)
                  setError('')
                }}
                className={`rounded-lg py-2 text-xs font-bold uppercase tracking-wider transition-all duration-200 ${
                  mode === m
                    ? 'bg-gradient-to-r from-cyan-glow to-cyan-400 text-ink-950 shadow-md font-extrabold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {m === 'login' ? 'Sign In' : 'Sign Up'}
              </button>
            ))}
          </div>

          {error && (
            <div className="mb-5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs font-medium text-rose-200">
              {error}
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="label" htmlFor="name">
                  Full Name
                </label>
                <input
                  id="name"
                  className="field"
                  value={form.name}
                  onChange={update('name')}
                  placeholder="Alex Morgan"
                  required
                  minLength={1}
                />
              </div>
            )}

            <div>
              <label className="label" htmlFor="email">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                className="field"
                value={form.email}
                onChange={update('email')}
                placeholder="alex@example.com"
                required
              />
            </div>

            <div>
              <label className="label" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                className="field"
                value={form.password}
                onChange={update('password')}
                placeholder="••••••••••••"
                required
                minLength={6}
              />
            </div>

            <div className="pt-2">
              <button type="submit" className="btn-primary w-full py-3 text-sm" disabled={busy}>
                {busy ? 'Processing…' : mode === 'login' ? 'Sign in to Studio' : 'Create Account'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
