import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../../lib/api'
import { PageHeader, Spinner, ErrorState } from '../../components/ui/Page'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Field, Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/ui/Toast'
import type { IntegrationStatus, SettingsResponse } from './settingsTypes'

const FIELDS = [
  { key: 'AWS_ACCESS_KEY_ID', label: 'Access key ID', secret: false },
  { key: 'AWS_SECRET_ACCESS_KEY', label: 'Secret access key', secret: true },
  { key: 'AWS_REGION', label: 'Default region', secret: false },
]

/**
 * Global AWS credentials for the central Secrets Manager. One account is listed
 * and read across all projects; projects reference secrets, values stay in AWS.
 */
export function AwsSettingsPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { notify } = useToast()

  const [form, setForm] = useState<Record<string, string>>({})

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => api.get<SettingsResponse>('/admin/settings'),
  })
  const status = useQuery({
    queryKey: ['admin', 'settings', 'status'],
    queryFn: () => api.get<IntegrationStatus>('/admin/settings/status'),
  })

  // Seed non-secret fields from what's stored; secrets stay blank.
  useEffect(() => {
    if (!data) return
    const seeded: Record<string, string> = {}
    for (const f of FIELDS) {
      if (f.secret) continue
      const s = data.settings.find((x) => x.key === f.key)
      if (s?.hint) seeded[f.key] = s.hint
    }
    setForm(seeded)
  }, [data])

  const save = useMutation({
    mutationFn: () => {
      const values: Record<string, string> = {}
      for (const f of FIELDS) {
        // Blank secret = "leave it alone", so saving other fields doesn't wipe it.
        if (f.secret && !(form[f.key] ?? '').trim()) continue
        values[f.key] = (form[f.key] ?? '').trim()
      }
      return api.put('/admin/settings', { values })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'settings'] })
      qc.invalidateQueries({ queryKey: ['admin', 'settings', 'status'] })
      // The central AWS list depends on these credentials.
      qc.invalidateQueries({ queryKey: ['admin', 'aws-secrets'] })
      notify('Saved. Checking AWS…', 'success')
    },
    onError: (err) =>
      notify(err instanceof ApiError ? err.message : 'Could not save', 'danger'),
  })

  if (isLoading) return <Spinner label="Loading settings…" />
  if (isError || !data) return <ErrorState message="Could not load settings." />

  const aws = status.data?.aws

  return (
    <div className="space-y-6">
      <PageHeader
        title="AWS Secrets Manager"
        subtitle="Central credentials used to list and read secrets across projects."
        action={
          <div className="flex items-center gap-2">
            {status.isFetching ? (
              <Badge tone="neutral">Checking…</Badge>
            ) : aws?.configured ? (
              aws.reachable
                ? <Badge tone="success">Connected</Badge>
                : <Badge tone="danger">Unreachable</Badge>
            ) : (
              <Badge tone="neutral">Not configured</Badge>
            )}
            <Button variant="secondary" size="sm" onClick={() => navigate('/admin/settings')}>
              Back to settings
            </Button>
          </div>
        }
      />

      {aws?.configured && aws.reachable && (
        <div className="max-w-2xl rounded-[var(--radius-sm)] border border-border bg-surface px-4 py-3 text-sm text-text-secondary">
          Connected to {aws.region} — {aws.secret_count ?? 0} secret(s) visible.
        </div>
      )}
      {aws?.configured && !aws.reachable && aws.error && (
        <div className="max-w-2xl rounded-[var(--radius-sm)] border border-danger-border bg-danger-bg px-4 py-3 text-sm text-danger-fg">
          {aws.error}
        </div>
      )}

      <form
        className="max-w-2xl space-y-6"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
      >
        <Card>
          <CardHeader title="IAM credentials" />
          <CardBody className="space-y-4">
            <p className="text-sm text-text-secondary">
              Use an IAM user or role with{' '}
              <span className="font-mono">secretsmanager:ListSecrets</span> and{' '}
              <span className="font-mono">secretsmanager:GetSecretValue</span>. Secret values
              are read live from AWS and never stored here.
            </p>

            {FIELDS.map((f) => {
              const setting = data.settings.find((x) => x.key === f.key)
              return (
                <Field key={f.key} label={f.label} hint={setting?.help ?? undefined}>
                  <Input
                    type={f.secret ? 'password' : 'text'}
                    autoComplete="off"
                    value={form[f.key] ?? ''}
                    onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                    placeholder={
                      f.secret && setting?.is_set
                        ? 'Stored — leave blank to keep it'
                        : f.key === 'AWS_REGION'
                          ? 'us-east-1'
                          : undefined
                    }
                  />
                </Field>
              )
            })}
          </CardBody>
        </Card>

        <div className="flex gap-2">
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => navigate('/admin/settings')}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
