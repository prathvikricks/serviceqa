// Local TS interfaces for the requests + activity features.
// Mirrors the backend serializers in app/blueprints/api/serializers.py.

export interface RequestSummary {
  id: number
  requester: string
  requester_id: number
  request_type: 'service' | 'repo'
  environment_id: number | null
  environment: string | null
  project: string | null
  project_id: number | null
  // Repo-request fields (null for service requests).
  repo_name: string | null
  repo_description: string | null
  repo_visibility: 'private' | 'public' | null
  git_provider: string | null
  repo_url: string | null
  git_error: string | null
  action_type: string
  start_time: string | null
  end_time: string | null
  schedule_type: string
  recurrence_days: string[]
  start_hm: string | null
  stop_hm: string | null
  recur_until: string | null
  recurrence_label: string | null
  reason: string
  status: string
  estimated_cost: number | null
  created_at: string | null
  updated_at: string | null
}

export interface RequestServiceItem {
  id: number
  cloud_service_id: number
  name: string
  type: string
  action_status: string | null
  started_at: string | null
  stopped_at: string | null
  error: string | null
}

export interface ScheduledJobItem {
  id: number
  request_id: number
  type: string
  scheduled_time: string | null
  executed_at: string | null
  status: string
  error: string | null
  // Optional enrichment — present on some activity payloads.
  project?: string | null
  environment?: string | null
  requester?: string | null
}

export interface ApprovalInfo {
  id: number
  request_id: number
  approver: string | null
  decision: string
  comment: string | null
  auto_approved: boolean
  decided_at: string | null
}

export interface AuditEntry {
  id: number
  action: string
  entity_type: string
  entity_id: number
  user: string | null
  details: Record<string, unknown> | null
  ip_address: string | null
  created_at: string | null
}

export interface RequestDetail extends RequestSummary {
  duration_hours: number | null
  action_label: string | null
  parent_request_id: number | null
  services: RequestServiceItem[]
  jobs: ScheduledJobItem[]
  approval: ApprovalInfo | null
  activity: AuditEntry[]
}

export interface RequestsListResponse {
  requests: RequestSummary[]
  statuses: string[]
}

export interface ProjectOption {
  id: number
  name: string
  cloud_provider: string
  environment_count: number
}

export interface EnvironmentServiceOption {
  id: number
  name: string
  type: string
  status: string
  hourly_cost: number
}

export interface EnvironmentOption {
  id: number
  display_name: string
  total_hourly_cost: number
  service_count: number
  services: EnvironmentServiceOption[]
}

export interface ProjectsResponse {
  projects: ProjectOption[]
}

export interface EnvironmentsResponse {
  environments: EnvironmentOption[]
}

export interface ActivityResponse {
  jobs: ScheduledJobItem[]
  in_flight: RequestSummary[]
}
