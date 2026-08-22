import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../../lib/api'
import { PageHeader, Spinner, ErrorState } from '../../components/ui/Page'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Field, Input } from '../../components/ui/Input'
import { useToast } from '../../components/ui/Toast'

interface AppSetting {
  key: string
  label: string
  help: string | null
  secret: boolean
  is_set: boolean
  /** Where the effective value comes from — clearing only removes ours. */
  source: 'settings' | 'environment' | null
  hint: string | null
  updated_by: string | null
  updated_at: string | null
}

export function SettingsPage() {
  const qc = useQueryClient()
  const { notify } = useToast()
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => api.get<{ settings: AppSetting[] }>('/admin/settings'),
  })

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['admin', 'settings'] })
    // These gate the sidebar and the New Request cards, so they must re-read.
    qc.invalidateQueries({ queryKey: ['chat', 'status'] })
    qc.invalidateQueries({ queryKey: ['tickets', 'status'] })
  }

  const save = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      api.put(`/admin/settings/${key}`, { value }),
    onSuccess: (_r, { key }) => {
      setDrafts((d) => ({ ...d, [key]: '' }))
      invalidate()
      notify('Saved. It takes effect immediately.', 'success')
    },
    onError: (err) =>
      notify(err instanceof ApiError ? err.message : 'Could not save', 'danger'),
  })

  const clear = useMutation({
    mutationFn: (key: string) => api.delete(`/admin/settings/${key}`),
    onSuccess: () => {
      invalidate()
      notify('Cleared.', 'success')
    },
    onError: (err) =>
      notify(err instanceof ApiError ? err.message : 'Could not clear', 'danger'),
  })

  if (isLoading) return <Spinner label="Loading settings…" />
  if (isError || !data) return <ErrorState message="Could not load settings." />

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        subtitle="Keys stored here are encrypted and take effect without a restart."
      />

      <div className="max-w-2xl space-y-4">
        {data.settings.map((s) => (
          <Card key={s.key}>
            <CardHeader
              title={s.label}
              action={
                s.is_set ? (
                  <Badge tone={s.source === 'settings' ? 'success' : 'info'}>
                    {s.source === 'settings' ? 'Set here' : 'From environment'}
                  </Badge>
                ) : (
                  <Badge tone="neutral">Not set</Badge>
                )
              }
            />
            <CardBody>
              <div className="space-y-4">
                {s.help && <p className="text-sm text-text-secondary">{s.help}</p>}

                {s.is_set && s.hint && (
                  <p className="text-sm text-text-secondary">
                    Current value: <span className="font-mono">{s.hint}</span>
                    {s.updated_by && ` · set by ${s.updated_by}`}
                  </p>
                )}

                <Field label={s.is_set ? 'Replace with' : 'Value'}>
                  <Input
                    type={s.secret ? 'password' : 'text'}
                    autoComplete="off"
                    value={drafts[s.key] ?? ''}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, [s.key]: e.target.value }))
                    }
                    placeholder={s.secret ? 'Paste the key…' : 'Enter a value…'}
                  />
                </Field>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={!(drafts[s.key] ?? '').trim() || save.isPending}
                    onClick={() =>
                      save.mutate({ key: s.key, value: (drafts[s.key] ?? '').trim() })
                    }
                  >
                    Save
                  </Button>
                  {s.source === 'settings' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={clear.isPending}
                      onClick={() => clear.mutate(s.key)}
                    >
                      Clear
                    </Button>
                  )}
                </div>

                {s.source === 'environment' && (
                  <p className="text-xs text-text-muted">
                    This value comes from the environment. Saving one here overrides it.
                  </p>
                )}
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  )
}
