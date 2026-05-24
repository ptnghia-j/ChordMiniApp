export type StatusServiceId = 'beat' | 'chord' | 'sheetsage' | 'gemini';

export type PublicServiceStatus = 'operational' | 'degraded' | 'outage' | 'unknown';

export type PublicOverallStatus = 'operational' | 'degraded' | 'partial_outage' | 'major_outage' | 'unknown';

export type StatusProbeKind = 'health' | 'metadata' | 'generation';

export type IncidentSeverity = 'minor' | 'major' | 'critical';

export interface PublicStatusProbeDetail {
  serviceId: StatusServiceId;
  serviceLabel: string;
  probeKind: StatusProbeKind;
  endpointId?: string;
  status: PublicServiceStatus;
  ok: boolean;
  latencyMs: number | null;
  checkedAt: string;
  failureReason?: 'http' | 'network' | 'timeout';
  httpStatus?: number;
  attempts?: number;
  timeoutMs?: number;
  componentResults?: PublicStatusProbeDetail[];
}

export interface PublicStatusServiceSummary {
  id: StatusServiceId;
  label: string;
  status: PublicServiceStatus;
  uptimePct: number;
  totalChecks: number;
  successfulChecks: number;
  degradedChecks: number;
  failedChecks: number;
  consecutiveFailedChecks: number;
  lastCheckedAt: string | null;
  latencyMs: number | null;
  lastProbe: PublicStatusProbeDetail | null;
  recentProbes: PublicStatusProbeDetail[];
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

export interface StatusProbeResult extends PublicStatusProbeDetail {
  serviceId: StatusServiceId;
  serviceLabel: string;
  probeKind: StatusProbeKind;
  status: PublicServiceStatus;
  ok: boolean;
  latencyMs: number | null;
  checkedAt: string;
  sanitizedSummary: string;
  componentResults?: PublicStatusProbeDetail[];
}
