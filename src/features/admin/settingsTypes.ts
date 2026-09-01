export interface AppSetting {
  key: string
  group: string
  label: string
  help: string | null
  secret: boolean
  is_set: boolean
  /** Where the effective value comes from — clearing only removes ours. */
  source: 'settings' | 'environment' | null
  hint: string | null
  updated_by: string | null
  updated_at: string | null
}

export interface SettingsResponse {
  settings: AppSetting[]
  groups: Record<string, { label: string; blurb: string }>
}

export interface IntegrationStatus {
  llm: { configured: boolean; model: string | null }
  mail: {
    configured: boolean
    /** Graph actually answered — distinct from merely being filled in. */
    reachable: boolean
    mailbox: string | null
    error: string | null
  }
  aws: {
    configured: boolean
    /** AWS actually answered a list call — distinct from merely being filled in. */
    reachable: boolean
    region: string | null
    secret_count: number | null
    error: string | null
  }
}

export interface GeminiModel {
  name: string
  display_name: string
}
