import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, ApiError } from '../lib/api'
import type { User } from '../lib/types'

/** Outcome of the password step. MFA is mandatory, so a first-time user is sent
 *  to enrollment and everyone else to the code step. */
export type LoginResult = 'ok' | 'mfa_required' | 'mfa_setup_required'

export interface MfaSetup {
  secret: string
  otpauth_uri: string
  qr_svg: string
}

interface AuthState {
  user: User | null
  loading: boolean
  login: (username: string, password: string, remember: boolean) => Promise<LoginResult>
  /** Enrolled user: submit the authenticator code to finish logging in. */
  verifyMfa: (code: string) => Promise<void>
  /** First login: mint a secret + QR to scan. */
  setupMfa: () => Promise<MfaSetup>
  /** First login: confirm the scanned code, enroll, and log in. */
  confirmMfa: (code: string) => Promise<void>
  logout: () => Promise<void>
  /** Re-fetch the current user (e.g. after an admin changes your own role). */
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Bootstrap: ask the backend who we are. A 401 just means "logged out".
    api
      .get<{ user: User }>('/auth/me', { silent401: true })
      .then((res) => setUser(res.user))
      .catch((err) => {
        if (!(err instanceof ApiError && err.status === 401)) {
          console.error('auth bootstrap failed', err)
        }
        setUser(null)
      })
      .finally(() => setLoading(false))
  }, [])

  async function login(username: string, password: string, remember: boolean): Promise<LoginResult> {
    const res = await api.post<{
      user?: User
      mfa_required?: boolean
      mfa_setup_required?: boolean
    }>('/auth/login', { username, password, remember_me: remember })
    if (res.user) {
      setUser(res.user)
      return 'ok'
    }
    return res.mfa_setup_required ? 'mfa_setup_required' : 'mfa_required'
  }

  async function verifyMfa(code: string) {
    const res = await api.post<{ user: User }>('/auth/login/verify', { code })
    setUser(res.user)
  }

  async function setupMfa(): Promise<MfaSetup> {
    return api.post<MfaSetup>('/auth/mfa/setup')
  }

  async function confirmMfa(code: string) {
    const res = await api.post<{ user: User }>('/auth/mfa/confirm', { code })
    setUser(res.user)
  }

  async function logout() {
    try {
      await api.post('/auth/logout')
    } finally {
      setUser(null)
    }
  }

  async function refresh() {
    const res = await api.get<{ user: User }>('/auth/me', { silent401: true })
    setUser(res.user)
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, login, verifyMfa, setupMfa, confirmMfa, logout, refresh }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
