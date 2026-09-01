import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Eye, EyeOff } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardBody } from '../../components/ui/Card'
import { Field, Input, Select } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { Table, THead, TRow, TCell } from '../../components/ui/Table'
import { PageHeader, Spinner, ErrorState, EmptyState } from '../../components/ui/Page'
import { useToast } from '../../components/ui/Toast'
import { MapModal } from './AwsMapModal'
import type { AwsSecretListing } from './adminTypes'

const AWS_REGIONS = [
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2', 'ca-central-1',
  'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1', 'eu-north-1',
  'ap-south-1', 'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1',
  'ap-northeast-2', 'sa-east-1',
]

interface AwsSecretsResponse {
  region: string
  aws_secrets: AwsSecretListing[]
}

const secretPath = (arn: string) => `/admin/aws-secrets/${encodeURIComponent(arn)}`

/**
 * Central AWS Secrets Manager: lists every secret in the AWS account (live) and
 * maps them to projects. Values are read live from AWS; nothing is stored here.
 */
export function AwsSecretsPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { notify } = useToast()
  const [region, setRegion] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'aws-secrets', region],
    queryFn: () =>
      api.get<AwsSecretsResponse>(`/admin/aws-secrets${region ? `?region=${region}` : ''}`),
    retry: false,
  })

  const [revealed, setRevealed] = useState<Record<string, string>>({})
  const [revealing, setRevealing] = useState<string | null>(null)
  const [mapTarget, setMapTarget] = useState<AwsSecretListing | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  async function reveal(row: AwsSecretListing) {
    setRevealing(row.aws_arn)
    try {
      const res = await api.post<{ value: string }>('/admin/aws-secrets/reveal', {
        aws_arn: row.aws_arn,
        aws_region: row.aws_region,
      })
      setRevealed((p) => ({ ...p, [row.aws_arn]: res.value }))
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Could not reveal that secret.', 'danger')
    } finally {
      setRevealing(null)
    }
  }

  function hide(arn: string) {
    setRevealed((p) => {
      const next = { ...p }
      delete next[arn]
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

  const dissociate = useMutation({
    mutationFn: ({ projectId, assocId }: { projectId: number; assocId: number }) =>
      api.delete(`/admin/projects/${projectId}/aws-secrets/${assocId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'aws-secrets'] })
      notify('Unmapped.', 'success')
    },
    onError: (err: Error) => notify(err.message, 'danger'),
  })

  // Not-configured: the endpoint returns 409 with configured:false.
  const notConfigured = error instanceof ApiError && error.status === 409
  const currentRegion = region || (data?.region ?? '')

  return (
    <div className="space-y-6">
      <PageHeader
        title="AWS Secrets"
        subtitle="Secrets read live from AWS Secrets Manager. Map them to projects; values stay in AWS."
        action={
          <div className="flex items-end gap-2">
            <Field label="Region">
              <Select
                value={currentRegion}
                onChange={(e) => setRegion(e.target.value)}
                className="w-auto"
              >
                {AWS_REGIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </Field>
            {!notConfigured && (
              <Button onClick={() => setCreateOpen(true)}>New secret</Button>
            )}
          </div>
        }
      />

      {notConfigured ? (
        <Card>
          <CardBody>
            <EmptyState message="AWS Secrets Manager isn't configured yet." />
            <div className="mt-3 text-center">
              <Link to="/admin/settings/aws">
                <Button variant="secondary" size="sm">Configure AWS credentials</Button>
              </Link>
            </div>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardBody className="p-0">
            {isLoading ? (
              <Spinner label="Reading AWS…" />
            ) : error ? (
              <ErrorState message={`Could not read AWS: ${(error as Error).message}`} />
            ) : !data || data.aws_secrets.length === 0 ? (
              <EmptyState message="No secrets found in this region." />
            ) : (
              <Table>
                <THead columns={['Name', 'Region', 'Value', 'Mapped to', '']} />
                <tbody>
                  {data.aws_secrets.map((s) => {
                    const value = revealed[s.aws_arn]
                    return (
                      <TRow key={s.aws_arn}>
                        <TCell className="font-mono font-medium">
                          <Link to={secretPath(s.aws_arn)} className="text-accent hover:underline">
                            {s.aws_name}
                          </Link>
                        </TCell>
                        <TCell className="text-text-secondary">{s.aws_region}</TCell>
                        <TCell className="font-mono text-text-secondary">
                          {value !== undefined ? (
                            <span className="break-all">{value}</span>
                          ) : (
                            '••••••••••••'
                          )}
                        </TCell>
                        <TCell>
                          {s.mappings.length === 0 ? (
                            <span className="text-xs text-text-muted">—</span>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {s.mappings.map((m) => (
                                <span key={m.assoc_id} className="inline-flex items-center gap-1">
                                  <Badge tone="info">
                                    {m.project_name} · {m.scope}
                                  </Badge>
                                  <button
                                    type="button"
                                    title="Unmap"
                                    className="text-xs text-text-muted hover:text-danger-fg"
                                    onClick={() =>
                                      dissociate.mutate({
                                        projectId: m.project_id,
                                        assocId: m.assoc_id,
                                      })
                                    }
                                  >
                                    ✕
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                        </TCell>
                        <TCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {value !== undefined ? (
                              <>
                                <Button size="sm" variant="secondary" onClick={() => copy(value)}>
                                  <Copy size={14} /> Copy
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => hide(s.aws_arn)}>
                                  <EyeOff size={14} /> Hide
                                </Button>
                              </>
                            ) : (
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={revealing === s.aws_arn}
                                onClick={() => reveal(s)}
                              >
                                <Eye size={14} /> {revealing === s.aws_arn ? 'Revealing…' : 'Reveal'}
                              </Button>
                            )}
                            <Button size="sm" onClick={() => setMapTarget(s)}>
                              Map
                            </Button>
                          </div>
                        </TCell>
                      </TRow>
                    )
                  })}
                </tbody>
              </Table>
            )}
          </CardBody>
        </Card>
      )}

      {mapTarget && (
        <MapModal
          secret={mapTarget}
          onClose={() => setMapTarget(null)}
          onDone={() => {
            qc.invalidateQueries({ queryKey: ['admin', 'aws-secrets'] })
            setMapTarget(null)
          }}
        />
      )}

      {createOpen && (
        <CreateModal
          region={currentRegion}
          onClose={() => setCreateOpen(false)}
          onCreated={(arn) => {
            setCreateOpen(false)
            qc.invalidateQueries({ queryKey: ['admin', 'aws-secrets'] })
            navigate(secretPath(arn))
          }}
        />
      )}
    </div>
  )
}

// --------------------------------------------------------------------------
// Create-secret modal — writes a new secret to AWS, then opens its detail page.
// --------------------------------------------------------------------------

function CreateModal({
  region,
  onClose,
  onCreated,
}: {
  region: string
  onClose: () => void
  onCreated: (arn: string) => void
}) {
  const { notify } = useToast()
  const [form, setForm] = useState({ name: '', value: '', description: '' })
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const create = useMutation({
    mutationFn: () =>
      api.post<{ aws_arn: string }>('/admin/aws-secrets', {
        name: form.name,
        value: form.value,
        description: form.description,
        region,
      }),
    onSuccess: (r) => {
      notify('Secret created in AWS.', 'success')
      onCreated(r.aws_arn)
    },
    onError: (err: Error) => notify(err.message, 'danger'),
  })

  return (
    <Modal
      open
      onClose={onClose}
      title="New AWS secret"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={create.isPending || !form.name.trim() || !form.value.trim()}
            onClick={() => create.mutate()}
          >
            {create.isPending ? 'Creating…' : 'Create'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" hint={`Created in ${region || 'the default region'}.`}>
          <Input
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="myapp/prod/DB_PASSWORD"
            autoFocus
          />
        </Field>
        <Field label="Value">
          <Input
            type="password"
            value={form.value}
            onChange={(e) => set('value', e.target.value)}
            autoComplete="new-password"
          />
        </Field>
        <Field label="Description">
          <Input value={form.description} onChange={(e) => set('description', e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
