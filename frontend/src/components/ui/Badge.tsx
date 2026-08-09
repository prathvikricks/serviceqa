import { cn } from '../../lib/cn'

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

const tones: Record<Tone, string> = {
  success: 'bg-success-bg text-success-fg border-success-border',
  warning: 'bg-warning-bg text-warning-fg border-warning-border',
  danger: 'bg-danger-bg text-danger-fg border-danger-border',
  info: 'bg-info-bg text-info-fg border-info-border',
  neutral: 'bg-neutral-bg text-neutral-fg border-neutral-border',
}

// Map the backend's request/job/service statuses onto a color tone.
const STATUS_TONE: Record<string, Tone> = {
  pending: 'warning',
  approved: 'info',
  active: 'success',
  starting: 'info',
  running: 'success',
  started: 'success',
  stopping: 'warning',
  declined: 'danger',
  failed: 'danger',
  stopped: 'neutral',
  completed: 'neutral',
  cancelled: 'neutral',
  expired: 'neutral',
  executed: 'success',
  executing: 'info',
}

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-[var(--radius-pill)] border px-2.5 py-0.5',
        'text-[0.7rem] font-medium capitalize',
        tones[tone],
      )}
    >
      {children}
    </span>
  )
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? 'neutral'}>{status.replace(/_/g, ' ')}</Badge>
}
