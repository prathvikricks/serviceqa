import type { ReactNode } from 'react'

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return <p className="py-8 text-center text-sm text-text-muted">{label}</p>
}

export function ErrorState({ message = 'Something went wrong.' }: { message?: string }) {
  return <p className="py-8 text-center text-sm text-danger-fg">{message}</p>
}

export function EmptyState({ message }: { message: string }) {
  return <p className="py-8 text-center text-sm text-text-muted">{message}</p>
}
