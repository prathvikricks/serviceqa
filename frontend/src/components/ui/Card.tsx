import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

export function Card({
  className,
  children,
  interactive = false,
}: {
  className?: string
  children: ReactNode
  /** Adds a gentle hover lift + shadow. Use for clickable/linked cards. */
  interactive?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]',
        interactive &&
          // Was hover:border-[#3f3f3f] — a dark-theme value applied in *both*
          // themes, so hovering a card in light mode drew a near-black border.
          'cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:border-text-muted hover:shadow-[var(--shadow-md)]',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function CardHeader({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-border-light px-5 py-4">
      <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      {action}
    </div>
  )
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('p-5', className)}>{children}</div>
}
