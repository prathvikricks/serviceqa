import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { Card, CardBody } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/Modal'
import { PageHeader, Spinner, ErrorState, EmptyState } from '../../components/ui/Page'
import { useToast } from '../../components/ui/Toast'
import type { AdminProject } from './adminTypes'

export function ProjectsPage() {
  const qc = useQueryClient()
  const { notify } = useToast()
  const [deleteTarget, setDeleteTarget] = useState<AdminProject | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'projects'],
    queryFn: () => api.get<{ projects: AdminProject[] }>('/admin/projects'),
  })

  const toggle = useMutation({
    mutationFn: (id: number) => api.post(`/admin/projects/${id}/toggle`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'projects'] })
      notify('Project updated.', 'success')
    },
    onError: (err: Error) => notify(err.message, 'danger'),
  })

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/projects/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'projects'] })
      notify('Project deleted.', 'success')
      setDeleteTarget(null)
    },
    onError: (err: Error) => notify(err.message, 'danger'),
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        subtitle="Cloud projects and their environments."
        action={
          <Link to="/admin/projects/new">
            <Button>New Project</Button>
          </Link>
        }
      />

      {isLoading && <Spinner />}
      {error && <ErrorState message="Failed to load projects." />}
      {data && data.projects.length === 0 && <EmptyState message="No projects yet." />}

      {data && data.projects.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.projects.map((p) => (
            <Card key={p.id}>
              <CardBody className="space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Link
                      to={`/admin/projects/${p.id}`}
                      className="text-sm font-semibold text-text-primary hover:text-accent"
                    >
                      {p.name}
                    </Link>
                    <div className="mt-1.5 flex items-center gap-2">
                      <Badge tone="info">{p.cloud_provider}</Badge>
                      {/* Whether this project can spend real money is the most
                          important thing about it — show it, don't bury it. */}
                      <Badge tone={p.mode === 'real' ? 'warning' : 'neutral'}>{p.mode}</Badge>
                      <Badge tone={p.is_active ? 'success' : 'neutral'}>
                        {p.is_active ? 'active' : 'inactive'}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="flex gap-6 text-sm text-text-secondary">
                  <span>
                    <span className="font-semibold text-text-primary">{p.environment_count}</span>{' '}
                    environments
                  </span>
                  <span>
                    <span className="font-semibold text-text-primary">{p.member_count ?? 0}</span>{' '}
                    members
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Link to={`/admin/projects/${p.id}`}>
                    <Button variant="secondary" size="sm">
                      View
                    </Button>
                  </Link>
                  <Link to={`/admin/projects/${p.id}/edit`}>
                    <Button variant="secondary" size="sm">
                      Edit
                    </Button>
                  </Link>
                  <Link to={`/admin/projects/${p.id}/costs`}>
                    <Button variant="secondary" size="sm">
                      Costs
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={toggle.isPending}
                    onClick={() => toggle.mutate(p.id)}
                  >
                    {p.is_active ? 'Deactivate' : 'Activate'}
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => setDeleteTarget(p)}>
                    Delete
                  </Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete project"
        danger
        confirmLabel="Delete"
        message={
          deleteTarget
            ? `Permanently delete "${deleteTarget.name}" and all its environments? This cannot be undone.`
            : ''
        }
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && remove.mutate(deleteTarget.id)}
      />
    </div>
  )
}
