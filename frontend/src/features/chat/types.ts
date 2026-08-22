export interface ChatMessage {
  id: number
  role: 'user' | 'agent'
  content: string
  draft: Record<string, unknown> | null
  request_type: 'service' | 'repo' | null
  created_at: string | null
}

export interface Conversation {
  id: number
  project_id: number
  project: string | null
  status: string
  turn_count: number
  max_turns: number
  created_at: string | null
  messages: ChatMessage[]
}

export interface TurnResult {
  reply: string
  ready: boolean
  missing: string[]
  request_type: 'service' | 'repo' | null
  draft: Record<string, unknown> | null
}

export interface ChatStatus {
  enabled: boolean
}
