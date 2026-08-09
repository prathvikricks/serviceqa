import type { ReactNode } from 'react'

export interface TimelineItem {
  id: number | string
  title: ReactNode
  meta?: ReactNode
  tone?: 'default' | 'danger' | 'success'
}

const dotTone: Record<NonNullable<TimelineItem['tone']>, string> = {
  default: 'bg-accent',
  danger: 'bg-danger-fg',
  success: 'bg-success-fg',
}

/** Vertical activity timeline (audit entries on the request detail page). */
export function Timeline({ items }: { items: TimelineItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-text-muted">No activity yet.</p>
  }
  return (
    <ol className="relative ml-2 space-y-4 border-l border-border-light pl-5">
      {items.map((it) => (
        <li key={it.id} className="relative">
          <span
            className={`absolute -left-[1.42rem] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-surface ${
              dotTone[it.tone ?? 'default']
            }`}
          />
          <p className="text-sm text-text-primary">{it.title}</p>
          {it.meta && <p className="text-xs text-text-muted">{it.meta}</p>}
        </li>
      ))}
    </ol>
  )
}
