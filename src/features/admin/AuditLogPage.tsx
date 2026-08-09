import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { Card } from '../../components/ui/Card'
import { Field, Input, Select } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Table, THead, TRow, TCell } from '../../components/ui/Table'
import { PageHeader, Spinner, ErrorState, EmptyState } from '../../components/ui/Page'

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

interface AuditResponse {
  entries: AuditEntry[]
  page: number
  pages: number
  total: number
  actions: string[]
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}

export function AuditLogPage() {
  const [page, setPage] = useState(1)
  const [action, setAction] = useState('')
  const [entityType, setEntityType] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-audit', page, action, entityType],
    queryFn: () =>
      api.get<AuditResponse>(
        `/admin/audit?page=${page}` +
          `&action=${encodeURIComponent(action)}` +
          `&entity_type=${encodeURIComponent(entityType)}`,
      ),
  })

  return (
    <div className="space-y-6">
      <PageHeader title="Audit Log" subtitle={data ? `${data.total} entries` : undefined} />

      <div className="flex flex-wrap items-end gap-3">
        <Field label="Action">
          <Select
            value={action}
            onChange={(e) => {
              setPage(1)
              setAction(e.target.value)
            }}
          >
            <option value="">All actions</option>
            {data?.actions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Entity type">
          <Input
            placeholder="e.g. project"
            value={entityType}
            onChange={(e) => {
              setPage(1)
              setEntityType(e.target.value)
            }}
          />
        </Field>
      </div>

      {isLoading ? (
        <Spinner label="Loading audit log…" />
      ) : error ? (
        <ErrorState message="Failed to load audit log." />
      ) : !data || data.entries.length === 0 ? (
        <EmptyState message="No audit entries match these filters." />
      ) : (
        <Card>
          <Table>
            <THead
              columns={['Time', 'User', 'Action', 'Entity', 'Entity ID', 'Details', 'IP']}
            />
            <tbody>
              {data.entries.map((e) => (
                <TRow key={e.id}>
                  <TCell className="whitespace-nowrap text-text-secondary">
                    {formatDate(e.created_at)}
                  </TCell>
                  <TCell>{e.user ?? '—'}</TCell>
                  <TCell>
                    <Badge tone="info">{e.action}</Badge>
                  </TCell>
                  <TCell className="text-text-secondary">{e.entity_type}</TCell>
                  <TCell className="text-text-secondary">{e.entity_id ?? '—'}</TCell>
                  <TCell>
                    {e.details ? (
                      <code className="block max-w-xs truncate text-xs text-text-muted">
                        {JSON.stringify(e.details)}
                      </code>
                    ) : (
                      '—'
                    )}
                  </TCell>
                  <TCell className="text-text-muted">{e.ip_address ?? '—'}</TCell>
                </TRow>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {data && data.pages > 1 && (
        <div className="flex items-center justify-between">
          <Button
            variant="secondary"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <span className="text-sm text-text-muted">
            Page {data.page} of {data.pages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= data.pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  )
}
