export interface ApprovalRequest {
  id: number
  requester: string
  requester_id: number
  request_type: 'service' | 'repo'
  environment_id: number | null
  environment: string | null
  project: string | null
  project_id: number | null
  repo_name: string | null
  repo_description: string | null
  repo_visibility: 'private' | 'public' | null
  git_provider: string | null
  repo_url: string | null
  git_error: string | null
  action_type: string
  start_time: string | null
  end_time: string | null
  reason: string | null
  status: string
  estimated_cost: number | null
  created_at: string | null
  updated_at: string | null
}

export interface ApprovalsResponse {
  requests: ApprovalRequest[]
  statuses: string[]
}

export interface GitProvidersResponse {
  providers: string[]
}
