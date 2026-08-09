import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { Field, Input, Select } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { PageHeader, Spinner, ErrorState } from '../../components/ui/Page'
import { useToast } from '../../components/ui/Toast'
import type {
  AdminMeta,
  AdminProjectDetail,
  AwsProviderConfig,
  AzureProviderConfig,
  CloudProvider,
  ProfileMode,
} from './adminTypes'

interface FormState {
  name: string
  description: string
  cloud_provider: CloudProvider
  mode: ProfileMode
  // azure
  azure_tenant_id: string
  azure_client_id: string
  azure_subscription_id: string
  azure_client_secret: string
  // aws
  aws_region: string
  aws_account_id: string
  aws_access_key_id: string
  aws_secret_access_key: string
}

const EMPTY: FormState = {
  name: '',
  description: '',
  cloud_provider: 'aws',
  // New projects default to mock so nobody wires a live account by accident.
  mode: 'mock',
  azure_tenant_id: '',
  azure_client_id: '',
  azure_subscription_id: '',
  azure_client_secret: '',
  aws_region: 'us-east-1',
  aws_account_id: '',
  aws_access_key_id: '',
  aws_secret_access_key: '',
}

export function ProjectFormPage() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { notify } = useToast()
  const [form, setForm] = useState<FormState>(EMPTY)

  const metaQuery = useQuery({
    queryKey: ['admin', 'meta'],
    queryFn: () => api.get<AdminMeta>('/admin/meta'),
  })

  const projectQuery = useQuery({
    queryKey: ['admin', 'projects', id],
    queryFn: () => api.get<AdminProjectDetail>(`/admin/projects/${id}`),
    enabled: isEdit,
  })

  useEffect(() => {
    const p = projectQuery.data
    if (!p) return
    const next: FormState = {
      ...EMPTY,
      name: p.name,
      description: p.description ?? '',
      cloud_provider: p.cloud_provider,
      mode: p.mode,
    }
    if (p.cloud_provider === 'azure') {
      const cfg = p.provider_config as AzureProviderConfig
      next.azure_tenant_id = cfg.tenant_id
      next.azure_client_id = cfg.client_id
      next.azure_subscription_id = cfg.subscription_id
    } else {
      const cfg = p.provider_config as AwsProviderConfig
      next.aws_region = cfg.region
      next.aws_account_id = cfg.account_id
      next.aws_access_key_id = cfg.access_key_id
    }
    setForm(next)
  }, [projectQuery.data])

  const set = (key: keyof FormState, value: string) =>
    setForm((f) => ({ ...f, [key]: value }))

  const save = useMutation({
    mutationFn: (body: FormState) =>
      isEdit
        ? api.put(`/admin/projects/${id}`, body)
        : api.post('/admin/projects', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'projects'] })
      notify(isEdit ? 'Project updated.' : 'Project created.', 'success')
      navigate('/admin/projects')
    },
    onError: (err: Error) => notify(err.message, 'danger'),
  })

  if (isEdit && projectQuery.isLoading) return <Spinner />
  if (isEdit && projectQuery.error) return <ErrorState message="Failed to load project." />
  if (metaQuery.isLoading) return <Spinner />
  if (metaQuery.error || !metaQuery.data) return <ErrorState message="Failed to load metadata." />

  const providers = metaQuery.data.cloud_providers
  const modes = metaQuery.data.modes
  const isMock = form.mode === 'mock'

  return (
    <div className="space-y-6">
      <PageHeader
        title={isEdit ? 'Edit Project' : 'New Project'}
        subtitle="Configure the project and its cloud provider credentials."
      />

      <form
        className="max-w-2xl space-y-6"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate(form)
        }}
      >
        <Card>
          <CardHeader title="Details" />
          <CardBody className="space-y-4">
            <Field label="Name">
              <Input
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                required
                maxLength={100}
              />
            </Field>
            <Field label="Description">
              <Input
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
              />
            </Field>
            <Field label="Cloud Provider">
              <Select
                value={form.cloud_provider}
                onChange={(e) => set('cloud_provider', e.target.value)}
              >
                {providers.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Mode"
              hint="Mock simulates every start/stop — no credentials, no spend. Switch to Real only when the credentials below are correct."
            >
              <Select value={form.mode} onChange={(e) => set('mode', e.target.value)}>
                {modes.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Provider Configuration" />
          <CardBody className="space-y-4">
            {isMock && (
              <p className="rounded-[var(--radius-sm)] border border-info-border bg-info-bg px-3 py-2 text-sm text-info-fg">
                This project is in mock mode — these credentials are stored but never
                used. Nothing here reaches {form.cloud_provider === 'azure' ? 'Azure' : 'AWS'}.
              </p>
            )}
            {form.cloud_provider === 'azure' ? (
              <>
                <Field label="Tenant ID">
                  <Input
                    value={form.azure_tenant_id}
                    onChange={(e) => set('azure_tenant_id', e.target.value)}
                  />
                </Field>
                <Field label="Client ID">
                  <Input
                    value={form.azure_client_id}
                    onChange={(e) => set('azure_client_id', e.target.value)}
                  />
                </Field>
                <Field label="Subscription ID">
                  <Input
                    value={form.azure_subscription_id}
                    onChange={(e) => set('azure_subscription_id', e.target.value)}
                  />
                </Field>
                <Field
                  label="Client Secret"
                  hint={isEdit ? 'Leave blank to keep the existing secret.' : undefined}
                >
                  <Input
                    type="password"
                    value={form.azure_client_secret}
                    onChange={(e) => set('azure_client_secret', e.target.value)}
                  />
                </Field>
              </>
            ) : (
              <>
                <Field label="Region" hint="Default region for discovery and start/stop.">
                  <Input
                    value={form.aws_region}
                    onChange={(e) => set('aws_region', e.target.value)}
                    placeholder="us-east-1"
                  />
                </Field>
                <Field label="Account ID">
                  <Input
                    value={form.aws_account_id}
                    onChange={(e) => set('aws_account_id', e.target.value)}
                  />
                </Field>
                <Field label="Access Key ID">
                  <Input
                    value={form.aws_access_key_id}
                    onChange={(e) => set('aws_access_key_id', e.target.value)}
                  />
                </Field>
                <Field
                  label="Secret Access Key"
                  hint={isEdit ? 'Leave blank to keep the existing secret.' : undefined}
                >
                  <Input
                    type="password"
                    value={form.aws_secret_access_key}
                    onChange={(e) => set('aws_secret_access_key', e.target.value)}
                  />
                </Field>
              </>
            )}
          </CardBody>
        </Card>

        <div className="flex gap-2">
          <Button type="submit" disabled={save.isPending}>
            {isEdit ? 'Save Changes' : 'Create Project'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => navigate('/admin/projects')}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
