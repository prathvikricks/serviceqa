import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { KeyRound, Mail, Sparkles } from 'lucide-react'
import { api } from '../../lib/api'
import { PageHeader, Spinner, ErrorState } from '../../components/ui/Page'
import { Badge } from '../../components/ui/Badge'
import type { IntegrationStatus, SettingsResponse } from './settingsTypes'

export function SettingsPage() {
  const navigate = useNavigate()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => api.get<SettingsResponse>('/admin/settings'),
  })

  // Separate query: the mail check is a real network call to Microsoft, so the
  // tiles must render before it lands rather than blocking on it.
  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ['admin', 'settings', 'status'],
    queryFn: () => api.get<IntegrationStatus>('/admin/settings/status'),
  })

  if (isLoading) return <Spinner label="Loading settings…" />
  if (isError || !data) return <ErrorState message="Could not load settings." />

  function badge(group: 'llm' | 'mail' | 'aws') {
    if (statusLoading || !status) return <Badge tone="neutral">Checking…</Badge>
    if (group === 'llm') {
      return status.llm.configured
        ? <Badge tone="success">Connected</Badge>
        : <Badge tone="neutral">Not configured</Badge>
    }
    const s = status[group]
    if (!s.configured) return <Badge tone="neutral">Not configured</Badge>
    return s.reachable
      ? <Badge tone="success">Connected</Badge>
      : <Badge tone="danger">Configured, unreachable</Badge>
  }

  const tiles = [
    { group: 'llm' as const, to: '/admin/settings/llm', icon: <Sparkles className="h-6 w-6" /> },
    { group: 'mail' as const, to: '/admin/settings/mail', icon: <Mail className="h-6 w-6" /> },
    { group: 'aws' as const, to: '/admin/settings/aws', icon: <KeyRound className="h-6 w-6" /> },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        subtitle="Integrations. Credentials are encrypted and take effect without a restart."
      />

      <div className="grid gap-4 sm:grid-cols-2 max-w-3xl">
        {tiles.map((t) => (
          <button
            key={t.to}
            type="button"
            onClick={() => navigate(t.to)}
            className="flex flex-col items-start gap-3 rounded-[var(--radius-md)] border border-border bg-surface p-6 text-left transition-colors hover:border-accent-border hover:bg-hover focus:outline-none focus:ring-2 focus:ring-accent/30"
          >
            <div className="flex w-full items-start justify-between">
              <span className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-sm)] bg-accent-soft text-accent">
                {t.icon}
              </span>
              {badge(t.group)}
            </div>
            <span className="text-base font-semibold text-text-primary">
              {data.groups[t.group]?.label ?? t.group}
            </span>
            <span className="text-sm text-text-secondary">
              {data.groups[t.group]?.blurb}
            </span>
          </button>
        ))}
      </div>

      {status?.mail.configured && !status.mail.reachable && status.mail.error && (
        <div className="max-w-3xl rounded-[var(--radius-sm)] border border-danger-border bg-danger-bg px-4 py-3 text-sm text-danger-fg">
          Email intake cannot reach the mailbox: {status.mail.error}
        </div>
      )}
    </div>
  )
}
