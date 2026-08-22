export interface Ticket {
  id: number
  reference: string | null
  title: string
  summary: string | null
  category: string | null
  urgency: string | null
  status: string
  source: 'email' | 'manual'
  enriched_by: string
  assignee: string | null
  assignee_id: number | null
  project: string | null
  project_id: number | null
  requester: string
  requester_email: string | null
  created_at: string | null
  updated_at: string | null
  resolved_at: string | null
}

export interface TicketComment {
  id: number
  author: string | null
  author_id: number | null
  body: string
  is_system: boolean
  created_at: string | null
}

export interface TicketDetail extends Ticket {
  body: string
  ack_state: string
  ack_error: string | null
  ack_sent_at: string | null
  comments: TicketComment[]
}

export interface TicketsResponse {
  tickets: Ticket[]
  statuses: string[]
  categories: string[]
  urgencies: string[]
  counts: Record<string, number>
  page: number
  pages: number
  total: number
}

export interface TicketStatus {
  /** Show the queue at all — true once intake works OR any ticket exists. */
  enabled: boolean
  /** The narrower question: is mail actually being polled? */
  intake_enabled: boolean
  mailbox: string | null
  trigger_address: string | null
  ack_enabled: boolean
  statuses: string[]
  categories: string[]
  urgencies: string[]
}
