import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../../lib/api'
import { PageHeader, Spinner, ErrorState, EmptyState } from '../../components/ui/Page'
import { Card } from '../../components/ui/Card'
import { Tabs } from '../../components/ui/Tabs'
import { Table, THead, TCell } from '../../components/ui/Table'
import { StatusBadge, Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { Field, Input, Select } from '../../components/ui/Input'
import { useToast } from '../../components/ui/Toast'
import type { TicketsResponse, TicketStatus } from './types'

const TABS = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
]

/** Urgency deliberately does not go through StatusBadge — 'high'/'low' are far
 *  too generic to squat on the shared status→tone map. */
const URGENCY_TONE: Record<string, 'danger' | 'warning' | 'neutral'> = {
  high: 'danger',
  normal: 'neutral',
  low: 'neutral',
}

function age(iso: string | null): string {
  if (!iso) return '—'
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 60) return `${mins}m`
  if (mins < 1440) return `${Math.round(mins / 60)}h`
  return `${Math.round(mins / 1440)}d`
}

export function TicketsPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { notify } = useToast()

  const [status, setStatus] = useState('all')
  const [assignee, setAssignee] = useState('')
  const [term, setTerm] = useState('')
  const [newOpen, setNewOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  const params = new URLSearchParams()
  if (status !== 'all') params.set('status', status)
  if (assignee) params.set('assignee', assignee)
  if (term) params.set('q', term)

  const { data: feature } = useQuery({
    queryKey: ['tickets', 'status'],
    queryFn: () => api.get<TicketStatus>('/tickets/status'),
  })

  const { data, isLoading, isError } = useQuery({
    queryKey: ['tickets', params.toString()],
    queryFn: () => api.get<TicketsResponse>(`/tickets?${params.toString()}`),
    refetchInterval: 30_000,
  })

  // Setup helpers. Admin-only server-side; the buttons simply 403 otherwise, so
  // they are shown whenever intake is unconfigured or someone wants a manual poll.
  const testIntake = useMutation({
    mutationFn: () => api.post<{ reachable: boolean; mailbox?: string }>(
      '/tickets/intake/test'),
    onSuccess: (r) =>
      notify(`Mailbox reachable: ${r.mailbox ?? 'ok'}`, 'success'),
    onError: (err) =>
      notify(err instanceof ApiError ? err.message : 'Could not reach the mailbox',
             'danger'),
  })

  const runIntake = useMutation({
    mutationFn: () => api.post<{ created: number; fetched: number }>(
      '/tickets/intake/run'),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['tickets'] })
      notify(`Polled ${r.fetched} message(s); created ${r.created} ticket(s).`,
             'success')
    },
    onError: (err) =>
      notify(err instanceof ApiError ? err.message : 'Poll failed', 'danger'),
  })

  const create = useMutation({
    mutationFn: () => api.post('/tickets', { title: title.trim(), body: body.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets'] })
      notify('Ticket raised.', 'success')
      setNewOpen(false)
      setTitle('')
      setBody('')
    },
    onError: (err) =>
      notify(err instanceof ApiError ? err.message : 'Could not raise the ticket', 'danger'),
  })

  if (isLoading) return <Spinner label="Loading tickets…" />
  if (isError || !data) return <ErrorState message="Could not load the ticket queue." />

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tickets"
        subtitle="Requests that arrive as email, plus anything raised by hand."
        action={
          <div className="flex gap-2">
            {feature?.intake_enabled && (
              <>
                <Button variant="ghost" size="sm" disabled={testIntake.isPending}
                        onClick={() => testIntake.mutate()}>
                  Test mailbox
                </Button>
                <Button variant="secondary" size="sm" disabled={runIntake.isPending}
                        onClick={() => runIntake.mutate()}>
                  {runIntake.isPending ? 'Polling…' : 'Poll now'}
                </Button>
              </>
            )}
            <Button onClick={() => setNewOpen(true)}>New Ticket</Button>
          </div>
        }
      />

      {/* The failure mode that otherwise presents as "email doesn't work and
          nobody knows why". */}
      {feature && !feature.intake_enabled && (
        <div className="rounded-[var(--radius-sm)] border border-warning-border bg-warning-bg px-4 py-3 text-sm text-warning-fg">
          Email intake is not configured, so nothing is being polled. Tickets can
          still be raised by hand.
        </div>
      )}

      <Tabs
        tabs={TABS.map((t) => ({
          ...t,
          label: t.value === 'all' ? t.label : `${t.label} (${data.counts[t.value] ?? 0})`,
        }))}
        active={status}
        onChange={setStatus}
      />

      <div className="flex flex-wrap gap-3">
        <Select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
          <option value="">Anyone</option>
          <option value="me">Assigned to me</option>
          <option value="unassigned">Unassigned</option>
        </Select>
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search title, reference or sender…"
        />
      </div>

      <Card>
        {data.tickets.length === 0 ? (
          <EmptyState message="Nothing in the queue." />
        ) : (
          <Table>
            <THead columns={['Ref', 'Title', 'From', 'Category', 'Urgency', 'Assignee', 'Status', 'Age']} />
            <tbody>
              {data.tickets.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => navigate(`/tickets/${t.id}`)}
                  className="cursor-pointer border-t border-border-light hover:bg-hover"
                >
                  <TCell className="font-mono text-xs text-text-secondary">
                    {t.reference ?? '—'}
                  </TCell>
                  <TCell className="font-medium">{t.title}</TCell>
                  <TCell className="text-text-secondary">{t.requester}</TCell>
                  <TCell className="text-text-secondary capitalize">{t.category ?? '—'}</TCell>
                  <TCell>
                    {t.urgency ? (
                      <Badge tone={URGENCY_TONE[t.urgency] ?? 'neutral'}>{t.urgency}</Badge>
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </TCell>
                  <TCell className="text-text-secondary">{t.assignee ?? 'Unassigned'}</TCell>
                  <TCell><StatusBadge status={t.status} /></TCell>
                  <TCell className="text-text-secondary">{age(t.created_at)}</TCell>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        title="New ticket"
        footer={
          <>
            <Button variant="secondary" onClick={() => setNewOpen(false)}>Cancel</Button>
            <Button disabled={!title.trim() || create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? 'Raising…' : 'Raise ticket'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)}
                   placeholder="What is needed?" />
          </Field>
          <Field label="Detail">
            <textarea
              className="w-full min-h-24 rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-border focus:outline-none focus:ring-2 focus:ring-accent/30"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Any context that helps."
            />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
