import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type { ProjectCosts } from './adminTypes'
import { Button } from '../../components/ui/Button'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { Select } from '../../components/ui/Input'
import { Table, THead, TRow, TCell } from '../../components/ui/Table'
import { EmptyState, ErrorState, PageHeader, Spinner } from '../../components/ui/Page'

const fmt = (n: number) => `$${n.toFixed(2)}`

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardBody>
        <p className="text-xs uppercase tracking-wider text-text-muted">{label}</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      </CardBody>
    </Card>
  )
}

export function CostsPage() {
  const { id } = useParams()
  // Blank = let the backend pick the most recent month that has records.
  const [month, setMonth] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'costs', id, month],
    queryFn: () =>
      api.get<ProjectCosts>(
        `/admin/projects/${id}/costs${month ? `?month=${encodeURIComponent(month)}` : ''}`,
      ),
  })

  if (isLoading) return <Spinner />
  if (error || !data) return <ErrorState message="Failed to load the cost report." />

  const totalHourly = data.environments.reduce((sum, e) => sum + e.hourly_cost, 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Costs — ${data.project.name}`}
        subtitle="Actual runtime cost, recorded when each request's window completes."
        action={
          <div className="flex items-center gap-2">
            <Select
              value={month || data.month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-auto"
            >
              {data.available_months.length === 0 && <option value="">No data yet</option>}
              {data.available_months.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
            <Link to={`/admin/projects/${id}`}>
              <Button variant="secondary" size="sm">
                Back to project
              </Button>
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label={`Spend (${data.month || '—'})`} value={fmt(data.total_cost)} />
        <StatCard label="Cost per hour, all on" value={fmt(totalHourly)} />
        <StatCard label="Completed windows" value={String(data.records.length)} />
      </div>

      <Card>
        <CardHeader title="By environment" />
        <CardBody className="space-y-3">
          {data.environments.length === 0 ? (
            <EmptyState message="No environments configured." />
          ) : (
            data.environments.map((env) => (
              <div
                key={env.environment_id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-border-light pb-2 last:border-0 last:pb-0"
              >
                <span className="text-sm font-medium">{env.environment}</span>
                <span className="text-sm">
                  {fmt(env.cost)}
                  <span className="text-text-muted"> · {fmt(env.hourly_cost)}/hr running</span>
                </span>
              </div>
            ))
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={`Cost records${data.month ? ` (${data.month})` : ''}`} />
        {data.records.length === 0 ? (
          <CardBody>
            <EmptyState message="No completed request windows for this month yet." />
          </CardBody>
        ) : (
          <Table>
            <THead columns={['Request', 'Environment', 'Runtime', 'Cost', 'Recorded']} />
            <tbody>
              {data.records.map((r) => (
                <TRow key={r.id}>
                  <TCell className="font-medium">
                    <Link to={`/requests/${r.request_id}`} className="text-accent hover:underline">
                      #{r.request_id}
                    </Link>
                  </TCell>
                  <TCell className="text-text-secondary">{r.environment ?? '—'}</TCell>
                  <TCell className="text-text-secondary">{r.runtime_hours.toFixed(1)}h</TCell>
                  <TCell>{fmt(r.cost)}</TCell>
                  <TCell className="text-text-secondary">
                    {r.recorded_at ? new Date(r.recorded_at).toLocaleString() : '—'}
                  </TCell>
                </TRow>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  )
}
