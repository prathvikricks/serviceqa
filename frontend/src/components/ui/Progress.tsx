import { cn } from '../../lib/cn'

/** A thin progress bar. Determinate by `pct` (0–100), or `indeterminate` for an
 * animated bar when the exact amount isn't known. */
export function ProgressBar({
  pct = 0,
  indeterminate = false,
  className,
}: {
  pct?: number
  indeterminate?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        'h-1.5 w-full overflow-hidden rounded-[var(--radius-pill)] bg-surface-2',
        className,
      )}
    >
      <div
        className={cn(
          'h-full rounded-[var(--radius-pill)] bg-accent',
          indeterminate ? 'w-1/3 animate-pulse' : 'transition-[width] duration-300',
        )}
        style={indeterminate ? undefined : { width: `${Math.max(0, Math.min(100, pct))}%` }}
      />
    </div>
  )
}

/** A circular progress ring. Fills to `pct` (0–100); shows a check when `done`. */
export function ProgressRing({
  pct = 0,
  size = 72,
  stroke = 6,
  done = false,
}: {
  pct?: number
  size?: number
  stroke?: number
  done?: boolean
}) {
  const clamped = Math.max(0, Math.min(100, done ? 100 : pct))
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (clamped / 100) * circ
  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-border-light"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          className={cn(
            'transition-[stroke-dashoffset] duration-500 ease-out',
            done ? 'text-success-fg' : 'text-accent',
          )}
        />
      </svg>
      <span
        className={cn(
          'absolute text-sm font-semibold',
          done ? 'text-success-fg' : 'text-text-primary',
        )}
      >
        {done ? '✓' : `${Math.round(clamped)}%`}
      </span>
    </div>
  )
}
