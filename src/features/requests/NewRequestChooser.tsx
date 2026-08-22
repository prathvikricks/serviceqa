import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { GitBranch, MessageSquare, Power } from 'lucide-react'
import { api } from '../../lib/api'
import { PageHeader } from '../../components/ui/Page'
import type { ChatStatus } from '../chat/types'

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

const CHAT_CHOICE: Choice = {
  to: '/chat',
  icon: <MessageSquare className="h-6 w-6" />,
  title: 'Not sure what you need?',
  description: "Describe it in your own words and we'll draft the request for you.",
}

export function NewRequestChooser() {
  const navigate = useNavigate()

  // Hidden entirely when no GEMINI_API_KEY is configured — a dead card that
  // 503s is worse than no card.
  const { data: chat } = useQuery({
    queryKey: ['chat', 'status'],
    queryFn: () => api.get<ChatStatus>('/chat/status'),
  })

  const choices = chat?.enabled ? [...CHOICES, CHAT_CHOICE] : CHOICES

  return (
    <div className="space-y-6">
      <PageHeader title="New Request" subtitle="What would you like to request?" />

      <div className="grid gap-4 sm:grid-cols-2 max-w-3xl">
        {choices.map((c) => (
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
