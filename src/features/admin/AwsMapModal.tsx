import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { Button } from '../../components/ui/Button'
import { Field, Select } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/Toast'
import type { AdminProject, AdminProjectDetail } from './adminTypes'

/** Minimal shape needed to map a secret — shared by the list and detail pages. */
export interface MappableSecret {
  aws_arn: string
  aws_name: string
  aws_region: string
}

/**
 * Map an AWS secret to a project (optional environment). Reused by the central
 * AWS Secrets list and the per-secret detail page.
 */
export function MapModal({
  secret,
  onClose,
  onDone,
}: {
  secret: MappableSecret
  onClose: () => void
  onDone: () => void
}) {
  const { notify } = useToast()
  const [projectId, setProjectId] = useState('')
  const [environmentId, setEnvironmentId] = useState('')

  const projectsQuery = useQuery({
    queryKey: ['admin', 'projects'],
    queryFn: () => api.get<{ projects: AdminProject[] }>('/admin/projects'),
  })
  const detailQuery = useQuery({
    queryKey: ['admin', 'projects', projectId],
    queryFn: () => api.get<AdminProjectDetail>(`/admin/projects/${projectId}`),
    enabled: !!projectId,
  })

  const associate = useMutation({
    mutationFn: () =>
      api.post(`/admin/projects/${projectId}/aws-secrets`, {
        aws_arn: secret.aws_arn,
        aws_name: secret.aws_name,
        aws_region: secret.aws_region,
        environment_id: environmentId || null,
      }),
    onSuccess: () => {
      notify('Mapped to project.', 'success')
      onDone()
    },
    onError: (err: Error) => notify(err.message, 'danger'),
  })

  return (
    <Modal
      open
      onClose={onClose}
      title={`Map ${secret.aws_name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={associate.isPending || !projectId} onClick={() => associate.mutate()}>
            {associate.isPending ? 'Mapping…' : 'Map'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Project">
          <Select
            value={projectId}
            onChange={(e) => {
              setProjectId(e.target.value)
              setEnvironmentId('')
            }}
          >
            <option value="">
              {projectsQuery.isFetching ? 'Loading…' : 'Select a project…'}
            </option>
            {(projectsQuery.data?.projects ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Scope" hint="Pin to one environment, or leave for all environments.">
          <Select
            value={environmentId}
            onChange={(e) => setEnvironmentId(e.target.value)}
            disabled={!projectId}
          >
            <option value="">All environments</option>
            {(detailQuery.data?.environments ?? []).map((env) => (
              <option key={env.id} value={env.id}>
                {env.display_name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Modal>
  )
}
