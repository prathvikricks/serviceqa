import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { PageHeader, Spinner, ErrorState } from '../../components/ui/Page'

interface AuditEntry {
  id: number
  action: string
  entity_type: string
  entity_id: number | null
  user: string | null
  details: Record<string, unknown> | null
  ip_address: string | null
  created_at: string | null
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-border-light py-3 last:border-0 sm:flex-row sm:gap-4">
      <span className="w-40 shrink-0 text-xs font-semibold uppercase tracking-wide text-text-muted">
        {label}
      </span>
      <span className="text-sm text-text-secondary">{children}</span>
    </div>
  )
}

export function AuditLogDetailPage() {
  const { id } = useParams()
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-audit', 'entry', id],
    queryFn: () => api.get<AuditEntry>(`/admin/audit/${id}`),
    retry: false,
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit entry"
        subtitle={data ? `#${data.id}` : undefined}
        action={
          <Link to="/admin/audit">
            <Button variant="secondary" size="sm">Back to audit log</Button>
          </Link>
        }
      />

      {isLoading ? (
        <Spinner label="Loading entry…" />
      ) : error || !data ? (
        <ErrorState message="Could not load this audit entry." />
      ) : (
        <>
          <Card>
            <CardHeader title="Activity" />
            <CardBody>
              <Row label="Action">
                <Badge tone="info">{data.action}</Badge>
              </Row>
              <Row label="Time">{formatDate(data.created_at)}</Row>
              <Row label="User">{data.user ?? '—'}</Row>
              <Row label="Entity type">{data.entity_type}</Row>
              <Row label="Entity ID">{data.entity_id ?? '—'}</Row>
              <Row label="IP address">
                <span className="font-mono">{data.ip_address ?? '—'}</span>
              </Row>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Details" />
            <CardBody>
              {data.details && Object.keys(data.details).length > 0 ? (
                <pre className="overflow-x-auto rounded-[var(--radius-sm)] bg-hover p-4 font-mono text-xs text-text-secondary">
                  {JSON.stringify(data.details, null, 2)}
                </pre>
              ) : (
                <p className="text-sm text-text-muted">No additional details recorded.</p>
              )}
            </CardBody>
          </Card>
        </>
      )}
    </div>
  )
}
