import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { Badge, StatusBadge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Field, Input, Select } from '../../components/ui/Input'
import { Modal, ConfirmDialog } from '../../components/ui/Modal'
import { Table, THead, TRow, TCell } from '../../components/ui/Table'
import { PageHeader, Spinner, ErrorState, EmptyState } from '../../components/ui/Page'
import { useToast } from '../../components/ui/Toast'
import type {
  AdminEnvironment,
  AdminMeta,
  AdminProjectDetail,
  AdminService,
  AdminUser,
  DiscoveredResource,
  ProjectSecret,
  ResourceGroup,
} from './adminTypes'

interface SecretForm {
  key: string
  value: string
  description: string
  /** '' means project-wide (no environment pin). */
  environment_id: string
}

const EMPTY_SECRET: SecretForm = { key: '', value: '', description: '', environment_id: '' }

interface EnvForm {
  name: string
  display_name: string
  region: string
  resource_group: string
  description: string
}

const EMPTY_ENV: EnvForm = {
  name: '',
  display_name: '',
  region: '',
  resource_group: '',
  description: '',
}

interface ServiceForm {
  name: string
  service_type: string
  cloud_resource_id: string
  hourly_cost: string
}

export function ProjectDetailPage() {
  const { id } = useParams()
  const qc = useQueryClient()
  const { notify } = useToast()

  const projectKey = ['admin', 'projects', id]

  const { data: project, isLoading, error } = useQuery({
    queryKey: projectKey,
    queryFn: () => api.get<AdminProjectDetail>(`/admin/projects/${id}`),
  })

  const { data: meta } = useQuery({
    queryKey: ['admin', 'meta'],
    queryFn: () => api.get<AdminMeta>('/admin/meta'),
  })

  const { data: usersData } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => api.get<{ users: AdminUser[] }>('/admin/users'),
  })

  // --- Environment modals ---------------------------------------------------
  const [envModal, setEnvModal] = useState<{ env: AdminEnvironment | null } | null>(null)
  const [envForm, setEnvForm] = useState<EnvForm>(EMPTY_ENV)
  const [envDelete, setEnvDelete] = useState<AdminEnvironment | null>(null)

  const openEnvCreate = () => {
    setEnvForm(EMPTY_ENV)
    setEnvModal({ env: null })
  }
  const openEnvEdit = (env: AdminEnvironment) => {
    setEnvForm({
      name: env.name,
      display_name: env.display_name,
      region: env.region ?? '',
      resource_group: env.resource_group ?? '',
      description: '',
    })
    setEnvModal({ env })
  }

  const saveEnv = useMutation({
    mutationFn: (body: EnvForm) =>
      envModal?.env
        ? api.put(`/admin/projects/${id}/environments/${envModal.env.id}`, body)
        : api.post(`/admin/projects/${id}/environments`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKey })
      notify(envModal?.env ? 'Environment updated.' : 'Environment added.', 'success')
      setEnvModal(null)
    },
    onError: (err: Error) => notify(err.message, 'danger'),
  })

  const deleteEnv = useMutation({
    mutationFn: (eid: number) => api.delete(`/admin/projects/${id}/environments/${eid}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKey })
      notify('Environment deleted.', 'success')
      setEnvDelete(null)
    },
    onError: (err: Error) => notify(err.message, 'danger'),
  })

  // --- Secrets --------------------------------------------------------------
  const secretsQuery = useQuery({
    queryKey: ['secrets', id],
    queryFn: () => api.get<{ secrets: ProjectSecret[] }>(`/projects/${id}/secrets`),
  })
  const secrets = secretsQuery.data?.secrets ?? []

  const [secretModal, setSecretModal] = useState<{ secret: ProjectSecret | null } | null>(null)
  const [secretForm, setSecretForm] = useState<SecretForm>(EMPTY_SECRET)
  const [secretDelete, setSecretDelete] = useState<ProjectSecret | null>(null)
  const setSecretField = (k: keyof SecretForm, v: string) =>
    setSecretForm((f) => ({ ...f, [k]: v }))

  function openSecret(secret: ProjectSecret | null) {
    setSecretForm(
      secret
        ? {
            key: secret.key,
            // Never prefilled — the API doesn't hand values back to the form,
            // and blank on save means "keep the stored one".
            value: '',
            description: secret.description ?? '',
            environment_id: secret.environment_id ? String(secret.environment_id) : '',
          }
        : EMPTY_SECRET,
    )
    setSecretModal({ secret })
  }

  const saveSecret = useMutation({
    mutationFn: () => {
      const body = {
        key: secretForm.key,
        value: secretForm.value,
        description: secretForm.description,
        environment_id: secretForm.environment_id || null,
      }
      const existing = secretModal?.secret
      return existing
        ? api.put(`/admin/projects/${id}/secrets/${existing.id}`, body)
        : api.post(`/admin/projects/${id}/secrets`, body)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['secrets', id] })
      notify(secretModal?.secret ? 'Secret updated.' : 'Secret added.', 'success')
      setSecretModal(null)
    },
    onError: (err: Error) => notify(err.message, 'danger'),
  })

  const deleteSecret = useMutation({
    mutationFn: (sid: number) => api.delete(`/admin/projects/${id}/secrets/${sid}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['secrets', id] })
      notify('Secret deleted.', 'success')
      setSecretDelete(null)
    },
    onError: (err: Error) => notify(err.message, 'danger'),
  })

  // --- Members --------------------------------------------------------------
  const [memberModal, setMemberModal] = useState(false)
  const [memberUsername, setMemberUsername] = useState('')
  const [memberDelete, setMemberDelete] = useState<{ id: number; username: string } | null>(null)

  const addMember = useMutation({
    mutationFn: (username: string) =>
      api.post(`/admin/projects/${id}/members`, { username }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKey })
      notify('Member added.', 'success')
      setMemberModal(false)
      setMemberUsername('')
    },
    onError: (err: Error) => notify(err.message, 'danger'),
  })

  const setMemberSecrets = useMutation({
    mutationFn: ({ mid, can }: { mid: number; can: boolean }) =>
      api.put(`/admin/projects/${id}/members/${mid}`, { can_view_secrets: can }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'projects', id] })
      notify('Permission updated.', 'success')
    },
    onError: (err: Error) => notify(err.message, 'danger'),
  })

  const setMemberRole = useMutation({
    mutationFn: ({ mid, project_role }: { mid: number; project_role: string }) =>
      api.put(`/admin/projects/${id}/members/${mid}`, { project_role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'projects', id] })
      notify('Member role updated.', 'success')
    },
    onError: (err: Error) => notify(err.message, 'danger'),
  })

  const removeMember = useMutation({
    mutationFn: (mid: number) => api.delete(`/admin/projects/${id}/members/${mid}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKey })
      notify('Member removed.', 'success')
      setMemberDelete(null)
    },
    onError: (err: Error) => notify(err.message, 'danger'),
  })

  if (isLoading) return <Spinner />
  if (error || !project) return <ErrorState message="Failed to load project." />

  const setEnv = (key: keyof EnvForm, value: string) =>
    setEnvForm((f) => ({ ...f, [key]: value }))

  // Eligible to add: active developers not already members of this project.
  const memberUsernames = new Set(project.members.map((m) => m.username))
  const eligibleDevelopers = (usersData?.users ?? []).filter(
    (u) => u.role === 'developer' && u.is_active && !memberUsernames.has(u.username),
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title={project.name}
        subtitle={project.description ?? undefined}
        action={
          <div className="flex items-center gap-2">
            <Badge tone="info">{project.cloud_provider}</Badge>
            <Link to={`/admin/projects/${project.id}/costs`}>
              <Button variant="secondary" size="sm">
                View costs
              </Button>
            </Link>
            <Link to={`/admin/projects/${project.id}/edit`}>
              <Button variant="secondary" size="sm">
                Edit Project
              </Button>
            </Link>
          </div>
        }
      />

      {/* Environments ------------------------------------------------------ */}
      <Card>
        <CardHeader
          title="Environments"
          action={
            <Button size="sm" onClick={openEnvCreate}>
              Add Environment
            </Button>
          }
        />
        <CardBody className="space-y-4">
          {project.environments.length === 0 ? (
            <EmptyState message="No environments yet." />
          ) : (
            project.environments.map((env) => (
              <EnvironmentBlock
                key={env.id}
                env={env}
                projectId={project.id}
                provider={project.cloud_provider}
                defaultRegion={
                  (project.provider_config as { region?: string } | undefined)?.region ?? 'us-east-1'
                }
                meta={meta}
                onEdit={() => openEnvEdit(env)}
                onDelete={() => setEnvDelete(env)}
              />
            ))
          )}
        </CardBody>
      </Card>

      {/* Secrets ----------------------------------------------------------- */}
      <Card>
        <CardHeader
          title="Secrets"
          action={
            <Button size="sm" onClick={() => openSecret(null)}>
              Add Secret
            </Button>
          }
        />
        {secrets.length === 0 ? (
          <CardBody>
            <EmptyState message="No secrets stored for this project." />
          </CardBody>
        ) : (
          <Table>
            <THead columns={['Key', 'Scope', 'Description', 'Added by', '']} />
            <tbody>
              {secrets.map((sec) => (
                <TRow key={sec.id}>
                  <TCell className="font-mono font-medium">{sec.key}</TCell>
                  <TCell>
                    <Badge tone={sec.environment_id ? 'info' : 'neutral'}>{sec.scope}</Badge>
                  </TCell>
                  <TCell className="text-text-secondary">{sec.description ?? '—'}</TCell>
                  <TCell className="text-text-secondary">{sec.created_by ?? '—'}</TCell>
                  <TCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="secondary" onClick={() => openSecret(sec)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setSecretDelete(sec)}>
                        Delete
                      </Button>
                    </div>
                  </TCell>
                </TRow>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {/* Members ----------------------------------------------------------- */}
      <Card>
        <CardHeader
          title="Members"
          action={
            <Button size="sm" onClick={() => setMemberModal(true)}>
              Add Member
            </Button>
          }
        />
        {project.members.length === 0 ? (
          <CardBody>
            <EmptyState message="No members yet." />
          </CardBody>
        ) : (
          <Table>
            <THead
              columns={['Username', 'Email', 'Role', 'On this project', 'Secrets', 'Added by', '']}
            />
            <tbody>
              {project.members.map((m) => (
                <TRow key={m.id}>
                  <TCell className="font-medium">{m.username}</TCell>
                  <TCell className="text-text-secondary">{m.email}</TCell>
                  <TCell>
                    <Badge tone="neutral">{m.role}</Badge>
                  </TCell>
                  <TCell>
                    {/* Approval routing: only a project-devops (or an admin)
                        sees this project's requests in their inbox. */}
                    <Select
                      value={m.project_role}
                      disabled={setMemberRole.isPending}
                      onChange={(e) =>
                        setMemberRole.mutate({ mid: m.id, project_role: e.target.value })
                      }
                    >
                      <option value="developer">Developer</option>
                      <option value="devops">DevOps (approves)</option>
                    </Select>
                  </TCell>
                  <TCell>
                    {/* DevOps and admins can always read secrets, so the flag
                        is only meaningful for developers. */}
                    {m.role === 'developer' ? (
                      <label className="flex items-center gap-2 text-xs text-text-secondary">
                        <input
                          type="checkbox"
                          checked={m.can_view_secrets}
                          disabled={setMemberSecrets.isPending}
                          onChange={(e) =>
                            setMemberSecrets.mutate({ mid: m.id, can: e.target.checked })
                          }
                          className="accent-[var(--accent)]"
                        />
                        Can view
                      </label>
                    ) : (
                      <span className="text-xs text-text-muted">Always</span>
                    )}
                  </TCell>
                  <TCell className="text-text-secondary">{m.added_by ?? '—'}</TCell>
                  <TCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setMemberDelete({ id: m.id, username: m.username })}
                    >
                      Remove
                    </Button>
                  </TCell>
                </TRow>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {/* Environment add/edit modal --------------------------------------- */}
      <Modal
        open={envModal !== null}
        onClose={() => setEnvModal(null)}
        title={envModal?.env ? 'Edit Environment' : 'Add Environment'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEnvModal(null)}>
              Cancel
            </Button>
            <Button disabled={saveEnv.isPending} onClick={() => saveEnv.mutate(envForm)}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Name" hint="Lowercase slug, e.g. staging">
            <Input value={envForm.name} onChange={(e) => setEnv('name', e.target.value)} />
          </Field>
          <Field label="Display Name">
            <Input
              value={envForm.display_name}
              onChange={(e) => setEnv('display_name', e.target.value)}
            />
          </Field>
          <Field label="Region">
            <Input value={envForm.region} onChange={(e) => setEnv('region', e.target.value)} />
          </Field>
          <Field label="Resource Group">
            <Input
              value={envForm.resource_group}
              onChange={(e) => setEnv('resource_group', e.target.value)}
            />
          </Field>
          <Field label="Description">
            <Input
              value={envForm.description}
              onChange={(e) => setEnv('description', e.target.value)}
            />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={envDelete !== null}
        title="Delete environment"
        danger
        confirmLabel="Delete"
        message={
          envDelete
            ? `Delete environment "${envDelete.display_name}" and its services?`
            : ''
        }
        onCancel={() => setEnvDelete(null)}
        onConfirm={() => envDelete && deleteEnv.mutate(envDelete.id)}
      />

      {/* Secret add/edit modal --------------------------------------------- */}
      <Modal
        open={secretModal !== null}
        onClose={() => setSecretModal(null)}
        title={secretModal?.secret ? `Edit ${secretModal.secret.key}` : 'Add Secret'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSecretModal(null)}>
              Cancel
            </Button>
            <Button disabled={saveSecret.isPending} onClick={() => saveSecret.mutate()}>
              {saveSecret.isPending ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Key">
            <Input
              value={secretForm.key}
              onChange={(e) => setSecretField('key', e.target.value)}
              placeholder="DB_PASSWORD"
              maxLength={100}
              autoFocus
            />
          </Field>
          <Field
            label="Value"
            hint={
              secretModal?.secret
                ? 'Leave blank to keep the stored value.'
                : 'Encrypted at rest; only members you grant access can reveal it.'
            }
          >
            <Input
              type="password"
              value={secretForm.value}
              onChange={(e) => setSecretField('value', e.target.value)}
              autoComplete="new-password"
            />
          </Field>
          <Field
            label="Scope"
            hint="Pin to one environment when the value differs per environment."
          >
            <Select
              value={secretForm.environment_id}
              onChange={(e) => setSecretField('environment_id', e.target.value)}
            >
              <option value="">All environments</option>
              {project.environments.map((env) => (
                <option key={env.id} value={env.id}>
                  {env.display_name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Description">
            <Input
              value={secretForm.description}
              onChange={(e) => setSecretField('description', e.target.value)}
            />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={secretDelete !== null}
        title="Delete secret"
        message={`Delete "${secretDelete?.key}"? Anyone relying on it will lose access.`}
        confirmLabel="Delete"
        danger
        pending={deleteSecret.isPending}
        onCancel={() => setSecretDelete(null)}
        onConfirm={() => secretDelete && deleteSecret.mutate(secretDelete.id)}
      />

      {/* Member add modal -------------------------------------------------- */}
      <Modal
        open={memberModal}
        onClose={() => setMemberModal(false)}
        title="Add Member"
        footer={
          <>
            <Button variant="secondary" onClick={() => setMemberModal(false)}>
              Cancel
            </Button>
            <Button
              disabled={addMember.isPending || !memberUsername}
              onClick={() => addMember.mutate(memberUsername.trim())}
            >
              Add
            </Button>
          </>
        }
      >
        {eligibleDevelopers.length === 0 ? (
          <EmptyState message="No eligible developers to add." />
        ) : (
          <Field label="Developer" hint="Only active developers can be added.">
            <Select
              value={memberUsername}
              onChange={(e) => setMemberUsername(e.target.value)}
            >
              <option value="">Select a developer…</option>
              {eligibleDevelopers.map((u) => (
                <option key={u.id} value={u.username}>
                  {u.username} ({u.email})
                </option>
              ))}
            </Select>
          </Field>
        )}
      </Modal>

      <ConfirmDialog
        open={memberDelete !== null}
        title="Remove member"
        danger
        confirmLabel="Remove"
        message={memberDelete ? `Remove ${memberDelete.username} from this project?` : ''}
        onCancel={() => setMemberDelete(null)}
        onConfirm={() => memberDelete && removeMember.mutate(memberDelete.id)}
      />
    </div>
  )
}

// --------------------------------------------------------------------------
// Environment block — collapsible services manager for one environment.
// --------------------------------------------------------------------------

const AWS_REGIONS = [
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2', 'ca-central-1',
  'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1', 'eu-north-1',
  'ap-south-1', 'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1',
  'ap-northeast-2', 'sa-east-1',
]

function EnvironmentBlock({
  env,
  projectId,
  provider,
  defaultRegion,
  meta,
  onEdit,
  onDelete,
}: {
  env: AdminEnvironment
  projectId: number
  provider: string
  defaultRegion: string
  meta: AdminMeta | undefined
  onEdit: () => void
  onDelete: () => void
}) {
  const qc = useQueryClient()
  const { notify } = useToast()
  const [open, setOpen] = useState(false)
  const isAzure = provider === 'azure'
  // Discovery picker state.
  const [manualId, setManualId] = useState(false)
  const [resourceGroup, setResourceGroup] = useState('')
  const [region, setRegion] = useState(defaultRegion || 'us-east-1')

  const servicesKey = ['admin', 'environments', env.id, 'services']
  const { data, isLoading } = useQuery({
    queryKey: servicesKey,
    queryFn: () => api.get<{ services: AdminService[] }>(`/admin/environments/${env.id}/services`),
    enabled: open,
  })

  const serviceTypes = meta?.service_types?.[provider] ?? []
  const labels = meta?.service_type_labels ?? {}

  const [svcModal, setSvcModal] = useState<{ svc: AdminService | null } | null>(null)
  const [svcForm, setSvcForm] = useState<ServiceForm>({
    name: '',
    service_type: '',
    cloud_resource_id: '',
    hourly_cost: '0',
  })
  const [svcDelete, setSvcDelete] = useState<AdminService | null>(null)

  const openSvcCreate = () => {
    setSvcForm({
      name: '',
      service_type: serviceTypes[0] ?? '',
      cloud_resource_id: '',
      hourly_cost: '0',
    })
    setManualId(false) // start on the live picker for new services
    setResourceGroup('')
    setRegion(defaultRegion || 'us-east-1')
    setSvcModal({ svc: null })
  }
  const openSvcEdit = (svc: AdminService) => {
    setSvcForm({
      name: svc.name,
      service_type: svc.service_type,
      cloud_resource_id: svc.cloud_resource_id,
      hourly_cost: String(svc.hourly_cost),
    })
    setManualId(true) // editing: show the existing ID, don't force a re-discover
    setResourceGroup('')
    setSvcModal({ svc })
  }

  // Live-resource discovery from the project's cloud account (restores the
  // picker the Jinja UI had). Azure needs a resource group first.
  const rgroups = useQuery({
    queryKey: ['admin', 'resource-groups', projectId],
    queryFn: () =>
      api.get<{ resource_groups: ResourceGroup[] }>(`/projects/${projectId}/resource-groups`),
    enabled: svcModal?.svc == null && svcModal !== null && isAzure,
    retry: false,
  })
  const discover = useQuery({
    queryKey: ['admin', 'discover', projectId, svcForm.service_type, region, resourceGroup],
    queryFn: () => {
      const params = new URLSearchParams()
      if (!isAzure && region) params.set('region', region)
      if (isAzure && resourceGroup) params.set('resource_group', resourceGroup)
      const qs = params.toString()
      return api.get<{ resources: DiscoveredResource[] }>(
        `/projects/${projectId}/discover/${svcForm.service_type}${qs ? `?${qs}` : ''}`,
      )
    },
    enabled:
      svcModal !== null &&
      svcModal.svc == null &&
      !manualId &&
      !!svcForm.service_type &&
      (!isAzure || !!resourceGroup),
    retry: false,
  })

  const saveSvc = useMutation({
    mutationFn: (form: ServiceForm) => {
      const body = {
        name: form.name,
        service_type: form.service_type,
        cloud_resource_id: form.cloud_resource_id,
        hourly_cost: Number(form.hourly_cost) || 0,
        // Remember the region a resource lives in so start/stop targets it.
        region: isAzure ? undefined : region,
      }
      return svcModal?.svc
        ? api.put(`/admin/services/${svcModal.svc.id}`, body)
        : api.post(`/admin/environments/${env.id}/services`, body)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: servicesKey })
      notify(svcModal?.svc ? 'Service updated.' : 'Service added.', 'success')
      setSvcModal(null)
    },
    onError: (err: Error) => notify(err.message, 'danger'),
  })

  const toggleSvc = useMutation({
    mutationFn: (sid: number) => api.post(`/admin/services/${sid}/toggle`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: servicesKey })
      notify('Service updated.', 'success')
    },
    onError: (err: Error) => notify(err.message, 'danger'),
  })

  const deleteSvc = useMutation({
    mutationFn: (sid: number) => api.delete(`/admin/services/${sid}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: servicesKey })
      notify('Service deleted.', 'success')
      setSvcDelete(null)
    },
    onError: (err: Error) => notify(err.message, 'danger'),
  })

  const setSvc = (key: keyof ServiceForm, value: string) =>
    setSvcForm((f) => ({ ...f, [key]: value }))

  return (
    <div className="rounded-[var(--radius-md)] border border-border">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <button
          type="button"
          className="flex items-center gap-2 text-left"
          onClick={() => setOpen((o) => !o)}
        >
          <span className="text-text-muted">{open ? '▾' : '▸'}</span>
          <span className="text-sm font-semibold text-text-primary">{env.display_name}</span>
          <span className="text-xs text-text-muted">({env.name})</span>
          <Badge tone="neutral">{env.service_count} services</Badge>
        </button>
        <div className="flex items-center gap-2">
          {env.region && <span className="text-xs text-text-muted">{env.region}</span>}
          <Button variant="ghost" size="sm" onClick={onEdit}>
            Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete}>
            Delete
          </Button>
        </div>
      </div>

      {open && (
        <div className="border-t border-border-light px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-text-muted">
              Services
            </span>
            <Button size="sm" variant="secondary" onClick={openSvcCreate}>
              Add Service
            </Button>
          </div>

          {isLoading ? (
            <Spinner />
          ) : !data || data.services.length === 0 ? (
            <EmptyState message="No services." />
          ) : (
            <Table>
              <THead columns={['Name', 'Type', 'Resource ID', 'Cost/hr', 'Status', '']} />
              <tbody>
                {data.services.map((svc) => (
                  <TRow key={svc.id}>
                    <TCell className="font-medium">{svc.name}</TCell>
                    <TCell className="text-text-secondary">
                      {labels[svc.service_type] ?? svc.service_type}
                    </TCell>
                    <TCell className="font-mono text-xs text-text-secondary">
                      {svc.cloud_resource_id}
                    </TCell>
                    <TCell className="text-text-secondary">${svc.hourly_cost}</TCell>
                    <TCell>
                      <StatusBadge status={svc.current_status} />
                    </TCell>
                    <TCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openSvcEdit(svc)}>
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleSvc.mutate(svc.id)}
                        >
                          {svc.is_active ? 'Disable' : 'Enable'}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setSvcDelete(svc)}>
                          Delete
                        </Button>
                      </div>
                    </TCell>
                  </TRow>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      )}

      {/* Service add/edit modal */}
      <Modal
        open={svcModal !== null}
        onClose={() => setSvcModal(null)}
        title={svcModal?.svc ? 'Edit Service' : 'Add Service'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSvcModal(null)}>
              Cancel
            </Button>
            <Button disabled={saveSvc.isPending} onClick={() => saveSvc.mutate(svcForm)}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Name">
            <Input value={svcForm.name} onChange={(e) => setSvc('name', e.target.value)} />
          </Field>
          <Field label="Service Type">
            <Select
              value={svcForm.service_type}
              onChange={(e) => setSvc('service_type', e.target.value)}
            >
              {serviceTypes.map((t) => (
                <option key={t} value={t}>
                  {labels[t] ?? t}
                </option>
              ))}
            </Select>
          </Field>
          {/* AWS: pick the region to discover in (resources are per-region). */}
          {!isAzure && !svcModal?.svc && !manualId && (
            <Field label="Region" hint="Resources are listed from this region.">
              <Select value={region} onChange={(e) => setRegion(e.target.value)}>
                {AWS_REGIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {/* Azure: pick a resource group before discovering. */}
          {isAzure && !svcModal?.svc && (
            <Field label="Resource group">
              <Select value={resourceGroup} onChange={(e) => setResourceGroup(e.target.value)}>
                <option value="">
                  {rgroups.isFetching ? 'Loading…' : 'Select a resource group…'}
                </option>
                {(rgroups.data?.resource_groups ?? []).map((g) => (
                  <option key={g.name} value={g.name}>
                    {g.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <Field label="Cloud resource">
            {manualId ? (
              <Input
                placeholder="Resource ID (e.g. i-0abc…)"
                value={svcForm.cloud_resource_id}
                onChange={(e) => setSvc('cloud_resource_id', e.target.value)}
              />
            ) : isAzure && !resourceGroup ? (
              <p className="text-xs text-text-muted">Select a resource group to list resources.</p>
            ) : discover.isFetching ? (
              <Spinner label="Reading the account…" />
            ) : discover.error ? (
              <div className="rounded-[var(--radius-sm)] border border-danger-border bg-danger-bg px-3 py-2 text-xs text-danger-fg">
                Couldn&rsquo;t read the account: {(discover.error as Error).message}
              </div>
            ) : (discover.data?.resources.length ?? 0) === 0 ? (
              <EmptyState message="No live resources of this type were found." />
            ) : (
              <div className="max-h-56 divide-y divide-border-light overflow-y-auto rounded-[var(--radius-sm)] border border-border">
                {discover.data!.resources.map((r) => {
                  const selected = svcForm.cloud_resource_id === r.id
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() =>
                        setSvcForm((f) => ({
                          ...f,
                          cloud_resource_id: r.id,
                          name: f.name || r.name,
                        }))
                      }
                      className={
                        'flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors ' +
                        (selected ? 'bg-accent-soft' : 'hover:bg-hover')
                      }
                    >
                      <span className="min-w-0">
                        <span
                          className={
                            'block truncate text-sm font-medium ' +
                            (selected ? 'text-accent' : 'text-text-primary')
                          }
                        >
                          {r.name}
                        </span>
                        <span className="block truncate font-mono text-xs text-text-muted">
                          {r.id}
                          {r.size ? ` · ${r.size}` : ''}
                          {r.location ? ` · ${r.location}` : ''}
                        </span>
                      </span>
                      {r.status && <StatusBadge status={r.status} />}
                    </button>
                  )
                })}
              </div>
            )}
            <button
              type="button"
              onClick={() => setManualId((v) => !v)}
              className="mt-1.5 text-xs font-medium text-accent hover:underline"
            >
              {manualId ? 'Discover from account' : 'Enter ID manually'}
            </button>
          </Field>
          <Field label="Hourly Cost">
            <Input
              type="number"
              step="0.01"
              value={svcForm.hourly_cost}
              onChange={(e) => setSvc('hourly_cost', e.target.value)}
            />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={svcDelete !== null}
        title="Delete service"
        danger
        confirmLabel="Delete"
        message={svcDelete ? `Delete service "${svcDelete.name}"?` : ''}
        onCancel={() => setSvcDelete(null)}
        onConfirm={() => svcDelete && deleteSvc.mutate(svcDelete.id)}
      />
    </div>
  )
}
