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
import { Inbox, PlayCircle, Clock, DollarSign, FolderKanban, Boxes } from 'lucide-react'
import { api } from '../../lib/api'
import type { DashboardData } from '../../lib/types'
import { useAuth } from '../../auth/AuthContext'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { PageHeader, Spinner } from '../../components/ui/Page'
import {
  type Analytics,
  Kpi,
  ChartCard,
  MiniTable,
  statusColor,
  axisProps,
  tooltipStyle,
} from './parts'

interface ProjectBrief {
  id: number
  name: string
}

/** Requests-over-30-days area chart — shared by both views. */
function RequestsOverTime({ data }: { data: Analytics['requests_over_time'] }) {
  return (
    <ChartCard title="Requests · last 30 days" empty={data.every((p) => p.count === 0)}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
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
  )
}

/** Requests-by-status donut — shared by both views. */
function StatusDonut({ data }: { data: Analytics['by_status'] }) {
  return (
    <ChartCard title="Requests by status" empty={data.length === 0}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="count"
            nameKey="status"
            innerRadius={52}
            outerRadius={82}
            paddingAngle={2}
            stroke="var(--surface)"
          >
            {data.map((s) => (
              <Cell key={s.status} fill={statusColor(s.status)} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
        </PieChart>
      </ResponsiveContainer>
      <div className="-mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
        {data.map((s) => (
          <span key={s.status} className="flex items-center gap-1.5 text-xs text-text-secondary">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: statusColor(s.status) }} />
            {s.status} ({s.count})
          </span>
        ))}
      </div>
    </ChartCard>
  )
}

const newRequestLink = (
  <Link to="/requests/new" className="text-sm font-medium text-accent hover:underline">
    New request
  </Link>
)

// --------------------------------------------------------------------------
// Developer dashboard — everything scoped to the signed-in developer.
// --------------------------------------------------------------------------

function DeveloperDashboard({ a, d }: { a: Analytics; d?: DashboardData }) {
  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get<{ projects: ProjectBrief[] }>('/projects'),
  })
  const k = a.kpis

  return (
    <div className="space-y-6">
      <PageHeader title="Your dashboard" subtitle="Your requests and projects at a glance." />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi icon={<Inbox size={18} />} label="My requests" value={k.total_requests} />
        <Kpi icon={<PlayCircle size={18} />} label="Active" value={k.active} />
        <Kpi icon={<Clock size={18} />} label="Pending" value={k.pending} />
        <Kpi icon={<FolderKanban size={18} />} label="My projects" value={k.projects} />
      </div>

      <RequestsOverTime data={a.requests_over_time} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <StatusDonut data={a.by_status} />
        <Card>
          <CardHeader
            title="My projects"
            action={
              <Link to="/secrets" className="text-sm font-medium text-accent hover:underline">
                Secrets
              </Link>
            }
          />
          {(projects.data?.projects ?? []).length === 0 ? (
            <CardBody className="text-sm text-text-muted">
              You're not a member of any project yet.
            </CardBody>
          ) : (
            <CardBody className="flex flex-wrap gap-2">
              {(projects.data?.projects ?? []).map((p) => (
                <span
                  key={p.id}
                  className="rounded-[var(--radius-sm)] border border-border px-3 py-1.5 text-sm text-text-secondary"
                >
                  {p.name}
                </span>
              ))}
            </CardBody>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <MiniTable
          title="My active requests"
          rows={d?.active_requests ?? []}
          emptyLabel="No active requests."
        />
        <MiniTable
          title="My recent requests"
          rows={d?.recent_requests ?? []}
          action={newRequestLink}
          emptyLabel="You haven't raised any requests yet."
        />
      </div>
    </div>
  )
}

// --------------------------------------------------------------------------
// Ops dashboard — the org-wide view for devops/admin (unchanged).
// --------------------------------------------------------------------------

function OpsDashboard({ a, d }: { a: Analytics; d?: DashboardData }) {
  const k = a.kpis
  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle="Activity, cost, and environment analytics at a glance." />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-6">
        <Kpi icon={<Inbox size={18} />} label="Requests" value={k.total_requests} />
        <Kpi icon={<PlayCircle size={18} />} label="Active" value={k.active} />
        <Kpi icon={<Clock size={18} />} label="Pending" value={k.pending} />
        <Kpi icon={<DollarSign size={18} />} label="30-day est." value={`$${k.est_cost_30d.toFixed(2)}`} />
        <Kpi icon={<FolderKanban size={18} />} label="Projects" value={k.projects} />
        <Kpi icon={<Boxes size={18} />} label="Environments" value={k.environments} />
      </div>

      <RequestsOverTime data={a.requests_over_time} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <StatusDonut data={a.by_status} />
        <ChartCard title="Cost by month" empty={a.cost_by_month.every((m) => m.cost === 0)}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={a.cost_by_month} margin={{ top: 6, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
              <XAxis dataKey="month" {...axisProps} />
              <YAxis {...axisProps} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--hover)' }} formatter={(v) => `$${v}`} />
              <Bar dataKey="cost" fill="var(--accent)" radius={[6, 6, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="Top environments by activity" empty={a.top_environments.length === 0}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart layout="vertical" data={a.top_environments} margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" horizontal={false} />
            <XAxis type="number" allowDecimals={false} {...axisProps} />
            <YAxis type="category" dataKey="name" width={110} {...axisProps} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--hover)' }} />
            <Bar dataKey="count" fill="var(--accent)" radius={[0, 6, 6, 0]} maxBarSize={26} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <MiniTable
          title="Pending approvals"
          rows={d?.pending_approvals ?? []}
          action={
            <Link to="/approvals" className="text-sm font-medium text-accent hover:underline">
              Review all
            </Link>
          }
        />
        <MiniTable title="Recent activity" rows={d?.recent_requests ?? []} />
      </div>
    </div>
  )
}

export function DashboardPage() {
  const { user } = useAuth()
  const a = useQuery({ queryKey: ['analytics'], queryFn: () => api.get<Analytics>('/dashboard/analytics') })
  const d = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<DashboardData>('/dashboard') })

  if (a.isLoading || d.isLoading) return <Spinner label="Loading dashboard…" />
  if (a.error || !a.data) return <p className="text-danger-fg">Failed to load analytics.</p>

  // Developers get a view scoped to their own work; devops/admin get org-wide.
  return user?.is_devops
    ? <OpsDashboard a={a.data} d={d.data} />
    : <DeveloperDashboard a={a.data} d={d.data} />
}
