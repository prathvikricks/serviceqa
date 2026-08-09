import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import {
  Inbox,
  PlayCircle,
  Clock,
  DollarSign,
  FolderKanban,
  Boxes,
} from 'lucide-react'
import { api } from '../../lib/api'
import type { DashboardData, RequestSummary } from '../../lib/types'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { StatusBadge } from '../../components/ui/Badge'
import { PageHeader, Spinner } from '../../components/ui/Page'

interface Analytics {
  kpis: {
    total_requests: number
    active: number
    pending: number
    completed_30d: number
    est_cost_30d: number
    projects: number
    environments: number
  }
  requests_over_time: { day: string; count: number }[]
  by_status: { status: string; count: number }[]
  by_action: { action_type: string; count: number }[]
  cost_by_month: { month: string; cost: number }[]
  top_environments: { name: string; count: number }[]
}

const STATUS_COLOR: Record<string, string> = {
  active: 'var(--success-fg)',
  starting: 'var(--success-fg)',
  completed: 'var(--info-fg)',
  approved: 'var(--info-fg)',
  pending: 'var(--warning-fg)',
  declined: 'var(--danger-fg)',
  failed: 'var(--danger-fg)',
  cancelled: 'var(--neutral-fg)',
}
const statusColor = (s: string) => STATUS_COLOR[s] ?? 'var(--neutral-fg)'

const axisProps = {
  tick: { fill: 'var(--text-muted)', fontSize: 11 },
  stroke: 'var(--border)',
  tickLine: false,
}
const tooltipStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  color: 'var(--text-primary)',
  fontSize: 12,
}

function Kpi({ icon, label, value }: { icon: ReactNode; label: string; value: string | number }) {
  return (
    <Card>
      <CardBody className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-accent-soft text-accent">
          {icon}
        </span>
        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-text-muted">
            {label}
          </p>
          <p className="text-2xl font-semibold tracking-tight">{value}</p>
        </div>
      </CardBody>
    </Card>
  )
}

function ChartCard({
  title,
  children,
  empty,
}: {
  title: string
  children: ReactNode
  empty: boolean
}) {
  return (
    <Card>
      <CardHeader title={title} />
      <CardBody>
        {empty ? (
          <p className="flex h-[220px] items-center justify-center text-sm text-text-muted">
            No data yet.
          </p>
        ) : (
          <div className="h-[220px]">{children}</div>
        )}
      </CardBody>
    </Card>
  )
}

function MiniTable({ title, rows, action }: { title: string; rows: RequestSummary[]; action?: ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} action={action} />
      {rows.length === 0 ? (
        <CardBody className="text-sm text-text-muted">Nothing here yet.</CardBody>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {rows.slice(0, 6).map((r) => (
                <tr key={r.id} className="border-t border-border-light hover:bg-hover">
                  <td className="px-5 py-2.5 font-medium">#{r.id}</td>
                  <td className="px-5 py-2.5 text-text-secondary">{r.project}</td>
                  <td className="px-5 py-2.5 text-text-secondary">{r.environment}</td>
                  <td className="px-5 py-2.5">
                    <StatusBadge status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

export function DashboardPage() {
  const a = useQuery({ queryKey: ['analytics'], queryFn: () => api.get<Analytics>('/dashboard/analytics') })
  const d = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<DashboardData>('/dashboard') })

  if (a.isLoading || d.isLoading) return <Spinner label="Loading dashboard…" />
  if (a.error || !a.data) return <p className="text-danger-fg">Failed to load analytics.</p>
  const k = a.data.kpis

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle="Activity, cost, and environment analytics at a glance." />

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-6">
        <Kpi icon={<Inbox size={18} />} label="Requests" value={k.total_requests} />
        <Kpi icon={<PlayCircle size={18} />} label="Active" value={k.active} />
        <Kpi icon={<Clock size={18} />} label="Pending" value={k.pending} />
        <Kpi icon={<DollarSign size={18} />} label="30-day est." value={`$${k.est_cost_30d.toFixed(2)}`} />
        <Kpi icon={<FolderKanban size={18} />} label="Projects" value={k.projects} />
        <Kpi icon={<Boxes size={18} />} label="Environments" value={k.environments} />
      </div>

      {/* Requests over time */}
      <ChartCard title="Requests · last 30 days" empty={a.data.requests_over_time.every((p) => p.count === 0)}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={a.data.requests_over_time} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id="reqFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.35} />
                <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
            <XAxis dataKey="day" {...axisProps} interval={4} />
            <YAxis allowDecimals={false} {...axisProps} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: 'var(--border)' }} />
            <Area type="monotone" dataKey="count" stroke="var(--accent)" strokeWidth={2} fill="url(#reqFill)" />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Status donut + cost bar */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Requests by status" empty={a.data.by_status.length === 0}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={a.data.by_status}
                dataKey="count"
                nameKey="status"
                innerRadius={52}
                outerRadius={82}
                paddingAngle={2}
                stroke="var(--surface)"
              >
                {a.data.by_status.map((s) => (
                  <Cell key={s.status} fill={statusColor(s.status)} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
          <div className="-mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
            {a.data.by_status.map((s) => (
              <span key={s.status} className="flex items-center gap-1.5 text-xs text-text-secondary">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: statusColor(s.status) }} />
                {s.status} ({s.count})
              </span>
            ))}
          </div>
        </ChartCard>

        <ChartCard title="Cost by month" empty={a.data.cost_by_month.every((m) => m.cost === 0)}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={a.data.cost_by_month} margin={{ top: 6, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
              <XAxis dataKey="month" {...axisProps} />
              <YAxis {...axisProps} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--hover)' }} formatter={(v) => `$${v}`} />
              <Bar dataKey="cost" fill="var(--accent)" radius={[6, 6, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Top environments */}
      <ChartCard title="Top environments by activity" empty={a.data.top_environments.length === 0}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            data={a.data.top_environments}
            margin={{ top: 4, right: 12, left: 8, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" horizontal={false} />
            <XAxis type="number" allowDecimals={false} {...axisProps} />
            <YAxis type="category" dataKey="name" width={110} {...axisProps} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--hover)' }} />
            <Bar dataKey="count" fill="var(--accent)" radius={[0, 6, 6, 0]} maxBarSize={26} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Slim lists */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <MiniTable
          title="Pending approvals"
          rows={d.data?.pending_approvals ?? []}
          action={
            <Link to="/approvals" className="text-sm font-medium text-accent hover:underline">
              Review all
            </Link>
          }
        />
        <MiniTable title="Recent activity" rows={d.data?.recent_requests ?? []} />
      </div>
    </div>
  )
}
