import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { Field, Input, Select } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/ui/Toast'
import { PageHeader } from '../../components/ui/Page'
import type {
  EnvironmentsResponse,
  ProjectsResponse,
  RequestDetail,
} from './types'

type ActionType = 'start_stop' | 'stop_start'
type ScheduleType = 'once' | 'weekly'

const WEEKDAYS: { token: string; label: string }[] = [
  { token: 'mon', label: 'Mon' },
  { token: 'tue', label: 'Tue' },
  { token: 'wed', label: 'Wed' },
  { token: 'thu', label: 'Thu' },
  { token: 'fri', label: 'Fri' },
  { token: 'sat', label: 'Sat' },
  { token: 'sun', label: 'Sun' },
]

export function NewRequestPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { notify } = useToast()

  const [projectId, setProjectId] = useState('')
  const [environmentId, setEnvironmentId] = useState('')
  const [actionType, setActionType] = useState<ActionType>('start_stop')
  const [scheduleType, setScheduleType] = useState<ScheduleType>('once')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  // Weekly recurrence
  const [days, setDays] = useState<string[]>([])
  const [startHm, setStartHm] = useState('09:00')
  const [stopHm, setStopHm] = useState('17:00')
  const [recurUntil, setRecurUntil] = useState('')
  const [reason, setReason] = useState('')

  function toggleDay(token: string) {
    setDays((prev) =>
      prev.includes(token) ? prev.filter((d) => d !== token) : [...prev, token],
    )
  }

  const { data: projectsData } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get<ProjectsResponse>('/projects'),
  })

  const { data: envData } = useQuery({
    queryKey: ['project-environments', projectId],
    queryFn: () =>
      api.get<EnvironmentsResponse>(`/projects/${projectId}/environments`),
    enabled: !!projectId,
  })

  const selectedEnv = useMemo(
    () => envData?.environments.find((e) => String(e.id) === environmentId),
    [envData, environmentId],
  )

  // Live cost estimate. One-time: hourly × window hours. Weekly: per-week
  // (days selected × window hours × hourly).
  const estimate = useMemo(() => {
    if (!selectedEnv) return null
    const hourly = selectedEnv.total_hourly_cost
    if (scheduleType === 'weekly') {
      if (!days.length || !startHm || !stopHm) return null
      const [sh, sm] = startHm.split(':').map(Number)
      const [eh, em] = stopHm.split(':').map(Number)
      const windowH = (eh * 60 + em - (sh * 60 + sm)) / 60
      if (!(windowH > 0)) return null
      const cost = windowH * days.length * hourly
      return { weekly: true, hours: windowH, days: days.length, hourly, cost }
    }
    if (!startTime || !endTime) return null
    const start = new Date(startTime).getTime()
    const end = new Date(endTime).getTime()
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null
    const hours = (end - start) / 3_600_000
    return { weekly: false, days: 1, hours, hourly, cost: hours * hourly }
  }, [selectedEnv, scheduleType, startTime, endTime, days, startHm, stopHm])

  const firstLabel = actionType === 'start_stop' ? 'Start time' : 'Stop time'
  const secondLabel = actionType === 'start_stop' ? 'Stop time' : 'Start time'

  const mutation = useMutation({
    mutationFn: () =>
      api.post<RequestDetail>(
        '/requests',
        scheduleType === 'weekly'
          ? {
              environment_id: Number(environmentId),
              action_type: actionType,
              schedule_type: 'weekly',
              recurrence_days: days,
              start_hm: startHm,
              stop_hm: stopHm,
              recur_until: recurUntil || null,
              reason,
            }
          : {
              environment_id: Number(environmentId),
              action_type: actionType,
              schedule_type: 'once',
              start_time: new Date(startTime).toISOString(),
              end_time: new Date(endTime).toISOString(),
              reason,
            },
      ),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['requests'] })
      notify('Request created', 'success')
      navigate(`/requests/${created.id}`)
    },
    onError: (err) => notify(err instanceof ApiError ? err.message : 'Failed to create request', 'danger'),
  })

  const weeklyValid = days.length > 0 && !!startHm && !!stopHm && startHm < stopHm
  const onceValid = !!startTime && !!endTime
  const canSubmit =
    !!environmentId &&
    reason.trim().length > 0 &&
    (scheduleType === 'weekly' ? weeklyValid : onceValid) &&
    !mutation.isPending

  function onProjectChange(value: string) {
    setProjectId(value)
    setEnvironmentId('')
  }

  return (
    <div className="space-y-6">
      <PageHeader title="New Request" subtitle="Schedule a start/stop window for an environment." />

      <Card className="max-w-2xl">
        <CardHeader title="Request details" />
        <CardBody>
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault()
              if (canSubmit) mutation.mutate()
            }}
          >
            <Field label="Project">
              <Select value={projectId} onChange={(e) => onProjectChange(e.target.value)}>
                <option value="">Select a project…</option>
                {projectsData?.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.cloud_provider})
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Environment">
              <Select
                value={environmentId}
                onChange={(e) => setEnvironmentId(e.target.value)}
                disabled={!projectId}
              >
                <option value="">
                  {projectId ? 'Select an environment…' : 'Select a project first'}
                </option>
                {envData?.environments.map((env) => (
                  <option key={env.id} value={env.id}>
                    {env.display_name} — ${env.total_hourly_cost.toFixed(2)}/hr ({env.service_count} services)
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Action type">
              <div className="flex gap-4 pt-1">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="action_type"
                    value="start_stop"
                    checked={actionType === 'start_stop'}
                    onChange={() => setActionType('start_stop')}
                  />
                  Start → Stop
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="action_type"
                    value="stop_start"
                    checked={actionType === 'stop_start'}
                    onChange={() => setActionType('stop_start')}
                  />
                  Stop → Start
                </label>
              </div>
            </Field>

            <Field label="Schedule">
              <div className="flex gap-4 pt-1">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="schedule_type"
                    value="once"
                    checked={scheduleType === 'once'}
                    onChange={() => setScheduleType('once')}
                  />
                  One time
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="schedule_type"
                    value="weekly"
                    checked={scheduleType === 'weekly'}
                    onChange={() => setScheduleType('weekly')}
                  />
                  Weekly
                </label>
              </div>
            </Field>

            {scheduleType === 'once' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={firstLabel}>
                  <Input
                    type="datetime-local"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </Field>
                <Field label={secondLabel}>
                  <Input
                    type="datetime-local"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                </Field>
              </div>
            ) : (
              <div className="space-y-4">
                <Field label="Repeat on">
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {WEEKDAYS.map((d) => {
                      const on = days.includes(d.token)
                      return (
                        <button
                          key={d.token}
                          type="button"
                          onClick={() => toggleDay(d.token)}
                          className={
                            'rounded-full border px-3 py-1 text-sm transition-colors ' +
                            (on
                              ? 'border-accent-border bg-accent text-on-accent'
                              : 'border-border bg-surface text-text-secondary hover:bg-hover')
                          }
                        >
                          {d.label}
                        </button>
                      )
                    })}
                  </div>
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={firstLabel}>
                    <Input type="time" value={startHm} onChange={(e) => setStartHm(e.target.value)} />
                  </Field>
                  <Field label={secondLabel}>
                    <Input type="time" value={stopHm} onChange={(e) => setStopHm(e.target.value)} />
                  </Field>
                </div>
                <Field label="Ends on (optional)" hint="Leave blank to repeat until cancelled.">
                  <Input type="date" value={recurUntil} onChange={(e) => setRecurUntil(e.target.value)} />
                </Field>
                {days.length > 0 && startHm >= stopHm && (
                  <p className="text-sm text-danger-fg">Stop time must be after start time.</p>
                )}
              </div>
            )}

            <Field label="Reason">
              <textarea
                className="w-full min-h-24 rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-border focus:outline-none focus:ring-2 focus:ring-accent/30"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why is this environment needed?"
              />
            </Field>

            <p className="text-sm text-text-secondary">
              {!estimate
                ? 'Estimated cost: select an environment and a valid time window.'
                : estimate.weekly
                  ? `Estimated cost: ~$${estimate.cost.toFixed(2)} / week (${estimate.days} day${estimate.days > 1 ? 's' : ''} × ${estimate.hours.toFixed(1)}h × $${estimate.hourly.toFixed(2)}/hr)`
                  : `Estimated cost: $${estimate.cost.toFixed(2)} (${estimate.hours.toFixed(1)}h × $${estimate.hourly.toFixed(2)}/hr)`}
            </p>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => navigate('/requests')}>
                Cancel
              </Button>
              <Button type="submit" disabled={!canSubmit}>
                {mutation.isPending ? 'Creating…' : 'Create Request'}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  )
}
