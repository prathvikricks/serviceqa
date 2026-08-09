export interface ApprovalRequest {
  id: number
  requester: string
  requester_id: number
  environment_id: number
  environment: string
  project: string
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
