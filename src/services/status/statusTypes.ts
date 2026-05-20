export type StatusServiceId = 'beat' | 'chord' | 'sheetsage' | 'gemini';

export type PublicServiceStatus = 'operational' | 'degraded' | 'outage' | 'unknown';

export type PublicOverallStatus = 'operational' | 'degraded' | 'partial_outage' | 'major_outage' | 'unknown';

export type StatusProbeKind = 'health' | 'metadata' | 'generation';

export type IncidentSeverity = 'minor' | 'major' | 'critical';

export interface PublicStatusServiceSummary {
  id: StatusServiceId;
  label: string;
  status: PublicServiceStatus;
  uptimePct: number;
  totalChecks: number;
  successfulChecks: number;
  degradedChecks: number;
  failedChecks: number;
  lastCheckedAt: string | null;
  latencyMs: number | null;
}

export interface PublicStatusIncident {
  id: string;
  serviceId: string;
  serviceLabel: string;
  severity: IncidentSeverity;
  status: 'investigating' | 'resolved';
  title: string;
  summary: string;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number | null;
  probeKind: StatusProbeKind;
}

export interface PublicStatusAnalysis {
  status: 'pending' | 'complete' | 'failed' | 'skipped';
  summary: string | null;
  patternNotes: string | null;
  generatedAt: string | null;
  attempts: number;
  model: string | null;
}

export interface PublicStatusReport {
  id?: string;
  date: string;
  updatedAt: string;
  overallStatus: PublicOverallStatus;
  services: Record<StatusServiceId, PublicStatusServiceSummary>;
  incidents: PublicStatusIncident[];
  analysis: PublicStatusAnalysis;
  expiresAtMs: number;
}

export interface StatusProbeResult {
  serviceId: StatusServiceId;
  serviceLabel: string;
  probeKind: StatusProbeKind;
  status: PublicServiceStatus;
  ok: boolean;
  latencyMs: number | null;
  checkedAt: string;
  sanitizedSummary: string;
  failureReason?: 'http' | 'network' | 'timeout';
}
