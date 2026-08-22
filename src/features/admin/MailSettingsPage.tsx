import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../../lib/api'
import { PageHeader, Spinner, ErrorState } from '../../components/ui/Page'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Field, Input, Select } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/ui/Toast'
import type { IntegrationStatus, SettingsResponse } from './settingsTypes'

/** Fields in the order you collect them from the app registration. */
const FIELDS = [
  { key: 'GRAPH_TENANT_ID', label: 'Directory (tenant) ID', secret: false },
  { key: 'GRAPH_CLIENT_ID', label: 'Application (client) ID', secret: false },
  { key: 'GRAPH_CLIENT_SECRET', label: 'Client secret value', secret: true },
  { key: 'DEVOPS_MAILBOX', label: 'Team mailbox', secret: false },
  { key: 'TICKET_TRIGGER_ADDRESS', label: 'Trigger address', secret: false },
]

export function MailSettingsPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { notify } = useToast()

  const [form, setForm] = useState<Record<string, string>>({})
  const [ack, setAck] = useState('0')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => api.get<SettingsResponse>('/admin/settings'),
  })
  const status = useQuery({
    queryKey: ['admin', 'settings', 'status'],
    queryFn: () => api.get<IntegrationStatus>('/admin/settings/status'),
  })

  // Seed the non-secret fields from what is stored, so Save doesn't wipe values
  // the admin didn't touch. Secrets are never sent back, so they stay blank.
  useEffect(() => {
    if (!data) return
    const seeded: Record<string, string> = {}
    for (const f of FIELDS) {
      if (f.secret) continue
      const s = data.settings.find((x) => x.key === f.key)
      if (s?.hint) seeded[f.key] = s.hint
    }
    setForm(seeded)
    const ackSetting = data.settings.find((x) => x.key === 'TICKET_ACK_ENABLED')
    setAck(ackSetting?.hint === '1' ? '1' : '0')
  }, [data])

  const save = useMutation({
    mutationFn: () => {
      const values: Record<string, string> = { TICKET_ACK_ENABLED: ack }
      for (const f of FIELDS) {
        // A blank secret means "leave it alone", not "clear it" — otherwise
        // saving any other field would wipe the credential.
        if (f.secret && !(form[f.key] ?? '').trim()) continue
        values[f.key] = (form[f.key] ?? '').trim()
      }
      return api.put('/admin/settings', { values })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'settings'] })
      qc.invalidateQueries({ queryKey: ['admin', 'settings', 'status'] })
      // Gates the Tickets nav entry and the "intake not configured" banner.
      qc.invalidateQueries({ queryKey: ['tickets', 'status'] })
      notify('Saved. Checking the mailbox…', 'success')
    },
    onError: (err) =>
      notify(err instanceof ApiError ? err.message : 'Could not save', 'danger'),
  })

  if (isLoading) return <Spinner label="Loading settings…" />
  if (isError || !data) return <ErrorState message="Could not load settings." />

  const mail = status.data?.mail

  return (
    <div className="space-y-6">
      <PageHeader
        title="Email intake"
        subtitle="Mail sent to the team address becomes a ticket."
        action={
          <div className="flex items-center gap-2">
            {status.isFetching ? (
              <Badge tone="neutral">Checking…</Badge>
            ) : mail?.configured ? (
              mail.reachable
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

      {mail?.configured && !mail.reachable && mail.error && (
        <div className="max-w-2xl rounded-[var(--radius-sm)] border border-danger-border bg-danger-bg px-4 py-3 text-sm text-danger-fg">
          {mail.error}
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
          <CardHeader title="Microsoft 365 app registration" />
          <CardBody className="space-y-4">
            <p className="text-sm text-text-secondary">
              Register an app in Entra ID with the <span className="font-mono">Mail.Read</span>{' '}
              and <span className="font-mono">Mail.Send</span> <em>application</em> permissions,
              then grant admin consent — adding them is not the same as consenting, and
              without it every call returns 403. Restrict the app to this one mailbox with
              an Application Access Policy.
            </p>

            {FIELDS.map((f) => {
              const setting = data.settings.find((x) => x.key === f.key)
              return (
                <Field
                  key={f.key}
                  label={f.label}
                  hint={setting?.help ?? undefined}
                >
                  <Input
                    type={f.secret ? 'password' : 'text'}
                    autoComplete="off"
                    value={form[f.key] ?? ''}
                    onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                    placeholder={
                      f.secret && setting?.is_set
                        ? 'Stored — leave blank to keep it'
                        : undefined
                    }
                  />
                </Field>
              )
            })}

            <Field
              label="Acknowledge senders"
              hint="Emails the sender a ticket reference. This mails real people as your team."
            >
              <Select value={ack} onChange={(e) => setAck(e.target.value)}>
                <option value="0">Off</option>
                <option value="1">On</option>
              </Select>
            </Field>
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
