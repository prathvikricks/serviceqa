import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { Field, Input, Select } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/ui/Toast'
import { PageHeader } from '../../components/ui/Page'
import type { ProjectsResponse, RequestDetail } from './types'

type Visibility = 'private' | 'public'

const REPO_NAME_RE = /^[A-Za-z0-9._-]{1,120}$/

export function NewRepoRequestPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { notify } = useToast()

  // Set when we arrived from the chat assistant with a validated draft.
  const { state } = useLocation() as {
    state?: { prefill?: Record<string, unknown>; conversationId?: number }
  }
  const prefill = state?.prefill
  const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))

  const [repoName, setRepoName] = useState(str(prefill?.repo_name))
  const [description, setDescription] = useState(str(prefill?.repo_description))
  const [visibility, setVisibility] = useState<Visibility>(
    (prefill?.repo_visibility as Visibility) ?? 'private')
  const [projectId, setProjectId] = useState(str(prefill?.project_id))

  const { data: projectsData } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get<ProjectsResponse>('/projects'),
  })

  const mutation = useMutation({
    mutationFn: () =>
      api.post<RequestDetail>('/requests', {
        request_type: 'repo',
        repo_name: repoName.trim(),
        repo_description: description.trim(),
        repo_visibility: visibility,
        project_id: projectId ? Number(projectId) : null,
        conversation_id: state?.conversationId,
      }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['requests'] })
      notify('Repo request created', 'success')
      navigate(`/requests/${created.id}`)
    },
    onError: (err) =>
      notify(err instanceof ApiError ? err.message : 'Failed to create request', 'danger'),
  })

  const nameValid = REPO_NAME_RE.test(repoName.trim())
  const canSubmit = nameValid && !mutation.isPending

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Repo Request"
        subtitle="Request a Git repository. An approver picks the provider and creates it."
      />

      <Card className="max-w-2xl">
        <CardHeader title="Repository details" />
        <CardBody>
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault()
              if (canSubmit) mutation.mutate()
            }}
          >
            <Field
              label="Repository name"
              hint="Letters, numbers, dot, dash, underscore."
            >
              <Input
                value={repoName}
                onChange={(e) => setRepoName(e.target.value)}
                placeholder="my-service"
              />
              {repoName.trim().length > 0 && !nameValid && (
                <p className="mt-1 text-xs text-danger-fg">
                  Only letters, numbers, dot, dash and underscore are allowed.
                </p>
              )}
            </Field>

            <Field label="Description">
              <textarea
                className="w-full min-h-24 rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-border focus:outline-none focus:ring-2 focus:ring-accent/30"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this repository for?"
              />
            </Field>

            <Field label="Visibility">
              <div className="flex gap-4 pt-1">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="visibility"
                    value="private"
                    checked={visibility === 'private'}
                    onChange={() => setVisibility('private')}
                  />
                  Private
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="visibility"
                    value="public"
                    checked={visibility === 'public'}
                    onChange={() => setVisibility('public')}
                  />
                  Public
                </label>
              </div>
            </Field>

            <Field label="Project / team (optional)">
              <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">No project link</option>
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
              <Button type="submit" disabled={!canSubmit}>
                {mutation.isPending ? 'Creating…' : 'Create Request'}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  )
}
