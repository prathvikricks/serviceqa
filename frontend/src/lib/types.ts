export type Role = 'developer' | 'devops' | 'admin'

export interface User {
  id: number
  username: string
  email: string
  role: Role
  is_active: boolean
  is_admin: boolean
  is_devops: boolean
  is_developer: boolean
  created_at: string | null
}

export interface DashboardStats {
  active_requests: number
  pending_approvals: number
  total_projects: number
  total_environments: number
}

export interface RequestSummary {
  id: number
  requester: string
  environment: string
  project: string
  action_type: string
  start_time: string | null
  end_time: string | null
  status: string
  estimated_cost: number | null
  created_at: string | null
}

export interface DashboardData {
  stats: DashboardStats
  active_requests: RequestSummary[]
  pending_approvals: RequestSummary[]
  recent_requests: RequestSummary[]
}
