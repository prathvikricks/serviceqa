// Local TS interfaces for the admin feature pages. Mirrors the JSON shapes
// produced by app/blueprints/api/serializers.py and admin endpoints.

export type CloudProvider = 'azure' | 'aws'
export type ProfileMode = 'mock' | 'real'

export interface AdminProject {
  id: number
  name: string
  slug: string
  cloud_provider: CloudProvider
  /** 'mock' simulates the cloud entirely; 'real' uses the stored credentials. */
  mode: ProfileMode
  is_active: boolean
  environment_count: number
  member_count: number | null
}

export interface AzureProviderConfig {
  tenant_id: string
  client_id: string
  subscription_id: string
  client_secret_set: boolean
}

export interface AwsProviderConfig {
  region: string
  account_id: string
  access_key_id: string
  secret_access_key_set: boolean
}

export type ProviderConfig = AzureProviderConfig | AwsProviderConfig

export interface AdminEnvironment {
  id: number
  project_id: number
  name: string
  display_name: string
  region: string | null
  resource_group: string | null
  total_hourly_cost: number
  service_count: number
}

export interface AdminMember {
  id: number
  project_id: number
  user_id: number
  username: string
  email: string
  role: string
  /** What they are on THIS project: 'developer' | 'devops'. Distinct from
   *  `role` above, which is their global role. Project-devops is what routes
   *  this project's approvals to them. */
  project_role: string
  /** Whether this member may reveal the project's secret values. */
  can_view_secrets: boolean
  added_by: string | null
  added_at: string | null
}

export interface AdminProjectDetail extends AdminProject {
  description: string | null
  provider_config: ProviderConfig
  environments: AdminEnvironment[]
  members: AdminMember[]
}

export interface ProjectSecret {
  id: number
  project_id: number
  /** null = the secret applies to every environment in the project. */
  environment_id: number | null
  /** Human label for the scope, e.g. 'UAT' or 'All environments'. */
  scope: string
  key: string
  description: string | null
  created_by: string | null
  created_at: string | null
  updated_at: string | null
  /** Whether the CURRENT user may reveal it — display hint, not the check. */
  can_reveal: boolean
}

/** A secret listed live from AWS on the central manager (GET /admin/aws-secrets). */
export interface AwsSecretListing {
  aws_arn: string
  aws_name: string
  aws_region: string
  description: string | null
  mappings: { assoc_id: number; project_id: number; project_name: string | null; scope: string }[]
}

/** An AWS secret mapped to a project (GET /projects/<id>/aws-secrets).
 *  `id` is the mapping id — what reveal and dissociate operate on. */
export interface ProjectAwsSecret {
  id: number
  project_id: number
  environment_id: number | null
  scope: string
  key: string
  aws_name: string
  aws_region: string
  aws: true
  can_reveal: boolean
}

export interface AdminService {
  id: number
  environment_id: number
  name: string
  service_type: string
  cloud_resource_id: string
  hourly_cost: number
  current_status: string
  is_active: boolean
  last_status_check: string | null
}

// A live resource discovered from a project's cloud account (GET /projects/<id>/discover/<type>).
export interface DiscoveredResource {
  id: string
  name: string
  status?: string
  location?: string
  resource_group?: string
  size?: string
  version?: string
}
export interface ResourceGroup {
  name: string
  location: string
}

export interface AdminUser {
  id: number
  username: string
  email: string
  role: string
  is_active: boolean
  is_admin: boolean
  is_devops: boolean
  is_developer: boolean
  created_at: string | null
}

export interface MetaOption {
  value: string
  label: string
}

export interface AdminMeta {
  cloud_providers: MetaOption[]
  modes: MetaOption[]
  service_types: Record<string, string[]>
  service_type_labels: Record<string, string>
  roles: MetaOption[]
}

// --- Costs ----------------------------------------------------------------

export interface CostEnvBreakdown {
  environment_id: number
  environment: string
  /** Recorded spend for the selected month. */
  cost: number
  /** What this environment bills per hour while everything in it is running. */
  hourly_cost: number
}

export interface CostRecord {
  id: number
  request_id: number
  environment_id: number
  environment: string | null
  runtime_hours: number
  cost: number
  month: string
  recorded_at: string | null
}

export interface ProjectCosts {
  project: { id: number; name: string }
  /** The month being shown ('YYYY-MM'), or '' when nothing has been recorded. */
  month: string
  available_months: string[]
  environments: CostEnvBreakdown[]
  records: CostRecord[]
  total_cost: number
}
