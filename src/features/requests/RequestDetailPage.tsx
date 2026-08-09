import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { Table, THead, TRow, TCell } from '../../components/ui/Table'
import { StatusBadge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Field, Input } from '../../components/ui/Input'
import { Modal, ConfirmDialog } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/Toast'
import { PageHeader, Spinner, ErrorState } from '../../components/ui/Page'
import { Timeline, type TimelineItem } from '../../components/ui/Timeline'
import { useAuth } from '../../auth/AuthContext'
import type { AuditEntry, RequestDetail } from './types'

const LIVE_STATUSES = ['approved', 'starting', 'active', 'stopping']

const SUCCESS_ACTIONS = ['started', 'approved', 'completed', 'stopped']

function activityTone(action: string): TimelineItem['tone'] {
  if (action.includes('failed') || action.includes('declined')) return 'danger'
  if (SUCCESS_ACTIONS.some((a) => action.includes(a))) return 'success'
  return 'default'
}

function activityItems(entries: AuditEntry[]): TimelineItem[] {
  return entries.map((e) => ({
    id: e.id,
    title: `${e.action.replace(/_/g, ' ')}${e.user ? ` by ${e.user}` : ''}`,
    meta: e.created_at ? new Date(e.created_at).toLocaleString() : undefined,
    tone: activityTone(e.action),
  }))
}

function fmtDT(v: string | null): string {
  return v ? new Date(v).toLocaleString() : '—'
}

function fmtCost(v: number | null): string {
  return v == null ? '—' : `$${v.toFixed(2)}`
}

function titleCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function durationHours(start: string | null, end: string | null): string {
  if (!start || !end) return '—'
  const ms = new Date(end).getTime() - new Date(start).getTime()
  if (Number.isNaN(ms) || ms <= 0) return '—'
  return `${(ms / 3_600_000).toFixed(1)}h`
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-text-muted">{label}</p>
      <div className="mt-1 text-sm text-text-primary">{children}</div>
    </div>
  )
}

export function RequestDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { notify } = useToast()
  const { user } = useAuth()
  const isDevops = !!user?.is_devops

  const [confirmCancel, setConfirmCancel] = useState(false)
  const [extendOpen, setExtendOpen] = useState(false)
  const [newEndTime, setNewEndTime] = useState('')
  const [extendReason, setExtendReason] = useState('')
  const [decision, setDecision] = useState<'approve' | 'decline' | null>(null)
  const [decisionComment, setDecisionComment] = useState('')
  const [confirmStop, setConfirmStop] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['request', id],
    queryFn: () => api.get<RequestDetail>(`/requests/${id}`),
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status && LIVE_STATUSES.includes(status) ? 5000 : false
    },
  })

  const cancelMutation = useMutation({
    mutationFn: () => api.post<RequestDetail>(`/requests/${id}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['request', id] })
      queryClient.invalidateQueries({ queryKey: ['requests'] })
      notify('Request cancelled', 'success')
      setConfirmCancel(false)
    },
    onError: (err) => notify(err instanceof ApiError ? err.message : 'Failed to cancel', 'danger'),
  })

  const extendMutation = useMutation({
    mutationFn: () =>
      api.post<RequestDetail>(`/requests/${id}/extend`, {
        new_end_time: new Date(newEndTime).toISOString(),
        reason: extendReason,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['request', id] })
      queryClient.invalidateQueries({ queryKey: ['requests'] })
      notify('Extension requested', 'success')
      setExtendOpen(false)
      setNewEndTime('')
      setExtendReason('')
    },
    onError: (err) => notify(err instanceof ApiError ? err.message : 'Failed to extend', 'danger'),
  })

  const decisionMutation = useMutation({
    mutationFn: (vars: { decision: 'approve' | 'decline'; comment: string }) =>
      api.post(`/approvals/${id}/${vars.decision}`, { comment: vars.comment }),
    onSuccess: (_res, vars) => {
      queryClient.invalidateQueries({ queryKey: ['request', id] })
      queryClient.invalidateQueries({ queryKey: ['requests'] })
      queryClient.invalidateQueries({ queryKey: ['approvals'] })
      notify(vars.decision === 'approve' ? 'Request approved.' : 'Request declined.', 'success')
      setDecision(null)
      setDecisionComment('')
    },
    onError: (err) => notify(err instanceof ApiError ? err.message : 'Failed to submit decision', 'danger'),
  })

  const stopMutation = useMutation({
    mutationFn: (envId: number) => api.post(`/environments/${envId}/emergency-stop`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['request', id] })
      queryClient.invalidateQueries({ queryKey: ['requests'] })
      notify('Emergency stop triggered', 'success')
      setConfirmStop(false)
    },
    onError: (err) => notify(err instanceof ApiError ? err.message : 'Failed to stop', 'danger'),
  })

  if (isLoading) return <Spinner label="Loading request…" />
  if (error) return <ErrorState message="Failed to load request." />
  if (!data) return null

  const canCancel = data.status === 'pending' || data.status === 'approved'
  const canExtend = data.status === 'active'
  const canDecide = isDevops && data.status === 'pending'
  const canStop = isDevops && (data.status === 'active' || data.status === 'starting')

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Request #${data.id}`}
        subtitle={`${data.project} · ${data.environment}`}
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => navigate('/requests')}>
              Back
            </Button>
            {canDecide && (
              <>
                <Button onClick={() => { setDecision('approve'); setDecisionComment('') }}>
                  Approve
                </Button>
                <Button variant="danger" onClick={() => { setDecision('decline'); setDecisionComment('') }}>
                  Decline
                </Button>
              </>
            )}
            {canExtend && <Button onClick={() => setExtendOpen(true)}>Extend</Button>}
            {canStop && (
              <Button variant="danger" onClick={() => setConfirmStop(true)}>
                Emergency Stop
              </Button>
            )}
            {canCancel && (
              <Button variant="danger" onClick={() => setConfirmCancel(true)}>
                Cancel
              </Button>
            )}
          </div>
        }
      />

      <Card>
        <CardHeader title="Overview" action={<StatusBadge status={data.status} />} />
        <CardBody>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <Detail label="Requester">{data.requester}</Detail>
            <Detail label="Project">{data.project}</Detail>
            <Detail label="Environment">{data.environment}</Detail>
            <Detail label="Action">{titleCase(data.action_type)}</Detail>
            {data.schedule_type === 'weekly' && (
              <Detail label="Repeats">{data.recurrence_label ?? 'Weekly'}</Detail>
            )}
            <Detail label={data.schedule_type === 'weekly' ? 'Next start' : 'Start'}>
              {fmtDT(data.start_time)}
            </Detail>
            <Detail label={data.schedule_type === 'weekly' ? 'Next end' : 'End'}>
              {fmtDT(data.end_time)}
            </Detail>
            <Detail label="Duration">{durationHours(data.start_time, data.end_time)}</Detail>
            <Detail label="Estimated cost">{fmtCost(data.estimated_cost)}</Detail>
            <Detail label="Reason">{data.reason}</Detail>
            {data.parent_request_id != null && (
              <Detail label="Extension of">
                <Link to={`/requests/${data.parent_request_id}`} className="text-accent hover:underline">
                  #{data.parent_request_id}
                </Link>
              </Detail>
            )}
          </div>
        </CardBody>
      </Card>

      {data.approval && (
        <Card>
          <CardHeader title="Approval" />
          <CardBody>
            <div className="grid gap-5 sm:grid-cols-3">
              <Detail label="Approver">{data.approval.approver ?? '—'}</Detail>
              <Detail label="Decision">
                <StatusBadge status={data.approval.decision} />
                {data.approval.auto_approved && (
                  <span className="ml-2 text-xs text-text-muted">(auto)</span>
                )}
              </Detail>
              <Detail label="Comment">{data.approval.comment ?? '—'}</Detail>
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="Services" />
        {data.services.length === 0 ? (
          <CardBody className="text-sm text-text-muted">No services.</CardBody>
        ) : (
          <Table>
            <THead columns={['Name', 'Type', 'Status', 'Started', 'Stopped', 'Error']} />
            <tbody>
              {data.services.map((s) => (
                <TRow key={s.id}>
                  <TCell className="font-medium">{s.name}</TCell>
                  <TCell className="text-text-secondary">{s.type}</TCell>
                  <TCell>{s.action_status ? <StatusBadge status={s.action_status} /> : '—'}</TCell>
                  <TCell className="text-text-secondary">{fmtDT(s.started_at)}</TCell>
                  <TCell className="text-text-secondary">{fmtDT(s.stopped_at)}</TCell>
                  <TCell className="text-danger-fg">{s.error ?? '—'}</TCell>
                </TRow>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader title="Jobs" />
        {data.jobs.length === 0 ? (
          <CardBody className="text-sm text-text-muted">No scheduled jobs.</CardBody>
        ) : (
          <Table>
            <THead columns={['Type', 'Scheduled', 'Executed', 'Status', 'Error']} />
            <tbody>
              {data.jobs.map((j) => (
                <TRow key={j.id}>
                  <TCell className="font-medium">{titleCase(j.type)}</TCell>
                  <TCell className="text-text-secondary">{fmtDT(j.scheduled_time)}</TCell>
                  <TCell className="text-text-secondary">{fmtDT(j.executed_at)}</TCell>
                  <TCell>
                    <StatusBadge status={j.status} />
                  </TCell>
                  <TCell className="text-danger-fg">{j.error ?? '—'}</TCell>
                </TRow>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader title="Activity" />
        <CardBody>
          <Timeline items={activityItems(data.activity)} />
        </CardBody>
      </Card>

      <ConfirmDialog
        open={confirmCancel}
        title="Cancel request?"
        message="This will cancel the request and any scheduled actions."
        confirmLabel="Cancel request"
        danger
        onConfirm={() => cancelMutation.mutate()}
        onCancel={() => setConfirmCancel(false)}
      />

      <Modal
        open={extendOpen}
        onClose={() => setExtendOpen(false)}
        title="Extend request"
        footer={
          <>
            <Button variant="secondary" onClick={() => setExtendOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => extendMutation.mutate()}
              disabled={!newEndTime || !extendReason.trim() || extendMutation.isPending}
            >
              {extendMutation.isPending ? 'Submitting…' : 'Submit'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="New end time">
            <Input
              type="datetime-local"
              value={newEndTime}
              onChange={(e) => setNewEndTime(e.target.value)}
            />
          </Field>
          <Field label="Reason">
            <textarea
              className="w-full min-h-20 rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-border focus:outline-none focus:ring-2 focus:ring-accent/30"
              value={extendReason}
              onChange={(e) => setExtendReason(e.target.value)}
              placeholder="Why extend this request?"
            />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmStop}
        title="Emergency stop?"
        message="This immediately stops all services in this environment and ends active requests."
        confirmLabel="Emergency stop"
        danger
        onConfirm={() => stopMutation.mutate(data.environment_id)}
        onCancel={() => setConfirmStop(false)}
      />

      <Modal
        open={decision !== null}
        onClose={() => setDecision(null)}
        title={decision === 'approve' ? `Approve request #${data.id}` : `Decline request #${data.id}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDecision(null)} disabled={decisionMutation.isPending}>
              Cancel
            </Button>
            <Button
              variant={decision === 'decline' ? 'danger' : 'primary'}
              onClick={() =>
                decision &&
                decisionMutation.mutate({ decision, comment: decisionComment.trim() })
              }
              disabled={decisionMutation.isPending}
            >
              {decisionMutation.isPending
                ? 'Saving…'
                : decision === 'approve'
                  ? 'Approve'
                  : 'Decline'}
            </Button>
          </>
        }
      >
        <Field label="Comment (optional)">
          <textarea
            className="w-full min-h-20 rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-border focus:outline-none focus:ring-2 focus:ring-accent/30"
            value={decisionComment}
            onChange={(e) => setDecisionComment(e.target.value)}
            placeholder={
              decision === 'approve'
                ? 'Add an optional note for the requester…'
                : 'Reason for decline…'
            }
          />
        </Field>
      </Modal>
    </div>
  )
}
