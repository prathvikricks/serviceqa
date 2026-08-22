import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { Field, Select } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/ui/Toast'
import { PageHeader } from '../../components/ui/Page'
import type { ProjectsResponse } from '../requests/types'
import type { ChatMessage, Conversation, TurnResult } from './types'

/** Field labels for the draft summary — raw keys read like a database dump. */
const DRAFT_LABELS: Record<string, string> = {
  environment_id: 'Environment',
  service_ids: 'Services',
  action_type: 'Action',
  schedule_type: 'Schedule',
  start_time: 'Starts',
  end_time: 'Ends',
  recurrence_days: 'Repeats on',
  start_hm: 'Start time',
  stop_hm: 'Stop time',
  recur_until: 'Until',
  repo_name: 'Repository',
  repo_description: 'Description',
  repo_visibility: 'Visibility',
  reason: 'Reason',
}

function draftRows(draft: Record<string, unknown>) {
  return Object.entries(draft).filter(([, v]) => v !== null && v !== '' &&
    !(Array.isArray(v) && v.length === 0))
}

export function ChatPage() {
  const navigate = useNavigate()
  const { notify } = useToast()

  const [projectId, setProjectId] = useState('')
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [draft, setDraft] = useState<TurnResult | null>(null)
  const [turns, setTurns] = useState(0)

  const { data: projectsData } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get<ProjectsResponse>('/projects'),
  })

  const start = useMutation({
    mutationFn: (pid: number) =>
      api.post<Conversation>('/chat/conversations', { project_id: pid }),
    onSuccess: (convo) => {
      setConversation(convo)
      setMessages(convo.messages)
      setTurns(convo.turn_count)
    },
    onError: (err) =>
      notify(err instanceof ApiError ? err.message : 'Could not start a chat', 'danger'),
  })

  const send = useMutation({
    mutationFn: (content: string) =>
      api.post<TurnResult>(`/chat/conversations/${conversation!.id}/messages`, { content }),
    onSuccess: (result, content) => {
      // Appended locally rather than refetched — the server has already
      // persisted both halves of the turn.
      setMessages((prev) => [
        ...prev,
        { id: prev.length * 2 + 1, role: 'user', content, draft: null, request_type: null, created_at: null },
        {
          id: prev.length * 2 + 2, role: 'agent', content: result.reply,
          draft: result.draft, request_type: result.request_type, created_at: null,
        },
      ])
      setInput('')
      setTurns((t) => t + 1)
      setDraft(result.ready ? result : null)
    },
    onError: (err) =>
      notify(err instanceof ApiError ? err.message : 'The assistant failed', 'danger'),
  })

  function useDraft() {
    if (!draft?.draft || !conversation) return
    const path = draft.request_type === 'repo' ? '/requests/new/repo' : '/requests/new/service'
    navigate(path, {
      state: {
        prefill: { ...draft.draft, project_id: conversation.project_id },
        conversationId: conversation.id,
      },
    })
  }

  const atTurnCap = conversation !== null && turns >= conversation.max_turns

  if (!conversation) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Describe what you need"
          subtitle="Not sure which environment or window to ask for? Talk it through and we'll draft the request."
        />
        <Card className="max-w-2xl">
          <CardHeader title="Pick a project" />
          <CardBody>
            <form
              className="space-y-5"
              onSubmit={(e) => {
                e.preventDefault()
                if (projectId) start.mutate(Number(projectId))
              }}
            >
              <Field
                label="Project"
                hint="The assistant only sees this project's environments and services."
              >
                <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                  <option value="">Select a project…</option>
                  {projectsData?.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => navigate('/requests/new')}>
                  Back
                </Button>
                <Button type="submit" disabled={!projectId || start.isPending}>
                  {start.isPending ? 'Starting…' : 'Start'}
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Describe what you need"
        subtitle={`Project: ${conversation.project ?? '—'}`}
      />

      <Card className="max-w-2xl">
        <CardHeader title="Conversation" />
        <CardBody>
          <div className="space-y-3">
            {messages.length === 0 && (
              <p className="text-sm text-text-secondary">
                Tell me what you're trying to do — for example, “I need UAT up for a
                client demo next Tuesday morning.”
              </p>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
              >
                <div
                  className={
                    'max-w-[85%] rounded-[var(--radius-sm)] border px-3 py-2 text-sm ' +
                    (m.role === 'user'
                      ? 'border-accent-border bg-accent/10 text-text-primary'
                      : 'border-border bg-surface text-text-secondary')
                  }
                >
                  {m.content}
                </div>
              </div>
            ))}
          </div>

          {atTurnCap ? (
            <p className="mt-5 text-sm text-text-secondary">
              This conversation has gone on long enough. Start a new one, or{' '}
              <button
                type="button"
                className="underline"
                onClick={() => navigate('/requests/new')}
              >
                fill the form directly
              </button>
              .
            </p>
          ) : (
            <form
              className="mt-5 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (input.trim() && !send.isPending) send.mutate(input.trim())
              }}
            >
              <input
                className="flex-1 rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-border focus:outline-none focus:ring-2 focus:ring-accent/30"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Describe what you need…"
                disabled={send.isPending}
              />
              <Button type="submit" disabled={!input.trim() || send.isPending}>
                {send.isPending ? 'Thinking…' : 'Send'}
              </Button>
            </form>
          )}
        </CardBody>
      </Card>

      {draft?.draft && (
        <Card className="max-w-2xl">
          <CardHeader
            title={draft.request_type === 'repo' ? 'Draft repo request' : 'Draft service request'}
          />
          <CardBody>
            <dl className="space-y-2 text-sm">
              {draftRows(draft.draft).map(([key, value]) => (
                <div key={key} className="flex gap-3">
                  <dt className="w-32 shrink-0 text-text-secondary">
                    {DRAFT_LABELS[key] ?? key}
                  </dt>
                  <dd className="text-text-primary">
                    {Array.isArray(value) ? value.join(', ') : String(value)}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="mt-5 flex justify-end">
              <Button type="button" onClick={useDraft}>
                Use this draft
              </Button>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  )
}
