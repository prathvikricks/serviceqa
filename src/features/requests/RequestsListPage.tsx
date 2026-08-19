import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuth } from '../../auth/AuthContext'
import { Card } from '../../components/ui/Card'
import { Table, THead, TCell } from '../../components/ui/Table'
import { Badge, StatusBadge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Tabs, type TabItem } from '../../components/ui/Tabs'
import { PageHeader, Spinner, ErrorState, EmptyState } from '../../components/ui/Page'
import type { RequestSummary } from './types'

// Row shape augments the shared summary with the list-only duration field.
interface RequestRow extends RequestSummary {
  duration_hours: number | null
}

interface RequestsPage {
  requests: RequestRow[]
  statuses: string[]
  page: number
  pages: number
  total: number
}

function fmtDT(v: string | null): string {
  return v ? new Date(v).toLocaleString() : '—'
}

function fmtCost(v: number | null): string {
  return v == null ? '—' : `$${v.toFixed(2)}`
}

function fmtDuration(v: number | null): string {
  return v == null ? '—' : `${v}h`
}

function titleCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function RequestsListPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [status, setStatus] = useState('') // '' === all
  const [page, setPage] = useState(1)

  const isDevops = !!user?.is_devops

  const { data, isLoading, error } = useQuery({
    queryKey: ['requests', status, page],
    queryFn: () =>
      api.get<RequestsPage>(`/requests?page=${page}${status ? `&status=${status}` : ''}`),
  })

  const tabs: TabItem[] = [
    { value: 'all', label: 'All' },
    ...(data?.statuses ?? []).map((s) => ({ value: s, label: titleCase(s) })),
  ]

  function changeStatus(v: string) {
    setStatus(v === 'all' ? '' : v)
    setPage(1)
  }

  const columns = [
    'ID',
    'Project',
    'Environment',
    ...(isDevops ? ['Requester'] : []),
    'Action',
    'Status',
    'Duration',
    'Start',
    'End',
    'Created',
    'Est. cost',
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Requests"
        subtitle="Environment start/stop requests."
        action={
          <Link to="/requests/new">
            <Button>New Request</Button>
          </Link>
        }
      />

      <Tabs tabs={tabs} active={status || 'all'} onChange={changeStatus} />

      {isLoading ? (
        <Spinner label="Loading requests…" />
      ) : error ? (
        <ErrorState message="Failed to load requests." />
      ) : !data || data.requests.length === 0 ? (
        <Card>
          <EmptyState message="No requests found." />
        </Card>
      ) : (
        <Card>
          <Table>
            <THead columns={columns} />
            <tbody>
              {data.requests.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => navigate(`/requests/${r.id}`)}
                  className="cursor-pointer border-t border-border-light hover:bg-hover"
                >
                  <TCell className="font-medium">#{r.id}</TCell>
                  <TCell>{r.project ?? '—'}</TCell>
                  <TCell className="text-text-secondary">
                    {r.request_type === 'repo' ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Badge tone="info">Repo</Badge>
                        {r.repo_name}
                      </span>
                    ) : (
                      r.environment
                    )}
                  </TCell>
                  {isDevops && <TCell className="text-text-secondary">{r.requester}</TCell>}
                  <TCell className="text-text-secondary">
                    <div className="flex items-center gap-1.5">
                      {titleCase(r.action_type)}
                      {r.schedule_type === 'weekly' && <Badge tone="info">Weekly</Badge>}
                    </div>
                  </TCell>
                  <TCell>
                    <StatusBadge status={r.status} />
                  </TCell>
                  <TCell className="text-text-secondary">{fmtDuration(r.duration_hours)}</TCell>
                  <TCell className="text-text-secondary">{fmtDT(r.start_time)}</TCell>
                  <TCell className="text-text-secondary">{fmtDT(r.end_time)}</TCell>
                  <TCell className="text-text-secondary">{fmtDT(r.created_at)}</TCell>
                  <TCell>{fmtCost(r.estimated_cost)}</TCell>
                </tr>
              ))}
            </tbody>
          </Table>

          <div className="flex items-center justify-between border-t border-border-light px-5 py-3 text-sm">
            <span className="text-text-muted">
              Page {data.page} of {data.pages || 1}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={data.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={data.page >= data.pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
