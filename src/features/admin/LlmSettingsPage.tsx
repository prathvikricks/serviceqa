import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../../lib/api'
import { PageHeader, Spinner, ErrorState } from '../../components/ui/Page'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { Field, Input, Select } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/ui/Toast'
import type { GeminiModel, SettingsResponse } from './settingsTypes'

export function LlmSettingsPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { notify } = useToast()

  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => api.get<SettingsResponse>('/admin/settings'),
  })

  const keySetting = data?.settings.find((s) => s.key === 'GEMINI_API_KEY')
  const modelSetting = data?.settings.find((s) => s.key === 'GEMINI_MODEL')

  // Fetching the list IS the key check: a bad key fails here, in Google's own
  // words, instead of silently at a developer's first chat turn.
  const models = useQuery({
    queryKey: ['admin', 'settings', 'models'],
    queryFn: () => api.get<{ models: GeminiModel[] }>('/admin/settings/llm/models'),
    enabled: !!keySetting?.is_set,
    retry: false,
  })

  const save = useMutation({
    mutationFn: () => {
      const values: Record<string, string> = {}
      if (apiKey.trim()) values.GEMINI_API_KEY = apiKey.trim()
      if (model) values.GEMINI_MODEL = model
      return api.put('/admin/settings', { values })
    },
    onSuccess: () => {
      setApiKey('')
      qc.invalidateQueries({ queryKey: ['admin', 'settings'] })
      // Gates the Assistant nav entry and the New Request card.
      qc.invalidateQueries({ queryKey: ['chat', 'status'] })
      notify('Saved. It takes effect immediately.', 'success')
    },
    onError: (err) =>
      notify(err instanceof ApiError ? err.message : 'Could not save', 'danger'),
  })

  const clearKey = useMutation({
    mutationFn: () => api.put('/admin/settings', { values: { GEMINI_API_KEY: '' } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'settings'] })
      qc.invalidateQueries({ queryKey: ['chat', 'status'] })
      notify('Key cleared.', 'success')
    },
  })

  if (isLoading) return <Spinner label="Loading settings…" />
  if (isError || !data) return <ErrorState message="Could not load settings." />

  const modelError =
    models.isError
      ? (models.error instanceof ApiError
          ? models.error.message
          : 'Could not list models for this key.')
      : null

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI assistant"
        subtitle="Powers the chat assistant and ticket summaries."
        action={
          <Button variant="secondary" size="sm" onClick={() => navigate('/admin/settings')}>
            Back to settings
          </Button>
        }
      />

      <form
        className="max-w-2xl space-y-6"
        onSubmit={(e) => {
          e.preventDefault()
          if (apiKey.trim() || model) save.mutate()
        }}
      >
        <Card>
          <CardHeader title="Gemini" />
          <CardBody className="space-y-4">
            <p className="text-sm text-text-secondary">
              Get a key at{' '}
              <span className="font-mono">aistudio.google.com/apikey</span>. Leave
              this empty and the assistant disappears from the app entirely.
            </p>

            {keySetting?.is_set && (
              <p className="text-sm text-text-secondary">
                Current key: <span className="font-mono">{keySetting.hint ?? 'set'}</span>
                {keySetting.source === 'environment' && ' · from the environment'}
                {keySetting.updated_by && ` · set by ${keySetting.updated_by}`}
              </p>
            )}

            <Field label={keySetting?.is_set ? 'Replace key' : 'API key'}>
              <Input
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Paste the key…"
              />
            </Field>

            <Field
              label="Model"
              hint={
                keySetting?.is_set
                  ? 'Listed from your key — only models it can actually call.'
                  : 'Save a key first and the list loads automatically.'
              }
            >
              {models.isFetching ? (
                <p className="text-sm text-text-secondary">Loading models…</p>
              ) : modelError ? (
                <p className="text-sm text-danger-fg">{modelError}</p>
              ) : (
                <Select
                  value={model || modelSetting?.hint || ''}
                  disabled={!models.data?.models.length}
                  onChange={(e) => setModel(e.target.value)}
                >
                  <option value="">
                    {models.data?.models.length ? 'Use the default' : 'No models available'}
                  </option>
                  {models.data?.models.map((m) => (
                    <option key={m.name} value={m.name}>
                      {m.display_name} ({m.name})
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </CardBody>
        </Card>

        <div className="flex gap-2">
          <Button type="submit" disabled={save.isPending || (!apiKey.trim() && !model)}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => navigate('/admin/settings')}>
            Cancel
          </Button>
          {keySetting?.source === 'settings' && (
            <Button type="button" variant="ghost" onClick={() => clearKey.mutate()}>
              Clear key
            </Button>
          )}
        </div>
      </form>
    </div>
  )
}
