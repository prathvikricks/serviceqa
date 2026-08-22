import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { Table, THead, TRow, TCell } from '../../components/ui/Table'
import { StatusBadge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Field, Input, Select } from '../../components/ui/Input'
import { Modal, ConfirmDialog } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/Toast'
import { PageHeader, Spinner, ErrorState } from '../../components/ui/Page'
import { Timeline, type TimelineItem } from '../../components/ui/Timeline'
import { useAuth } from '../../auth/AuthContext'
import type { AuditEntry, EnvironmentsResponse, RequestDetail } from './types'

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
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [adjustEnv, setAdjustEnv] = useState<string>('')
  const [adjustServices, setAdjustServices] = useState<number[] | null>(null)
  const [decisionComment, setDecisionComment] = useState('')
  const [provider, setProvider] = useState('')
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
    mutationFn: (vars: { decision: 'approve' | 'decline'; comment: string; provider?: string }) =>
      api.post(`/approvals/${id}/${vars.decision}`, {
        comment: vars.comment,
        ...(vars.provider ? { provider: vars.provider } : {}),
      }),
    onSuccess: (_res, vars) => {
      queryClient.invalidateQueries({ queryKey: ['request', id] })
      queryClient.invalidateQueries({ queryKey: ['requests'] })
      queryClient.invalidateQueries({ queryKey: ['approvals'] })
      notify(vars.decision === 'approve' ? 'Request approved.' : 'Request declined.', 'success')
      setDecision(null)
      setDecisionComment('')
      setProvider('')
    },
    onError: (err) => notify(err instanceof ApiError ? err.message : 'Failed to submit decision', 'danger'),
  })

  const isRepo = data?.request_type === 'repo'
  const providersQuery = useQuery({
    queryKey: ['git-providers'],
    queryFn: () => api.get<{ providers: string[] }>('/git/providers'),
    enabled: isRepo && decision === 'approve',
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

  // Environments of this request's project, so the approver can move it.
  const { data: envData } = useQuery({
    queryKey: ['project-environments', data?.project_id ?? data?.environment_id, adjustOpen],
    queryFn: () =>
      api.get<EnvironmentsResponse>(
        `/projects/${data!.project_id}/environments`),
    enabled: adjustOpen && !!data?.project_id,
  })

  const adjust = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.patch(`/approvals/${id}/adjust`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['request', id] })
      queryClient.invalidateQueries({ queryKey: ['approvals'] })
      notify('Request updated.', 'success')
      setAdjustOpen(false)
      setAdjustServices(null)
    },
    onError: (err) =>
      notify(err instanceof ApiError ? err.message : 'Could not adjust', 'danger'),
  })

  if (isLoading) return <Spinner label="Loading request…" />
  if (error) return <ErrorState message="Failed to load request." />
  if (!data) return null

  const canCancel = data.status === 'pending' || (!isRepo && data.status === 'approved')
  const canExtend = !isRepo && data.status === 'active'
  // Repo requests can be (re)approved when pending or after a failed attempt.
  const canDecide =
    isDevops && (data.status === 'pending' || (isRepo && data.status === 'failed'))
  const canStop = isDevops && !isRepo && (data.status === 'active' || data.status === 'starting')
  // The requester asked for an outcome, not a machine list. Before approving,
  // the approver can point the request at the right environment and pick which
  // services actually start.
  const canAdjust = isDevops && !isRepo && data.status === 'pending'

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Request #${data.id}`}
        subtitle={
          isRepo
            ? `${data.project ?? 'No project'} · Repo: ${data.repo_name}`
            : `${data.project} · ${data.environment}`
        }
        action={
          <div className="flex gap-2">
            {canAdjust && (
              <Button
                variant="secondary"
                onClick={() => {
                  // Seed from what the request actually has, so the dialog
                  // reflects reality instead of implying everything is selected.
                  setAdjustServices(data.services.map((s) => s.cloud_service_id))
                  setAdjustEnv(String(data.environment_id ?? ''))
                  setAdjustOpen(true)
                }}
              >
                Adjust
              </Button>
            )}
            <Button variant="secondary" onClick={() => navigate('/requests')}>
              Back
            </Button>
            {canDecide && (
              <>
                <Button onClick={() => { setDecision('approve'); setDecisionComment('') }}>
                  {data.status === 'failed' ? 'Retry' : 'Approve'}
                </Button>
                {data.status === 'pending' && (
                  <Button variant="danger" onClick={() => { setDecision('decline'); setDecisionComment('') }}>
                    Decline
                  </Button>
                )}
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
          {isRepo ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <Detail label="Requester">{data.requester}</Detail>
              <Detail label="Project">{data.project ?? '—'}</Detail>
              <Detail label="Repository">{data.repo_name}</Detail>
              <Detail label="Visibility">{data.repo_visibility ?? '—'}</Detail>
              <Detail label="Provider">
                {data.git_provider ? titleCase(data.git_provider) : '—'}
              </Detail>
              <Detail label="Repository URL">
                {data.repo_url ? (
                  <a
                    href={data.repo_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent hover:underline break-all"
                  >
                    {data.repo_url}
                  </a>
                ) : (
                  '—'
                )}
              </Detail>
              <Detail label="Description">{data.repo_description ?? '—'}</Detail>
              <Detail label="Reason">{data.reason}</Detail>
              {data.git_error && (
                <Detail label="Last error">
                  <span className="text-danger-fg">{data.git_error}</span>
                </Detail>
              )}
            </div>
          ) : (
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
          )}
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

      {!isRepo && (
      <>
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
      </>
      )}

      <Card>
        <CardHeader title="Activity" />
        <CardBody>
          <Timeline items={activityItems(data.activity)} />
        </CardBody>
      </Card>

      <Modal
        open={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        title="Adjust before approving"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAdjustOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={adjust.isPending}
              onClick={() => {
                const payload: Record<string, unknown> = {}
                if (adjustEnv && Number(adjustEnv) !== data.environment_id) {
                  payload.environment_id = Number(adjustEnv)
                }
                if (adjustServices) payload.service_ids = adjustServices
                adjust.mutate(payload)
              }}
            >
              {adjust.isPending ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            The requester asked for an outcome, not a machine list. Point this at
            the right environment and choose what actually starts.
          </p>

          <Field label="Environment">
            <Select
              value={adjustEnv || String(data.environment_id ?? '')}
              onChange={(e) => {
                setAdjustEnv(e.target.value)
                // Selections belong to the old environment; start clean.
                setAdjustServices(null)
              }}
            >
              {envData?.environments.map((env) => (
                <option key={env.id} value={env.id}>
                  {env.display_name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Services to act on" hint="Leave all ticked to use the whole environment.">
            <div className="space-y-2 pt-1">
              {envData?.environments
                .find((env) => String(env.id) === (adjustEnv || String(data.environment_id)))
                ?.services.map((svc) => {
                  const selected =
                    adjustServices === null ? true : adjustServices.includes(svc.id)

                  return (
                    <label key={svc.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selected}
                        className="accent-[var(--accent)]"
                        onChange={(e) => {
                          const all = envData!.environments
                            .find((env) => String(env.id) === (adjustEnv || String(data.environment_id)))!
                            .services.map((x) => x.id)
                          const current = adjustServices === null ? all : adjustServices
                          setAdjustServices(
                            e.target.checked
                              ? [...current, svc.id]
                              : current.filter((x) => x !== svc.id),
                          )
                        }}
                      />
                      {svc.name}
                      <span className="text-xs text-text-muted">{svc.type}</span>
                    </label>
                  )
                })}
            </div>
          </Field>
        </div>
      </Modal>

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
        onConfirm={() => data.environment_id != null && stopMutation.mutate(data.environment_id)}
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
              onClick={() => {
                if (!decision) return
                const repoApprove = isRepo && decision === 'approve'
                if (repoApprove && !provider) {
                  notify('Choose a Git provider to create the repo on.', 'danger')
                  return
                }
                decisionMutation.mutate({
                  decision,
                  comment: decisionComment.trim(),
                  provider: repoApprove ? provider : undefined,
                })
              }}
              disabled={decisionMutation.isPending}
            >
              {decisionMutation.isPending
                ? 'Saving…'
                : decision === 'approve'
                  ? isRepo
                    ? 'Create repo'
                    : 'Approve'
                  : 'Decline'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {isRepo && decision === 'approve' && (
            <Field label="Create on">
              <Select value={provider} onChange={(e) => setProvider(e.target.value)}>
                <option value="">
                  {providersQuery.isFetching ? 'Loading…' : 'Select a Git provider…'}
                </option>
                {(providersQuery.data?.providers ?? []).map((p) => (
                  <option key={p} value={p}>
                    {titleCase(p)}
                  </option>
                ))}
              </Select>
              {providersQuery.data && providersQuery.data.providers.length === 0 && (
                <p className="mt-1 text-xs text-danger-fg">
                  No Git provider is configured on the server (set GITHUB_TOKEN or GITLAB_TOKEN).
                </p>
              )}
            </Field>
          )}
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
        </div>
      </Modal>
    </div>
  )
}
