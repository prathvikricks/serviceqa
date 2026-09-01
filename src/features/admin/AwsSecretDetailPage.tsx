import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Eye, EyeOff } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { Field, Input } from '../../components/ui/Input'
import { Table, THead, TRow, TCell } from '../../components/ui/Table'
import { PageHeader, Spinner, ErrorState, EmptyState } from '../../components/ui/Page'
import { useToast } from '../../components/ui/Toast'
import { MapModal } from './AwsMapModal'
import type { AwsSecretDetail } from './adminTypes'

/**
 * One AWS secret: reveal/edit its value, edit its description, and manage which
 * projects it's mapped to. Edits write back to AWS Secrets Manager.
 */
export function AwsSecretDetailPage() {
  const { arn: arnParam } = useParams()
  const arn = decodeURIComponent(arnParam ?? '')
  const qc = useQueryClient()
  const { notify } = useToast()

  const detailKey = ['admin', 'aws-secret', arn]
  const { data, isLoading, error } = useQuery({
    queryKey: detailKey,
    queryFn: () => api.get<AwsSecretDetail>(`/admin/aws-secrets/detail?arn=${encodeURIComponent(arn)}`),
    retry: false,
  })

  const [revealed, setRevealed] = useState<string | null>(null)
  const [revealing, setRevealing] = useState(false)
  const [newValue, setNewValue] = useState('')
  const [description, setDescription] = useState('')
  const [mapOpen, setMapOpen] = useState(false)

  // Seed the description field once the secret loads.
  useEffect(() => {
    if (data) setDescription(data.description ?? '')
  }, [data])

  async function reveal() {
    setRevealing(true)
    try {
      const res = await api.post<{ value: string }>('/admin/aws-secrets/reveal', {
        aws_arn: arn,
        aws_region: data?.aws_region,
      })
      setRevealed(res.value)
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Could not reveal.', 'danger')
    } finally {
      setRevealing(false)
    }
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value)
      notify('Copied to clipboard.', 'success')
    } catch {
      notify('Could not copy — select the value and copy it manually.', 'info')
    }
  }

  const saveValue = useMutation({
    mutationFn: () => api.put('/admin/aws-secrets', { aws_arn: arn, value: newValue }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: detailKey })
      qc.invalidateQueries({ queryKey: ['admin', 'aws-secrets'] })
      notify('Value updated in AWS.', 'success')
      setNewValue('')
      setRevealed(null)
    },
    onError: (err: Error) => notify(err.message, 'danger'),
  })

  const saveDescription = useMutation({
    mutationFn: () => api.put('/admin/aws-secrets', { aws_arn: arn, description }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: detailKey })
      notify('Description updated in AWS.', 'success')
    },
    onError: (err: Error) => notify(err.message, 'danger'),
  })

  const dissociate = useMutation({
    mutationFn: ({ projectId, assocId }: { projectId: number; assocId: number }) =>
      api.delete(`/admin/projects/${projectId}/aws-secrets/${assocId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: detailKey })
      qc.invalidateQueries({ queryKey: ['admin', 'aws-secrets'] })
      notify('Unmapped.', 'success')
    },
    onError: (err: Error) => notify(err.message, 'danger'),
  })

  if (isLoading) return <Spinner />
  if (error || !data) {
    return (
      <div className="space-y-4">
        <ErrorState message={`Could not load the secret: ${(error as Error)?.message ?? ''}`} />
        <Link to="/admin/aws-secrets">
          <Button variant="secondary" size="sm">Back to AWS Secrets</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={data.aws_name}
        subtitle={data.aws_arn}
        action={
          <div className="flex items-center gap-2">
            <Badge tone="info">{data.aws_region}</Badge>
            <Link to="/admin/aws-secrets">
              <Button variant="secondary" size="sm">Back</Button>
            </Link>
          </div>
        }
      />

      {data.last_changed && (
        <p className="text-xs text-text-muted">
          Last changed {new Date(data.last_changed).toLocaleString()}
        </p>
      )}

      {/* Value ------------------------------------------------------------- */}
      <Card>
        <CardHeader title="Value" />
        <CardBody className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-text-secondary break-all">
              {revealed !== null ? revealed : '••••••••••••'}
            </span>
            {revealed !== null ? (
              <>
                <Button size="sm" variant="secondary" onClick={() => copy(revealed)}>
                  <Copy size={14} /> Copy
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setRevealed(null)}>
                  <EyeOff size={14} /> Hide
                </Button>
              </>
            ) : (
              <Button size="sm" variant="secondary" disabled={revealing} onClick={reveal}>
                <Eye size={14} /> {revealing ? 'Revealing…' : 'Reveal'}
              </Button>
            )}
          </div>

          <Field label="New value" hint="Writes a new version to AWS. Leave blank to keep the current value.">
            <Input
              type="password"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              autoComplete="new-password"
              placeholder="Enter a new value…"
            />
          </Field>
          <div>
            <Button
              size="sm"
              disabled={saveValue.isPending || !newValue.trim()}
              onClick={() => saveValue.mutate()}
            >
              {saveValue.isPending ? 'Saving…' : 'Update value'}
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Description ------------------------------------------------------- */}
      <Card>
        <CardHeader title="Description" />
        <CardBody className="space-y-4">
          <Field label="Description">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <div>
            <Button
              size="sm"
              disabled={saveDescription.isPending}
              onClick={() => saveDescription.mutate()}
            >
              {saveDescription.isPending ? 'Saving…' : 'Update description'}
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Mapped projects -------------------------------------------------- */}
      <Card>
        <CardHeader
          title="Mapped to projects"
          action={
            <Button size="sm" variant="secondary" onClick={() => setMapOpen(true)}>
              Map to project
            </Button>
          }
        />
        {data.mappings.length === 0 ? (
          <CardBody>
            <EmptyState message="Not mapped to any project yet." />
          </CardBody>
        ) : (
          <Table>
            <THead columns={['Project', 'Scope', '']} />
            <tbody>
              {data.mappings.map((m) => (
                <TRow key={m.assoc_id}>
                  <TCell className="font-medium">{m.project_name}</TCell>
                  <TCell className="text-text-secondary">{m.scope}</TCell>
                  <TCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        dissociate.mutate({ projectId: m.project_id, assocId: m.assoc_id })
                      }
                    >
                      Unmap
                    </Button>
                  </TCell>
                </TRow>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {mapOpen && (
        <MapModal
          secret={{ aws_arn: data.aws_arn, aws_name: data.aws_name, aws_region: data.aws_region }}
          onClose={() => setMapOpen(false)}
          onDone={() => {
            qc.invalidateQueries({ queryKey: detailKey })
            qc.invalidateQueries({ queryKey: ['admin', 'aws-secrets'] })
            setMapOpen(false)
          }}
        />
      )}
    </div>
  )
}
