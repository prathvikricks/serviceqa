import { useNavigate } from 'react-router-dom'
import { GitBranch, Power } from 'lucide-react'
import { PageHeader } from '../../components/ui/Page'

interface Choice {
  to: string
  icon: React.ReactNode
  title: string
  description: string
}

const CHOICES: Choice[] = [
  {
    to: '/requests/new/service',
    icon: <Power className="h-6 w-6" />,
    title: 'Service Request',
    description: 'Schedule a start/stop window for an existing environment.',
  },
  {
    to: '/requests/new/repo',
    icon: <GitBranch className="h-6 w-6" />,
    title: 'Project · Repo Creation',
    description: 'Request a new Git repository. An approver creates it on GitHub or GitLab.',
  },
]

export function NewRequestChooser() {
  const navigate = useNavigate()

  return (
    <div className="space-y-6">
      <PageHeader title="New Request" subtitle="What would you like to request?" />

      <div className="grid gap-4 sm:grid-cols-2 max-w-3xl">
        {CHOICES.map((c) => (
          <button
            key={c.to}
            type="button"
            onClick={() => navigate(c.to)}
            className="flex flex-col items-start gap-3 rounded-[var(--radius-md)] border border-border bg-surface p-6 text-left transition-colors hover:border-accent-border hover:bg-hover focus:outline-none focus:ring-2 focus:ring-accent/30"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-sm)] bg-accent-soft text-accent">
              {c.icon}
            </span>
            <span className="text-base font-semibold text-text-primary">{c.title}</span>
            <span className="text-sm text-text-secondary">{c.description}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
