import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  CheckCircle2,
  FolderKanban,
  Inbox,
  KeyRound,
  KeySquare,
  LayoutDashboard,
  LogOut,
  LifeBuoy,
  Menu,
  MessageSquare,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Settings as SettingsIcon,
  ShieldAlert,
  Sun,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { api } from '../../lib/api'
import type { ChatStatus } from '../../features/chat/types'
import type { TicketStatus } from '../../features/tickets/types'
import type { VulnStatus } from '../../features/vulnerabilities/types'
import { Brand } from '../Brand'
import { useAuth } from '../../auth/AuthContext'
import { useTheme } from '../../lib/theme'
import { useSidebar } from '../../lib/sidebar'
import { cn } from '../../lib/cn'

type Gate = (u: { is_devops: boolean; is_admin: boolean }) => boolean

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  show?: Gate
  /** Hidden unless the backend reports the chat assistant is configured. */
  chatOnly?: boolean
  /** Hidden unless the ticket queue is available (intake on, or tickets exist). */
  ticketsOnly?: boolean
  /** Hidden unless the vuln list is available (scanning on, or findings exist). */
  vulnOnly?: boolean
}

interface NavGroup {
  title: string
  items: NavItem[]
}

const NAV: NavGroup[] = [
  {
    title: 'Workspace',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/requests', label: 'Requests', icon: Inbox },
      { to: '/chat', label: 'Assistant', icon: MessageSquare, chatOnly: true },
      { to: '/secrets', label: 'Secrets', icon: KeyRound },
      { to: '/approvals', label: 'Approvals', icon: CheckCircle2, show: (u) => u.is_devops },
      { to: '/tickets', label: 'Tickets', icon: LifeBuoy, show: (u) => u.is_devops,
        ticketsOnly: true },
      { to: '/vulnerabilities', label: 'Vulnerabilities', icon: ShieldAlert,
        show: (u) => u.is_devops, vulnOnly: true },
      { to: '/activity', label: 'Activity', icon: Activity, show: (u) => u.is_devops },
    ],
  },
  {
    title: 'Administration',
    items: [
      { to: '/admin/projects', label: 'Projects', icon: FolderKanban, show: (u) => u.is_admin },
      { to: '/admin/secret-catalog', label: 'Secret Catalog', icon: KeySquare,
        show: (u) => u.is_admin },
      { to: '/admin/users', label: 'Users', icon: Users, show: (u) => u.is_admin },
      { to: '/admin/audit', label: 'Audit Log', icon: ScrollText, show: (u) => u.is_admin },
      { to: '/admin/settings', label: 'Settings', icon: SettingsIcon, show: (u) => u.is_admin },
    ],
  },
]

// Every nav target, used to decide exact-vs-prefix matching below.
const ALL_NAV_TARGETS = NAV.flatMap((g) => g.items.map((i) => i.to))

// A link should match its path EXACTLY (React Router `end`) when it's the root
// or a "section index" that other nav items nest under — e.g. `/hosting`
// (Catalog) would otherwise stay highlighted on `/hosting/deployments`, showing
// two active items at once. Leaf links keep prefix matching so their own detail
// pages (e.g. `/hosting/deployments/:id`) still highlight them.
function navExactMatch(to: string): boolean {
  return to === '/' || ALL_NAV_TARGETS.some((t) => t !== to && t.startsWith(to + '/'))
}

export function AppLayout() {
  const { user, logout } = useAuth()
  const { theme, toggle } = useTheme()
  const { collapsed, toggle: toggleCollapse } = useSidebar()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  // Server-side feature flag: no GEMINI_API_KEY means no assistant, so the
  // nav entry disappears rather than leading to a dead page.
  const { data: chat } = useQuery({
    queryKey: ['chat', 'status'],
    queryFn: () => api.get<ChatStatus>('/chat/status'),
  })

  // Stays visible once any ticket exists, so a queue with history does not
  // vanish because a client secret was rotated.
  const { data: tickets } = useQuery({
    queryKey: ['tickets', 'status'],
    queryFn: () => api.get<TicketStatus>('/tickets/status'),
  })

  // Same idea for the vuln list: visible once scanning is on or findings exist.
  const { data: vulns } = useQuery({
    queryKey: ['vulnerabilities', 'status'],
    queryFn: () => api.get<VulnStatus>('/vulnerabilities/status'),
  })

  if (!user) return null

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex flex-col border-r border-border bg-surface',
          'transition-[transform,width] duration-200 lg:static lg:translate-x-0',
          collapsed ? 'w-[64px]' : 'w-[250px]',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Header / logo + collapse toggle */}
        <div
          className={cn(
            'flex h-14 items-center px-3',
            collapsed ? 'justify-center' : 'justify-between',
          )}
        >
          {!collapsed && (
            <div className="flex items-center px-2">
              <Brand className="h-8" />
            </div>
          )}
          {collapsed ? (
            <button
              onClick={toggleCollapse}
              title="Expand sidebar"
              className="hidden rounded-[var(--radius-sm)] p-1.5 text-text-secondary hover:bg-hover lg:block"
            >
              <PanelLeftOpen size={18} />
            </button>
          ) : (
            <button
              onClick={toggleCollapse}
              title="Collapse sidebar"
              className="hidden rounded-[var(--radius-sm)] p-1.5 text-text-muted hover:bg-hover hover:text-text-primary lg:block"
            >
              <PanelLeftClose size={18} />
            </button>
          )}
        </div>

        <nav className={cn('flex-1 overflow-y-auto py-3', collapsed ? 'px-2' : 'px-3', 'space-y-5')}>
          {NAV.map((group) => {
            const items = group.items.filter(
              (i) =>
                (!i.show || i.show(user)) &&
                (!i.chatOnly || chat?.enabled) &&
                (!i.ticketsOnly || tickets?.enabled) &&
                (!i.vulnOnly || vulns?.enabled),
            )
            if (!items.length) return null
            return (
              <div key={group.title}>
                {collapsed ? (
                  <div className="mx-2 mb-2 border-t border-border-light" />
                ) : (
                  <p className="px-2 pb-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-text-muted">
                    {group.title}
                  </p>
                )}
                <div className="space-y-0.5">
                  {items.map((item) => {
                    const Icon = item.icon
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={navExactMatch(item.to)}
                        title={collapsed ? item.label : undefined}
                        onClick={() => setMobileOpen(false)}
                        className={({ isActive }) =>
                          cn(
                            'relative flex items-center rounded-[var(--radius-sm)] text-[0.85rem] font-medium transition-colors duration-150',
                            collapsed ? 'justify-center px-0 py-2' : 'gap-2.5 px-2.5 py-1.5',
                            // Vercel-style: neutral subtle active state, not a blue tint.
                            isActive
                              ? 'bg-hover text-text-primary'
                              : 'text-text-secondary hover:bg-hover hover:text-text-primary',
                          )
                        }
                      >
                        <Icon size={18} className="shrink-0" />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </NavLink>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </nav>

        {/* User block */}
        {!collapsed && (
          <p className="px-5 pb-2 text-[0.7rem] tracking-wide text-text-muted">
            Powered by DevOps Team
          </p>
        )}

        <div className="border-t border-border-light p-3">
          <div
            className={cn(
              'flex items-center rounded-[var(--radius-sm)]',
              collapsed ? 'justify-center' : 'gap-3 px-2 py-2',
            )}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
              {user.username.slice(0, 2).toUpperCase()}
            </div>
            {!collapsed && (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{user.username}</p>
                  <p className="truncate text-xs capitalize text-text-muted">{user.role}</p>
                </div>
                <button
                  onClick={handleLogout}
                  title="Log out"
                  className="rounded-[var(--radius-sm)] p-1.5 text-text-muted hover:bg-hover hover:text-text-primary"
                >
                  <LogOut size={16} />
                </button>
              </>
            )}
          </div>
          {collapsed && (
            <button
              onClick={handleLogout}
              title="Log out"
              className="mt-1 hidden w-full items-center justify-center rounded-[var(--radius-sm)] py-2 text-text-muted hover:bg-hover hover:text-text-primary lg:flex"
            >
              <LogOut size={16} />
            </button>
          )}
        </div>
      </aside>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center justify-between border-b border-border bg-surface/80 px-5 backdrop-blur">
          <button
            className="rounded-[var(--radius-sm)] p-1.5 text-text-secondary hover:bg-hover lg:hidden"
            onClick={() => setMobileOpen(true)}
            title="Open menu"
          >
            <Menu size={18} />
          </button>

          <div className="flex-1" />

          <button
            onClick={toggle}
            title="Toggle theme"
            className="rounded-[var(--radius-sm)] p-2 text-text-secondary hover:bg-hover"
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </header>

        <main className="flex-1 overflow-y-auto px-6 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
