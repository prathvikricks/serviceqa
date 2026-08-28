import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError, downloadFile } from '../../lib/api'
import { PageHeader, Spinner, ErrorState, EmptyState } from '../../components/ui/Page'
import { Card } from '../../components/ui/Card'
import { Tabs } from '../../components/ui/Tabs'
import { Table, THead, TCell } from '../../components/ui/Table'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Select, Input } from '../../components/ui/Input'
import { useToast } from '../../components/ui/Toast'
import type {
  VulnerabilitiesResponse,
  VulnSourcesResponse,
  VulnStatus,
  ScanSummary,
  Severity,
} from './types'

const TABS: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

/** Severity deliberately does not go through StatusBadge — critical/high/low are
 *  too generic to squat on the shared status→tone map (the URGENCY_TONE precedent).
 *  critical and high share `danger`; the tab/label text distinguishes them. */
const SEVERITY_TONE: Record<Severity, 'danger' | 'warning' | 'info' | 'neutral'> = {
  critical: 'danger',
  high: 'danger',
  medium: 'warning',
  low: 'info',
  unknown: 'neutral',
}

const SOURCE_STATUS_TONE: Record<string, 'success' | 'danger' | 'neutral'> = {
  ok: 'success',
  error: 'danger',
  pending: 'neutral',
}

function age(iso: string | null): string {
  if (!iso) return '—'
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 60) return `${mins}m`
  if (mins < 1440) return `${Math.round(mins / 60)}h`
  return `${Math.round(mins / 1440)}d`
}

export function VulnerabilitiesPage() {
  const qc = useQueryClient()
  const { notify } = useToast()

  const [severity, setSeverity] = useState('all')
  const [source, setSource] = useState('')
  const [acknowledged, setAcknowledged] = useState('false') // default: open only
  const [term, setTerm] = useState('')
  const [page, setPage] = useState(1)

  const params = new URLSearchParams()
  if (severity !== 'all') params.set('severity', severity)
  if (source) params.set('source', source)
  if (acknowledged) params.set('acknowledged', acknowledged)
  if (term) params.set('q', term)
  params.set('page', String(page))

  const { data: status } = useQuery({
    queryKey: ['vulnerabilities', 'status'],
    queryFn: () => api.get<VulnStatus>('/vulnerabilities/status'),
  })

  const { data, isLoading, isError } = useQuery({
    queryKey: ['vulnerabilities', params.toString()],
    queryFn: () => api.get<VulnerabilitiesResponse>(`/vulnerabilities?${params.toString()}`),
  })

  const { data: sources } = useQuery({
    queryKey: ['vulnerabilities', 'sources'],
    queryFn: () => api.get<VulnSourcesResponse>('/vulnerabilities/sources'),
  })

  const scan = useMutation({
    mutationFn: () => api.post<ScanSummary>('/vulnerabilities/scan'),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['vulnerabilities'] })
      notify(
        `Scanned ${r.sources} source(s): ${r.created} new, ${r.updated} updated.`,
        'success',
      )
    },
    onError: (err) =>
      notify(err instanceof ApiError ? err.message : 'Scan failed', 'danger'),
  })

  const setAck = useMutation({
    mutationFn: ({ id, ack }: { id: number; ack: boolean }) =>
      api.post(`/vulnerabilities/${id}/${ack ? 'acknowledge' : 'unacknowledge'}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vulnerabilities'] }),
    onError: (err) =>
      notify(err instanceof ApiError ? err.message : 'Could not update the finding', 'danger'),
  })

  const exportCsv = useMutation({
    mutationFn: () => {
      const p = new URLSearchParams()
      if (severity !== 'all') p.set('severity', severity)
      if (source) p.set('source', source)
      if (acknowledged) p.set('acknowledged', acknowledged)
      return downloadFile(`/vulnerabilities/export.csv?${p.toString()}`, 'vulnerabilities.csv')
    },
    onError: (err) =>
      notify(err instanceof ApiError ? err.message : 'Export failed', 'danger'),
  })

  function changeSeverity(v: string) {
    setSeverity(v)
    setPage(1)
  }

  const scanNowButton = (
    <Button disabled={scan.isPending} onClick={() => scan.mutate()}>
      {scan.isPending ? 'Scanning…' : 'Scan now'}
    </Button>
  )

  if (isLoading) return <Spinner label="Loading vulnerabilities…" />
  if (isError || !data) return <ErrorState message="Could not load the vulnerability list." />

  // Nothing scanned yet: guide the first scan instead of showing an empty table.
  if (status?.never_scanned && data.total === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Vulnerabilities"
          subtitle="CVEs pulled from OSV.dev for the technologies we run."
          action={scanNowButton}
        />
        <Card>
          <EmptyState message="No scan has run yet. Run the first scan to pull findings from OSV.dev." />
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vulnerabilities"
        subtitle="CVEs pulled from OSV.dev for the technologies we run."
        action={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={exportCsv.isPending}
                    onClick={() => exportCsv.mutate()}>
              Export CSV
            </Button>
            {scanNowButton}
          </div>
        }
      />

      <Tabs
        tabs={TABS.map((t) => ({
          ...t,
          label: t.value === 'all' ? t.label : `${t.label} (${data.counts[t.value] ?? 0})`,
        }))}
        active={severity}
        onChange={changeSeverity}
      />

      <div className="flex flex-wrap gap-3">
        <Select value={source} onChange={(e) => { setSource(e.target.value); setPage(1) }}>
          <option value="">All sources</option>
          {data.sources.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </Select>
        <Select value={acknowledged} onChange={(e) => { setAcknowledged(e.target.value); setPage(1) }}>
          <option value="false">Open ({data.ack_counts.open})</option>
          <option value="true">Acknowledged ({data.ack_counts.acknowledged})</option>
          <option value="all">All</option>
        </Select>
        <Input
          value={term}
          onChange={(e) => { setTerm(e.target.value); setPage(1) }}
          placeholder="Search CVE or description…"
        />
      </div>

      <Card>
        {data.vulnerabilities.length === 0 ? (
          <EmptyState message="No findings match these filters." />
        ) : (
          <>
            <Table>
              <THead columns={['CVE', 'Severity', 'Source', 'Affected', 'Fixed In', 'Published', 'Ack', '']} />
              <tbody>
                {data.vulnerabilities.map((v) => (
                  <tr key={v.id} className="border-t border-border-light hover:bg-hover">
                    <TCell className="font-mono text-xs">
                      {v.url ? (
                        <a href={v.url} target="_blank" rel="noreferrer"
                           className="text-accent hover:underline" onClick={(e) => e.stopPropagation()}>
                          {v.cve_id}
                        </a>
                      ) : v.cve_id}
                    </TCell>
                    <TCell><Badge tone={SEVERITY_TONE[v.severity] ?? 'neutral'}>{v.severity}</Badge></TCell>
                    <TCell className="text-text-secondary">{v.technology ?? v.source}</TCell>
                    <TCell className="font-mono text-xs text-text-secondary">{v.affected_version ?? '—'}</TCell>
                    <TCell className="font-mono text-xs text-text-secondary">{v.fixed_version ?? '—'}</TCell>
                    <TCell className="text-text-secondary">{age(v.published)}</TCell>
                    <TCell>
                      {v.acknowledged
                        ? <Badge tone="neutral">Acked</Badge>
                        : <span className="text-text-muted">—</span>}
                    </TCell>
                    <TCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={setAck.isPending}
                        onClick={() => setAck.mutate({ id: v.id, ack: !v.acknowledged })}
                      >
                        {v.acknowledged ? 'Unack' : 'Ack'}
                      </Button>
                    </TCell>
                  </tr>
                ))}
              </tbody>
            </Table>
            <div className="flex items-center justify-between border-t border-border-light px-5 py-3 text-sm">
              <span className="text-text-muted">Page {data.page} of {data.pages || 1}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" disabled={data.page <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</Button>
                <Button size="sm" variant="secondary" disabled={data.page >= data.pages}
                        onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          </>
        )}
      </Card>

      {sources && sources.sources.length > 0 && (
        <Card>
          <div className="border-b border-border-light px-5 py-3 text-sm font-semibold text-text-secondary">
            Sources
          </div>
          <Table>
            <THead columns={['Source', 'Ecosystem', 'Package', 'Status', 'Findings', 'Last scan']} />
            <tbody>
              {sources.sources.map((s) => (
                <tr key={s.source} className="border-t border-border-light">
                  <TCell className="font-medium">{s.technology ?? s.source}</TCell>
                  <TCell className="text-text-secondary">{s.ecosystem ?? '—'}</TCell>
                  <TCell className="font-mono text-xs text-text-secondary">{s.package ?? '—'}</TCell>
                  <TCell>
                    <Badge tone={SOURCE_STATUS_TONE[s.status] ?? 'neutral'}>{s.status}</Badge>
                    {s.error && <span className="ml-2 text-xs text-danger-fg">{s.error}</span>}
                  </TCell>
                  <TCell className="text-text-secondary">{s.found_count}</TCell>
                  <TCell className="text-text-secondary">{age(s.last_scanned_at)}</TCell>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  )
}
