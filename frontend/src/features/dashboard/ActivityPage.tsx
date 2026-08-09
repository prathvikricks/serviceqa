import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { Table, THead, TRow, TCell } from '../../components/ui/Table'
import { StatusBadge } from '../../components/ui/Badge'
import { Tabs, type TabItem } from '../../components/ui/Tabs'
import { PageHeader, Spinner, ErrorState } from '../../components/ui/Page'
import type { ActivityResponse } from '../requests/types'

interface ActivityData extends ActivityResponse {
  job_statuses: string[]
}

function fmtDT(v: string | null): string {
  return v ? new Date(v).toLocaleString() : '—'
}

function titleCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function ActivityPage() {
  const [status, setStatus] = useState('') // '' === all

  const { data, isLoading, error } = useQuery({
    queryKey: ['activity', status],
    queryFn: () =>
      api.get<ActivityData>(`/dashboard/activity${status ? `?status=${status}` : ''}`),
    refetchInterval: 6000,
    placeholderData: keepPreviousData,
  })

  const tabs: TabItem[] = [
    { value: 'all', label: 'All' },
    ...(data?.job_statuses ?? []).map((s) => ({ value: s, label: titleCase(s) })),
  ]

  return (
    <div className="space-y-6">
      <PageHeader title="Activity" subtitle="Live job execution and in-flight requests." />

      <Tabs
        tabs={tabs}
        active={status || 'all'}
        onChange={(v) => setStatus(v === 'all' ? '' : v)}
      />

      {isLoading ? (
        <Spinner label="Loading activity…" />
      ) : error ? (
        <ErrorState message="Failed to load activity." />
      ) : !data ? null : (
        <div className="space-y-6">
      <Card>
        <CardHeader title="Processing now" />
        {data.in_flight.length === 0 ? (
          <CardBody className="text-sm text-text-muted">Nothing processing right now.</CardBody>
        ) : (
          <Table>
            <THead columns={['ID', 'Project', 'Environment', 'Requester', 'Action', 'Status']} />
            <tbody>
              {data.in_flight.map((r) => (
                <TRow key={r.id}>
                  <TCell className="font-medium">
                    <Link to={`/requests/${r.id}`} className="text-accent hover:underline">
                      #{r.id}
                    </Link>
                  </TCell>
                  <TCell>{r.project}</TCell>
                  <TCell className="text-text-secondary">{r.environment}</TCell>
                  <TCell className="text-text-secondary">{r.requester}</TCell>
                  <TCell className="text-text-secondary">{titleCase(r.action_type)}</TCell>
                  <TCell>
                    <StatusBadge status={r.status} />
                  </TCell>
                </TRow>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader title="Scheduled jobs" />
        {data.jobs.length === 0 ? (
          <CardBody className="text-sm text-text-muted">No scheduled jobs.</CardBody>
        ) : (
          <Table>
            <THead
              columns={['Type', 'Request', 'Scheduled', 'Executed', 'Status', 'Detail', 'Error']}
            />
            <tbody>
              {data.jobs.map((j) => (
                <TRow key={j.id}>
                  <TCell className="font-medium">{titleCase(j.type)}</TCell>
                  <TCell>
                    <Link to={`/requests/${j.request_id}`} className="text-accent hover:underline">
                      #{j.request_id}
                    </Link>
                  </TCell>
                  <TCell className="text-text-secondary">{fmtDT(j.scheduled_time)}</TCell>
                  <TCell className="text-text-secondary">{fmtDT(j.executed_at)}</TCell>
                  <TCell>
                    <StatusBadge status={j.status} />
                  </TCell>
                  <TCell className="text-text-secondary">
                    {[j.project, j.environment, j.requester].filter(Boolean).join(' · ') || '—'}
                  </TCell>
                  <TCell className="text-danger-fg">{j.error ?? '—'}</TCell>
                </TRow>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
        </div>
      )}
    </div>
  )
}
