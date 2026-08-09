import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Copy, Eye, EyeOff, Lock } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import type { ProjectSecret } from '../admin/adminTypes'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardBody } from '../../components/ui/Card'
import { Field, Select } from '../../components/ui/Input'
import { Table, THead, TRow, TCell } from '../../components/ui/Table'
import { EmptyState, ErrorState, PageHeader, Spinner } from '../../components/ui/Page'
import { useToast } from '../../components/ui/Toast'

interface ProjectBrief {
  id: number
  name: string
}

interface SecretsResponse {
  secrets: ProjectSecret[]
  can_reveal: boolean
}

export function SecretsPage() {
  const { notify } = useToast()
  const [projectId, setProjectId] = useState<number | null>(null)
  /** Revealed values, held in memory only and cleared whenever we switch project. */
  const [revealed, setRevealed] = useState<Record<number, string>>({})
  const [revealing, setRevealing] = useState<number | null>(null)

  // Membership-scoped by the backend, so a developer only ever picks from
  // projects they belong to.
  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get<{ projects: ProjectBrief[] }>('/projects'),
  })
  const projects = projectsQuery.data?.projects ?? []

  useEffect(() => {
    if (projectId === null && projects.length > 0) setProjectId(projects[0].id)
  }, [projects, projectId])

  const secretsQuery = useQuery({
    queryKey: ['secrets', projectId],
    queryFn: () => api.get<SecretsResponse>(`/projects/${projectId}/secrets`),
    enabled: projectId !== null,
  })

  function selectProject(id: number) {
    // Don't carry one project's plaintext over to another's screen.
    setRevealed({})
    setProjectId(id)
  }

  async function reveal(secret: ProjectSecret) {
    setRevealing(secret.id)
    try {
      const res = await api.post<{ value: string }>(
        `/projects/${projectId}/secrets/${secret.id}/reveal`,
      )
      setRevealed((prev) => ({ ...prev, [secret.id]: res.value }))
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Could not reveal that secret.', 'danger')
    } finally {
      setRevealing(null)
    }
  }

  function hide(id: number) {
    setRevealed((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value)
      notify('Copied to clipboard.', 'success')
    } catch {
      notify('Could not copy — select the value and copy it manually.', 'info')
    }
  }

  if (projectsQuery.isLoading) return <Spinner />
  if (projectsQuery.error) return <ErrorState message="Could not load your projects." />
  if (projects.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Secrets" />
        <EmptyState message="You're not a member of any project yet. Ask an admin to add you." />
      </div>
    )
  }

  const secrets = secretsQuery.data?.secrets ?? []
  const canReveal = secretsQuery.data?.can_reveal ?? false

  return (
    <div className="space-y-6">
      <PageHeader
        title="Secrets"
        subtitle="Credentials for the projects you belong to. Every reveal is recorded."
        action={
          <Field label="Project">
            <Select
              value={projectId ?? ''}
              onChange={(e) => selectProject(Number(e.target.value))}
              className="w-auto"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        }
      />

      {!canReveal && secrets.length > 0 && (
        <div className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-info-border bg-info-bg px-3 py-2 text-sm text-info-fg">
          <Lock size={15} className="shrink-0" />
          You can see which secrets exist, but not their values. Ask an admin to grant
          you access to this project's secrets.
        </div>
      )}

      <Card>
        <CardBody className="p-0">
          {secretsQuery.isLoading ? (
            <Spinner />
          ) : secretsQuery.error ? (
            <ErrorState message="Could not load secrets for this project." />
          ) : secrets.length === 0 ? (
            <EmptyState message="No secrets stored for this project." />
          ) : (
            <Table>
              <THead columns={['Key', 'Scope', 'Value', 'Description', '']} />
              <tbody>
                {secrets.map((s) => {
                  const value = revealed[s.id]
                  return (
                    <TRow key={s.id}>
                      <TCell className="font-mono font-medium">{s.key}</TCell>
                      <TCell>
                        <Badge tone={s.environment_id ? 'info' : 'neutral'}>{s.scope}</Badge>
                      </TCell>
                      <TCell className="font-mono text-text-secondary">
                        {value !== undefined ? (
                          <span className="break-all">{value}</span>
                        ) : (
                          '••••••••••••'
                        )}
                      </TCell>
                      <TCell className="text-text-secondary">{s.description ?? '—'}</TCell>
                      <TCell className="text-right">
                        {!s.can_reveal ? (
                          <span className="text-xs text-text-muted">No access</span>
                        ) : value !== undefined ? (
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="secondary" onClick={() => copy(value)}>
                              <Copy size={14} /> Copy
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => hide(s.id)}>
                              <EyeOff size={14} /> Hide
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={revealing === s.id}
                            onClick={() => reveal(s)}
                          >
                            <Eye size={14} /> {revealing === s.id ? 'Revealing…' : 'Reveal'}
                          </Button>
                        )}
                      </TCell>
                    </TRow>
                  )
                })}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
