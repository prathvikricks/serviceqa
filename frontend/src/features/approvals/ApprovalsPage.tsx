import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { PageHeader, Spinner, ErrorState, EmptyState } from '../../components/ui/Page'
import { Card } from '../../components/ui/Card'
import { Tabs } from '../../components/ui/Tabs'
import { Table, THead, TRow, TCell } from '../../components/ui/Table'
import { StatusBadge, Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { Field } from '../../components/ui/Input'
import { useToast } from '../../components/ui/Toast'
import type { ApprovalRequest } from './types'

// Row augments the shared request with approval-list-only fields.
interface ApprovalRow extends ApprovalRequest {
  duration_hours: number | null
  parent_request_id: number | null
}

interface ApprovalsData {
  requests: ApprovalRow[]
  statuses: string[]
}

const TABS = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'declined', label: 'Declined' },
  { value: 'all', label: 'All' },
]

const textareaClass =
  'w-full min-h-[5rem] px-3 py-2 rounded-[var(--radius-sm)] bg-surface text-text-primary ' +
  'border border-border placeholder:text-text-muted ' +
  'focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent-border ' +
  'transition-colors duration-150 text-sm'

function fmt(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function fmtCost(v: number | null): string {
  return v == null ? '—' : `$${v.toFixed(2)}`
}

function fmtDuration(v: number | null): string {
  return v == null ? '—' : `${v}h`
}

function truncate(s: string | null, n = 150): string {
  if (!s) return '—'
  return s.length > n ? `${s.slice(0, n)}…` : s
}

type Decision = 'approve' | 'decline'

export function ApprovalsPage() {
  const [status, setStatus] = useState('pending')
  const [active, setActive] = useState<{ req: ApprovalRequest; decision: Decision } | null>(null)
  const [comment, setComment] = useState('')
  const queryClient = useQueryClient()
  const { notify } = useToast()

  const { data, isLoading, error } = useQuery({
    queryKey: ['approvals', status],
    queryFn: () => api.get<ApprovalsData>(`/approvals?status=${status}`),
  })

  const mutation = useMutation({
    mutationFn: (vars: { id: number; decision: Decision; comment: string }) =>
      api.post(`/approvals/${vars.id}/${vars.decision}`, { comment: vars.comment }),
    onSuccess: (_res, vars) => {
      queryClient.invalidateQueries({ queryKey: ['approvals'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      notify(vars.decision === 'approve' ? 'Request approved.' : 'Request declined.', 'success')
      closeModal()
    },
    onError: (err: Error) => notify(err.message, 'danger'),
  })

  function openModal(req: ApprovalRequest, decision: Decision) {
    setActive({ req, decision })
    setComment('')
  }

  function closeModal() {
    setActive(null)
    setComment('')
  }

  function submit() {
    if (!active) return
    mutation.mutate({ id: active.req.id, decision: active.decision, comment: comment.trim() })
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Approvals" subtitle="Review and decide on environment requests." />

      <Tabs tabs={TABS} active={status} onChange={setStatus} />

      <Card>
        {isLoading ? (
          <Spinner label="Loading requests…" />
        ) : error ? (
          <ErrorState message="Failed to load approvals." />
        ) : !data || data.requests.length === 0 ? (
          <EmptyState message="No requests here." />
        ) : (
          <Table>
            <THead
              columns={[
                'ID',
                'Project',
                'Environment',
                'Requester',
                'Action',
                'Reason',
                'Window',
                'Duration',
                'Cost',
                'Status',
                '',
              ]}
            />
            <tbody>
              {data.requests.map((r) => (
                <TRow key={r.id}>
                  <TCell className="font-medium">
                    <div className="flex items-center gap-2">
                      #{r.id}
                      {r.parent_request_id != null && <Badge tone="info">Extension</Badge>}
                    </div>
                  </TCell>
                  <TCell>{r.project}</TCell>
                  <TCell className="text-text-secondary">{r.environment}</TCell>
                  <TCell className="text-text-secondary">{r.requester}</TCell>
                  <TCell className="capitalize">{r.action_type.replace(/_/g, ' ')}</TCell>
                  <TCell className="max-w-xs text-text-secondary">
                    <span title={r.reason ?? ''}>{truncate(r.reason)}</span>
                  </TCell>
                  <TCell className="text-text-secondary whitespace-nowrap">
                    {fmt(r.start_time)} → {fmt(r.end_time)}
                  </TCell>
                  <TCell className="text-text-secondary">{fmtDuration(r.duration_hours)}</TCell>
                  <TCell className="text-text-secondary">{fmtCost(r.estimated_cost)}</TCell>
                  <TCell>
                    <StatusBadge status={r.status} />
                  </TCell>
                  <TCell>
                    {r.status === 'pending' && (
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => openModal(r, 'approve')}>
                          Approve
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => openModal(r, 'decline')}>
                          Decline
                        </Button>
                      </div>
                    )}
                  </TCell>
                </TRow>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal
        open={active !== null}
        onClose={closeModal}
        title={
          active?.decision === 'approve'
            ? `Approve request #${active?.req.id}`
            : `Decline request #${active?.req.id}`
        }
        footer={
          <>
            <Button variant="secondary" onClick={closeModal} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button
              variant={active?.decision === 'decline' ? 'danger' : 'primary'}
              onClick={submit}
              disabled={mutation.isPending}
            >
              {mutation.isPending
                ? 'Saving…'
                : active?.decision === 'approve'
                  ? 'Approve'
                  : 'Decline'}
            </Button>
          </>
        }
      >
        {active && (
          <div className="space-y-3">
            <p className="text-text-secondary">
              {active.req.project} · {active.req.environment} · requested by{' '}
              {active.req.requester}
            </p>
            <Field label="Comment (optional)">
              <textarea
                className={textareaClass}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add an optional note for the requester…"
              />
            </Field>
          </div>
        )}
      </Modal>
    </div>
  )
}
