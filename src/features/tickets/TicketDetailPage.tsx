import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../../lib/api'
import { PageHeader, Spinner, ErrorState } from '../../components/ui/Page'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { StatusBadge, Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Field, Input, Select } from '../../components/ui/Input'
import { Timeline } from '../../components/ui/Timeline'
import { useToast } from '../../components/ui/Toast'
import type { ProjectsResponse } from '../requests/types'
import type { TicketDetail, TicketStatus } from './types'

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-1.5 text-sm">
      <span className="w-32 shrink-0 text-text-secondary">{label}</span>
      <span className="text-text-primary">{children}</span>
    </div>
  )
}

export function TicketDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { notify } = useToast()

  const [comment, setComment] = useState('')
  const [showFull, setShowFull] = useState(false)

  const key = ['tickets', id]
  const { data, isLoading, isError } = useQuery({
    queryKey: key,
    queryFn: () => api.get<TicketDetail>(`/tickets/${id}`),
  })
  const { data: feature } = useQuery({
    queryKey: ['tickets', 'status'],
    queryFn: () => api.get<TicketStatus>('/tickets/status'),
  })
  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get<ProjectsResponse>('/projects'),
  })

  const patch = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.patch(`/tickets/${id}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets'] })
      notify('Ticket updated.', 'success')
    },
    onError: (err) =>
      notify(err instanceof ApiError ? err.message : 'Update failed', 'danger'),
  })

  const addComment = useMutation({
    mutationFn: () => api.post(`/tickets/${id}/comments`, { body: comment.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key })
      setComment('')
    },
    onError: (err) =>
      notify(err instanceof ApiError ? err.message : 'Could not add the comment', 'danger'),
  })

  if (isLoading) return <Spinner label="Loading ticket…" />
  if (isError || !data) return <ErrorState message="Could not load this ticket." />

  const truncated = data.body.length > 1200 && !showFull

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${data.reference ?? `#${data.id}`} · ${data.title}`}
        subtitle={`From ${data.requester}${data.source === 'email' ? ' by email' : ' (raised by hand)'}`}
        action={<StatusBadge status={data.status} />}
      />

      {data.ack_state === 'failed' && (
        <div className="rounded-[var(--radius-sm)] border border-danger-border bg-danger-bg px-4 py-3 text-sm text-danger-fg">
          The acknowledgement email could not be sent: {data.ack_error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {data.summary && (
            <Card>
              <CardHeader
                title="Summary"
                action={
                  data.enriched_by === 'gemini' ? (
                    <Badge tone="neutral">AI summary</Badge>
                  ) : undefined
                }
              />
              <CardBody>
                <p className="text-sm text-text-secondary">{data.summary}</p>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title={data.source === 'email' ? 'Original email' : 'Detail'} />
            <CardBody>
              <pre className="whitespace-pre-wrap break-words font-sans text-sm text-text-secondary">
                {truncated ? `${data.body.slice(0, 1200)}…` : data.body}
              </pre>
              {data.body.length > 1200 && (
                <Button variant="ghost" size="sm" onClick={() => setShowFull(!showFull)}>
                  {showFull ? 'Show less' : 'Show full email'}
                </Button>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Activity" />
            <CardBody>
              <Timeline
                items={data.comments.map((c) => ({
                  id: String(c.id),
                  title: c.is_system ? c.body : `${c.author ?? 'Someone'}: ${c.body}`,
                  meta: c.created_at ?? undefined,
                  tone: 'default' as const,
                }))}
              />
              <div className="mt-4 flex gap-2">
                <Input
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Add a note…"
                />
                <Button
                  disabled={!comment.trim() || addComment.isPending}
                  onClick={() => addComment.mutate()}
                >
                  Add
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader title="Triage" />
          <CardBody>
            <div className="space-y-4">
              <Field label="Status">
                <Select value={data.status}
                        onChange={(e) => patch.mutate({ status: e.target.value })}>
                  {(feature?.statuses ?? ['open', 'in_progress', 'resolved', 'closed']).map((s) => (
                    <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                  ))}
                </Select>
              </Field>

              <Field label="Project" hint="Optional — most emails don't say.">
                <Select value={data.project_id ?? ''}
                        onChange={(e) => patch.mutate({
                          project_id: e.target.value ? Number(e.target.value) : null,
                        })}>
                  <option value="">No project</option>
                  {projects?.projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </Select>
              </Field>

              <Field label="Urgency">
                <Select value={data.urgency ?? ''}
                        onChange={(e) => patch.mutate({ urgency: e.target.value || null })}>
                  <option value="">—</option>
                  {(feature?.urgencies ?? []).map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </Select>
              </Field>

              <Field label="Category">
                <Select value={data.category ?? ''}
                        onChange={(e) => patch.mutate({ category: e.target.value || null })}>
                  <option value="">—</option>
                  {(feature?.categories ?? []).map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </Select>
              </Field>

              <div className="border-t border-border-light pt-3">
                <Detail label="Assignee">{data.assignee ?? 'Unassigned'}</Detail>
                <Detail label="Raised">{data.created_at ?? '—'}</Detail>
                {data.resolved_at && <Detail label="Resolved">{data.resolved_at}</Detail>}
              </div>

              <Button variant="secondary" size="sm" onClick={() => navigate('/tickets')}>
                Back to queue
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
