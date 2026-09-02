import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  )
}

export function THead({ columns }: { columns: ReactNode[] }) {
  return (
    <thead>
      <tr className="border-b border-border bg-surface-2/40 text-left text-[0.7rem] uppercase tracking-wide text-text-muted">
        {columns.map((c, i) => (
          <th key={i} className="px-5 py-3 font-semibold first:rounded-tl-[var(--radius-md)] last:rounded-tr-[var(--radius-md)]">
            {c}
          </th>
        ))}
      </tr>
    </thead>
  )
}

export function TRow({
  children,
  className,
  onClick,
}: {
  children: ReactNode
  className?: string
  onClick?: () => void
}) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        'border-b border-border-light transition-colors last:border-b-0 hover:bg-hover',
        className,
      )}
    >
      {children}
    </tr>
  )
}

export function TCell({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn('px-5 py-3.5 align-middle', className)}>{children}</td>
}
