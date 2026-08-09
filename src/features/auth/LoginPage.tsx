import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { ApiError } from '../../lib/api'
import { Button } from '../../components/ui/Button'
import { Field, Input } from '../../components/ui/Input'
import { AuthShell } from './AuthShell'

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  /** Where to land after signing in — the page the guard bounced us from, else home. */
  function resolveTarget(): string {
    const from = (location.state as { from?: string } | null)?.from
    if (typeof from === 'string' && from.startsWith('/')) return from
    const next = searchParams.get('next')
    // Only same-origin paths, so `?next=` can't be used as an open redirect.
    if (next && next.startsWith('/')) return next
    return '/'
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await login(username, password, remember)
      navigate(resolveTarget(), { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell subtitle="Sign in to continue">
      <div className="space-y-4 rounded-[var(--radius-lg)] border border-border bg-surface p-6 shadow-sm">
        {error && (
          <div className="rounded-[var(--radius-sm)] border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-fg">
            {error}
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Username or email">
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              required
            />
          </Field>

          <Field label="Password">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>

          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="accent-[var(--accent)]"
            />
            Remember me
          </label>

          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <p className="text-center text-xs text-text-muted">
          Accounts are created by an administrator.
        </p>
      </div>
    </AuthShell>
  )
}
