export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'unknown'

export interface Vulnerability {
  id: number
  source: string
  technology: string | null
  /** Usually a CVE id, but OSV often only carries a GHSA/OSV id — don't assume
   *  a 'CVE-' prefix. */
  cve_id: string
  severity: Severity
  url: string | null
  affected_version: string | null
  fixed_version: string | null
  published: string | null
  first_seen: string | null
  acknowledged: boolean
  acknowledged_at: string | null
  acknowledged_by: string | null
}

export interface VulnerabilityDetail extends Vulnerability {
  description: string | null
  last_seen: string | null
}

export interface VulnerabilitiesResponse {
  vulnerabilities: Vulnerability[]
  severities: Severity[]
  sources: string[]
  counts: Record<string, number>
  ack_counts: { acknowledged: number; open: number }
  page: number
  pages: number
  total: number
}

export interface VulnSourceStatus {
  source: string
  technology: string | null
  ecosystem: string | null
  package: string | null
  status: 'ok' | 'error' | 'pending'
  last_scanned_at: string | null
  found_count: number
  error: string | null
}

export interface VulnSourcesResponse {
  sources: VulnSourceStatus[]
}

export interface VulnStatus {
  /** Show the page at all — true once scanning is on OR any finding exists. */
  enabled: boolean
  scan_enabled: boolean
  never_scanned: boolean
  last_scan_at: string | null
  severities: Severity[]
}

export interface ScanSummary {
  sources: number
  created: number
  updated: number
  found: number
  results: { source: string; created: number; updated: number; found: number; error: string | null }[]
}
