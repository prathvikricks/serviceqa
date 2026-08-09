import type { ReactNode } from 'react'

/**
 * Centred single-column auth layout.
 *
 * Accounts are provisioned by an admin — there is no self-serve signup — so
 * this screen is a sign-in form and nothing else.
 */
export function AuthShell({ subtitle, children }: { subtitle?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-body px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-lg font-semibold tracking-tight">envmanager</p>
          <p className="mt-1 text-sm text-text-muted">Scheduled cloud environments</p>
        </div>
        {subtitle && <p className="mb-6 text-center text-sm text-text-muted">{subtitle}</p>}
        {children}
      </div>
    </div>
  )
}
