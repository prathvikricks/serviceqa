import type { ReactNode } from 'react'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { StatusBadge } from '../../components/ui/Badge'
import type { RequestSummary } from '../../lib/types'

/** Shared dashboard building blocks + chart theming, used by both the ops and
 *  developer dashboards. */

export interface Analytics {
  kpis: {
    total_requests: number
    active: number
    pending: number
    completed_30d: number
    est_cost_30d: number
    projects: number
    environments: number
  }
  requests_over_time: { day: string; count: number }[]
  by_status: { status: string; count: number }[]
  by_action: { action_type: string; count: number }[]
  cost_by_month: { month: string; cost: number }[]
  top_environments: { name: string; count: number }[]
}

export const STATUS_COLOR: Record<string, string> = {
  active: 'var(--success-fg)',
  starting: 'var(--success-fg)',
  completed: 'var(--info-fg)',
  approved: 'var(--info-fg)',
  pending: 'var(--warning-fg)',
  declined: 'var(--danger-fg)',
  failed: 'var(--danger-fg)',
  cancelled: 'var(--neutral-fg)',
}
export const statusColor = (s: string) => STATUS_COLOR[s] ?? 'var(--neutral-fg)'

export const axisProps = {
  tick: { fill: 'var(--text-muted)', fontSize: 11 },
  stroke: 'var(--border)',
  tickLine: false,
}
export const tooltipStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  color: 'var(--text-primary)',
  fontSize: 12,
}

export function Kpi({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: string | number
}) {
  return (
    <Card>
      <CardBody className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-accent-soft text-accent">
          {icon}
        </span>
        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-text-muted">
            {label}
          </p>
          <p className="text-2xl font-semibold tracking-tight">{value}</p>
        </div>
      </CardBody>
    </Card>
  )
}

export function ChartCard({
  title,
  children,
  empty,
}: {
  title: string
  children: ReactNode
  empty: boolean
}) {
  return (
    <Card>
      <CardHeader title={title} />
      <CardBody>
        {empty ? (
          <p className="flex h-[220px] items-center justify-center text-sm text-text-muted">
            No data yet.
          </p>
        ) : (
          <div className="h-[220px]">{children}</div>
        )}
      </CardBody>
    </Card>
  )
}

export function MiniTable({
  title,
  rows,
  action,
  emptyLabel = 'Nothing here yet.',
}: {
  title: string
  rows: RequestSummary[]
  action?: ReactNode
  emptyLabel?: string
}) {
  return (
    <Card>
      <CardHeader title={title} action={action} />
      {rows.length === 0 ? (
        <CardBody className="text-sm text-text-muted">{emptyLabel}</CardBody>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {rows.slice(0, 6).map((r) => (
                <tr key={r.id} className="border-t border-border-light hover:bg-hover">
                  <td className="px-5 py-2.5 font-medium">#{r.id}</td>
                  <td className="px-5 py-2.5 text-text-secondary">{r.project}</td>
                  <td className="px-5 py-2.5 text-text-secondary">{r.environment}</td>
                  <td className="px-5 py-2.5">
                    <StatusBadge status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
