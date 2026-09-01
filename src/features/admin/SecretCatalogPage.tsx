import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Eye, EyeOff } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardBody } from '../../components/ui/Card'
import { Field, Input } from '../../components/ui/Input'
import { Modal, ConfirmDialog } from '../../components/ui/Modal'
import { Table, THead, TRow, TCell } from '../../components/ui/Table'
import { PageHeader, Spinner, ErrorState, EmptyState } from '../../components/ui/Page'
import { useToast } from '../../components/ui/Toast'
import type { SharedSecret } from './adminTypes'

interface CatalogForm {
  key: string
  value: string
  description: string
}

const EMPTY: CatalogForm = { key: '', value: '', description: '' }

/**
 * Central catalog of shared secrets. A secret defined here can be attached to
 * many projects from each project's detail page; editing its value updates it
 * everywhere it's attached (one source of truth).
 */
export function SecretCatalogPage() {
  const qc = useQueryClient()
  const { notify } = useToast()

  const { data, isLoading, error } = useQuery({
    queryKey: ['shared-secrets'],
    queryFn: () => api.get<{ shared_secrets: SharedSecret[] }>('/admin/shared-secrets'),
  })
  const secrets = data?.shared_secrets ?? []

  const [modal, setModal] = useState<{ secret: SharedSecret | null } | null>(null)
  const [form, setForm] = useState<CatalogForm>(EMPTY)
  const [toDelete, setToDelete] = useState<SharedSecret | null>(null)
  const [revealed, setRevealed] = useState<Record<number, string>>({})
  const [revealing, setRevealing] = useState<number | null>(null)
  const setField = (k: keyof CatalogForm, v: string) => setForm((f) => ({ ...f, [k]: v }))

  function open(secret: SharedSecret | null) {
    setForm(
      secret
        ? { key: secret.key, value: '', description: secret.description ?? '' }
        : EMPTY,
    )
    setModal({ secret })
  }

  const save = useMutation({
    mutationFn: () => {
      const body = { key: form.key, value: form.value, description: form.description }
      const existing = modal?.secret
      return existing
        ? api.put(`/admin/shared-secrets/${existing.id}`, body)
        : api.post('/admin/shared-secrets', body)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shared-secrets'] })
      notify(modal?.secret ? 'Shared secret updated.' : 'Shared secret added.', 'success')
      setModal(null)
    },
    onError: (err: Error) => notify(err.message, 'danger'),
  })

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/shared-secrets/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shared-secrets'] })
      notify('Shared secret deleted.', 'success')
      setToDelete(null)
    },
    onError: (err: Error) => notify(err.message, 'danger'),
  })

  async function reveal(secret: SharedSecret) {
    setRevealing(secret.id)
    try {
      const res = await api.post<{ value: string }>(`/admin/shared-secrets/${secret.id}/reveal`)
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Secret Catalog"
        subtitle="Shared secrets you can attach to any project. Editing a value updates every project it's attached to."
        action={<Button onClick={() => open(null)}>Add Shared Secret</Button>}
      />

      <Card>
        <CardBody className="p-0">
          {isLoading ? (
            <Spinner />
          ) : error ? (
            <ErrorState message="Could not load the secret catalog." />
          ) : secrets.length === 0 ? (
            <EmptyState message="No shared secrets yet. Add one, then attach it to projects." />
          ) : (
            <Table>
              <THead columns={['Key', 'Value', 'Description', 'Attached to', '']} />
              <tbody>
                {secrets.map((s) => {
                  const value = revealed[s.id]
                  return (
                    <TRow key={s.id}>
                      <TCell className="font-mono font-medium">{s.key}</TCell>
                      <TCell className="font-mono text-text-secondary">
                        {value !== undefined ? (
                          <span className="break-all">{value}</span>
                        ) : (
                          '••••••••••••'
                        )}
                      </TCell>
                      <TCell className="text-text-secondary">{s.description ?? '—'}</TCell>
                      <TCell>
                        <Badge tone={s.attachment_count ? 'info' : 'neutral'}>
                          {s.attachment_count} {s.attachment_count === 1 ? 'project' : 'projects'}
                        </Badge>
                      </TCell>
                      <TCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {value !== undefined ? (
                            <>
                              <Button size="sm" variant="secondary" onClick={() => copy(value)}>
                                <Copy size={14} /> Copy
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => hide(s.id)}>
                                <EyeOff size={14} /> Hide
                              </Button>
                            </>
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
                          <Button size="sm" variant="secondary" onClick={() => open(s)}>
                            Edit
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setToDelete(s)}>
                            Delete
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

      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={modal?.secret ? `Edit ${modal.secret.key}` : 'Add Shared Secret'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Key">
            <Input
              value={form.key}
              onChange={(e) => setField('key', e.target.value)}
              placeholder="SHARED_API_KEY"
              maxLength={100}
              autoFocus
            />
          </Field>
          <Field
            label="Value"
            hint={
              modal?.secret
                ? 'Leave blank to keep the stored value. Changing it updates every attached project.'
                : 'Encrypted at rest; only members you grant access can reveal it.'
            }
          >
            <Input
              type="password"
              value={form.value}
              onChange={(e) => setField('value', e.target.value)}
              autoComplete="new-password"
            />
          </Field>
          <Field label="Description">
            <Input
              value={form.description}
              onChange={(e) => setField('description', e.target.value)}
            />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={toDelete !== null}
        title="Delete shared secret"
        message={
          toDelete
            ? `Delete "${toDelete.key}"? It will be detached from ${toDelete.attachment_count} project(s) and anyone relying on it will lose access.`
            : ''
        }
        confirmLabel="Delete"
        danger
        pending={remove.isPending}
        onCancel={() => setToDelete(null)}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
      />
    </div>
  )
}
