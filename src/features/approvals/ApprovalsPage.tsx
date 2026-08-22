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
import { Field, Select } from '../../components/ui/Input'
import { useToast } from '../../components/ui/Toast'
import type { ApprovalRequest, GitProvidersResponse } from './types'

const PROVIDER_LABELS: Record<string, string> = { github: 'GitHub', gitlab: 'GitLab' }

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
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** Drops the repeated date when a window starts and ends on the same day.
 *  Width matters here: every column this table carries pushes Approve and
 *  Decline further off the right edge. */
function fmtWindow(start: string | null, end: string | null): string {
  if (!start || !end) return '—'
  const a = new Date(start)
  const b = new Date(end)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return '—'
  const right = a.toDateString() === b.toDateString()
    ? b.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : fmt(end)
  return `${fmt(start)} → ${right}`
}

function fmtCost(v: number | null): string {
  return v == null ? '—' : `$${v.toFixed(2)}`
}

/** 150 was far more than the column could ever show, and it pushed the
 *  Approve/Decline buttons off the right edge. The full text is in the title
 *  attribute and on the detail page. */
function truncate(s: string | null, n = 60): string {
  if (!s) return '—'
  return s.length > n ? `${s.slice(0, n)}…` : s
}

type Decision = 'approve' | 'decline'

export function ApprovalsPage() {
  const [status, setStatus] = useState('pending')
  const [active, setActive] = useState<{ req: ApprovalRequest; decision: Decision } | null>(null)
  const [comment, setComment] = useState('')
  const [provider, setProvider] = useState('')
  const queryClient = useQueryClient()
  const { notify } = useToast()

  const { data, isLoading, error } = useQuery({
    queryKey: ['approvals', status],
    queryFn: () => api.get<ApprovalsData>(`/approvals?status=${status}`),
  })

  // A repo request needs the approver to pick where to create it; only fetch
  // the configured providers when that modal is actually open.
  const isRepoApprove = active?.req.request_type === 'repo' && active?.decision === 'approve'
  const providersQuery = useQuery({
    queryKey: ['git-providers'],
    queryFn: () => api.get<GitProvidersResponse>('/git/providers'),
    enabled: isRepoApprove,
  })

  const mutation = useMutation({
    mutationFn: (vars: { id: number; decision: Decision; comment: string; provider?: string }) =>
      api.post(`/approvals/${vars.id}/${vars.decision}`, {
        comment: vars.comment,
        ...(vars.provider ? { provider: vars.provider } : {}),
      }),
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
    setProvider('')
  }

  function closeModal() {
    setActive(null)
    setComment('')
    setProvider('')
  }

  function submit() {
    if (!active) return
    if (isRepoApprove && !provider) {
      notify('Choose a Git provider to create the repo on.', 'danger')
      return
    }
    mutation.mutate({
      id: active.req.id,
      decision: active.decision,
      comment: comment.trim(),
      provider: isRepoApprove ? provider : undefined,
    })
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
                'Cost',
                // Every row on a single-status tab says the same thing; only
                // the mixed view needs the column.
                ...(status === 'all' ? ['Status'] : []),
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
                  <TCell className="text-text-secondary">{r.requester}</TCell>
                  <TCell className="capitalize">{r.action_type.replace(/_/g, ' ')}</TCell>
                  <TCell className="max-w-[16rem] text-text-secondary">
                    <span title={r.reason ?? ''}>{truncate(r.reason)}</span>
                  </TCell>
                  <TCell className="text-text-secondary whitespace-nowrap">
                    {fmtWindow(r.start_time, r.end_time)}
                  </TCell>
                  <TCell className="text-text-secondary">{fmtCost(r.estimated_cost)}</TCell>
                  {status === 'all' && (
                    <TCell>
                      <StatusBadge status={r.status} />
                    </TCell>
                  )}
                  <TCell>
                    {(r.status === 'pending' ||
                      (r.request_type === 'repo' && r.status === 'failed')) && (
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => openModal(r, 'approve')}>
                          {r.status === 'failed' ? 'Retry' : 'Approve'}
                        </Button>
                        {r.status === 'pending' && (
                          <Button size="sm" variant="danger" onClick={() => openModal(r, 'decline')}>
                            Decline
                          </Button>
                        )}
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
            {active.req.request_type === 'repo' ? (
              <p className="text-text-secondary">
                Repo <span className="font-medium text-text-primary">{active.req.repo_name}</span>
                {' '}({active.req.repo_visibility})
                {active.req.project ? ` · ${active.req.project}` : ''} · requested by{' '}
                {active.req.requester}
              </p>
            ) : (
              <p className="text-text-secondary">
                {active.req.project} · {active.req.environment} · requested by{' '}
                {active.req.requester}
              </p>
            )}

            {isRepoApprove && (
              <Field label="Create on">
                <Select value={provider} onChange={(e) => setProvider(e.target.value)}>
                  <option value="">
                    {providersQuery.isFetching ? 'Loading…' : 'Select a Git provider…'}
                  </option>
                  {(providersQuery.data?.providers ?? []).map((p) => (
                    <option key={p} value={p}>
                      {PROVIDER_LABELS[p] ?? p}
                    </option>
                  ))}
                </Select>
                {providersQuery.data && providersQuery.data.providers.length === 0 && (
                  <p className="mt-1 text-xs text-danger-fg">
                    No Git provider is configured on the server (set GITHUB_TOKEN or GITLAB_TOKEN).
                  </p>
                )}
                {active.req.git_error && (
                  <p className="mt-1 text-xs text-danger-fg">
                    Previous attempt failed: {active.req.git_error}
                  </p>
                )}
              </Field>
            )}

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
