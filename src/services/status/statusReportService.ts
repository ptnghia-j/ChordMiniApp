import {
  deleteDocumentsWithAdminAccess,
  getDocumentWithAdminAccess,
  listDocumentsWithAdminAccess,
  setDocumentWithAdminAccess,
} from '@/services/firebase/firestoreAdminService';
import { getStatusConfig } from '@/services/status/statusConfig';
import type {
  PublicOverallStatus,
  PublicStatusAnalysis,
  PublicStatusIncident,
  PublicStatusReport,
  PublicStatusServiceSummary,
  PublicServiceStatus,
  StatusProbeResult,
  StatusServiceId,
} from '@/services/status/statusTypes';

export const STATUS_REPORTS_COLLECTION = 'statusReports';

const SERVICE_LABELS: Record<StatusServiceId, string> = {
  beat: 'Beat Detection',
  chord: 'Chord Recognition',
  sheetsage: 'Sheet Sage',
  yt2mp3go: 'YouTube Extraction',
};

const SERVICE_IDS: StatusServiceId[] = ['beat', 'chord', 'sheetsage', 'yt2mp3go'];

function clampPct(value: number): number {
  return Math.max(0, Math.min(100, Number(value.toFixed(2))));
}

export function getStatusDateId(date = new Date(), timezone = getStatusConfig().timezone): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

function emptyAnalysis(): PublicStatusAnalysis {
  return {
    status: 'pending',
    summary: null,
    patternNotes: null,
    generatedAt: null,
    attempts: 0,
    model: null,
  };
}

function emptyService(id: StatusServiceId): PublicStatusServiceSummary {
  return {
    id,
    label: SERVICE_LABELS[id],
    status: 'unknown',
    uptimePct: 0,
    totalChecks: 0,
    successfulChecks: 0,
    degradedChecks: 0,
    failedChecks: 0,
    lastCheckedAt: null,
    latencyMs: null,
  };
}

function createEmptyReport(date: string, now = new Date()): PublicStatusReport {
  const config = getStatusConfig();
  const services = Object.fromEntries(
    SERVICE_IDS.map((id) => [id, emptyService(id)]),
  ) as Record<StatusServiceId, PublicStatusServiceSummary>;

  return {
    date,
    updatedAt: now.toISOString(),
    overallStatus: 'unknown',
    services,
    incidents: [],
    analysis: emptyAnalysis(),
    expiresAtMs: now.getTime() + config.retentionDays * 24 * 60 * 60 * 1000,
  };
}

function normalizeStatus(status: unknown): PublicServiceStatus {
  return status === 'operational' || status === 'degraded' || status === 'outage' || status === 'unknown'
    ? status
    : 'unknown';
}

function normalizeService(id: StatusServiceId, service: Partial<PublicStatusServiceSummary> | undefined): PublicStatusServiceSummary {
  const totalChecks = Number(service?.totalChecks || 0);
  const successfulChecks = Number(service?.successfulChecks || 0);

  return {
    ...emptyService(id),
    ...service,
    id,
    label: SERVICE_LABELS[id],
    status: normalizeStatus(service?.status),
    totalChecks,
    successfulChecks,
    degradedChecks: Number(service?.degradedChecks || 0),
    failedChecks: Number(service?.failedChecks || 0),
    uptimePct: totalChecks > 0 ? clampPct((successfulChecks / totalChecks) * 100) : 0,
    lastCheckedAt: typeof service?.lastCheckedAt === 'string' ? service.lastCheckedAt : null,
    latencyMs: typeof service?.latencyMs === 'number' ? Math.round(service.latencyMs) : null,
  };
}

function computeOverallStatus(services: Record<StatusServiceId, PublicStatusServiceSummary>): PublicOverallStatus {
  const statuses = Object.values(services).map((service) => service.status);
  if (statuses.every((status) => status === 'unknown')) return 'unknown';
  if (statuses.some((status) => status === 'outage')) {
    return statuses.filter((status) => status === 'outage').length > 1 ? 'major_outage' : 'partial_outage';
  }
  if (statuses.some((status) => status === 'degraded')) return 'degraded';
  return 'operational';
}

function sanitizeReport(report: PublicStatusReport): PublicStatusReport {
  const services = Object.fromEntries(
    SERVICE_IDS.map((id) => [id, normalizeService(id, report.services?.[id])]),
  ) as Record<StatusServiceId, PublicStatusServiceSummary>;
  const incidents = Array.isArray(report.incidents) ? dedupeIncidents(report.date, report.incidents.map(sanitizeIncident)) : [];

  return {
    date: report.date,
    updatedAt: report.updatedAt,
    overallStatus: computeOverallStatus(services),
    services,
    incidents,
    analysis: {
      ...emptyAnalysis(),
      ...report.analysis,
      summary: typeof report.analysis?.summary === 'string' ? report.analysis.summary : null,
      patternNotes: typeof report.analysis?.patternNotes === 'string' ? report.analysis.patternNotes : null,
      generatedAt: typeof report.analysis?.generatedAt === 'string' ? report.analysis.generatedAt : null,
      attempts: Number(report.analysis?.attempts || 0),
      model: typeof report.analysis?.model === 'string' ? report.analysis.model : null,
    },
    expiresAtMs: Number(report.expiresAtMs || 0),
  };
}

function sanitizeIncident(incident: PublicStatusIncident): PublicStatusIncident {
  const serviceId = SERVICE_IDS.includes(incident.serviceId) ? incident.serviceId : 'beat';

  return {
    id: String(incident.id || `incident-${serviceId}-${incident.startedAt}`),
    serviceId,
    serviceLabel: SERVICE_LABELS[serviceId] || incident.serviceLabel || 'Service',
    severity: incident.severity === 'critical' || incident.severity === 'major' ? incident.severity : 'minor',
    status: incident.status === 'resolved' ? 'resolved' : 'investigating',
    title: String(incident.title || 'Service disruption').slice(0, 120),
    summary: String(incident.summary || 'A status probe reported degraded service.').slice(0, 240),
    startedAt: String(incident.startedAt),
    endedAt: typeof incident.endedAt === 'string' ? incident.endedAt : null,
    durationMinutes: typeof incident.durationMinutes === 'number' ? Math.max(0, Math.round(incident.durationMinutes)) : null,
    probeKind: incident.probeKind,
  };
}

function getIncidentId(date: string, serviceId: StatusServiceId, startedAt: string): string {
  const timeKey = startedAt.slice(11, 16).replace(':', '');
  return `${serviceId}-${date}-${timeKey || 'incident'}`;
}

function incidentSummary(serviceLabel: string, status: PublicServiceStatus): string {
  if (status === 'degraded') {
    return `${serviceLabel} showed degraded performance during status probing.`;
  }

  return `${serviceLabel} did not pass one or more status probes.`;
}

function severityRank(severity: PublicStatusIncident['severity']): number {
  if (severity === 'critical') return 3;
  if (severity === 'major') return 2;
  return 1;
}

function getDurationMinutes(startedAt: string, endedAt: string): number {
  const startedMs = new Date(startedAt).getTime();
  const endedMs = new Date(endedAt).getTime();
  if (!Number.isFinite(startedMs) || !Number.isFinite(endedMs) || endedMs < startedMs) {
    return 0;
  }

  return Math.round((endedMs - startedMs) / 60_000);
}

function isOpenIncident(incident: PublicStatusIncident): boolean {
  return incident.status !== 'resolved' || !incident.endedAt;
}

function dedupeIncidents(date: string, incidents: PublicStatusIncident[]): PublicStatusIncident[] {
  const incidentById = new Map<string, PublicStatusIncident>();

  for (const rawIncident of incidents.sort((left, right) => left.startedAt.localeCompare(right.startedAt))) {
    const id = rawIncident.id && !rawIncident.id.includes('-metadata-') && !rawIncident.id.includes('-extraction-')
      ? rawIncident.id
      : getIncidentId(date, rawIncident.serviceId, rawIncident.startedAt);
    const incident: PublicStatusIncident = {
      ...rawIncident,
      id,
      summary: rawIncident.status === 'resolved' && rawIncident.summary.includes('successful status probe confirmed')
        ? rawIncident.summary
        : incidentSummary(rawIncident.serviceLabel, rawIncident.title.toLowerCase().includes('degraded') ? 'degraded' : 'outage'),
    };
    const existing = incidentById.get(id);
    if (!existing) {
      incidentById.set(id, incident);
      continue;
    }

    if (incident.startedAt < existing.startedAt) {
      existing.startedAt = incident.startedAt;
    }

    if (incident.endedAt && (!existing.endedAt || incident.endedAt > existing.endedAt)) {
      existing.endedAt = incident.endedAt;
    }

    if (severityRank(incident.severity) > severityRank(existing.severity)) {
      existing.severity = incident.severity;
      existing.title = incident.title;
      existing.summary = incidentSummary(existing.serviceLabel, incident.title.toLowerCase().includes('degraded') ? 'degraded' : 'outage');
    }
  }

  return Array.from(incidentById.values()).sort((left, right) => right.startedAt.localeCompare(left.startedAt));
}

function incidentFromProbe(date: string, probe: StatusProbeResult): PublicStatusIncident | null {
  if (probe.status === 'operational' || probe.status === 'unknown') {
    return null;
  }

  const severity = probe.status === 'outage' ? 'major' : 'minor';
  const startedAt = probe.checkedAt;

  return {
    id: getIncidentId(date, probe.serviceId, startedAt),
    serviceId: probe.serviceId,
    serviceLabel: probe.serviceLabel,
    severity,
    status: 'investigating',
    title: probe.status === 'outage' ? `${probe.serviceLabel} outage` : `${probe.serviceLabel} degraded`,
    summary: incidentSummary(probe.serviceLabel, probe.status),
    startedAt,
    endedAt: null,
    durationMinutes: null,
    probeKind: probe.probeKind,
  };
}

function updateIncidentFromProbe(report: PublicStatusReport, date: string, probe: StatusProbeResult): void {
  if (probe.status === 'operational') {
    const openIncident = report.incidents
      .filter((incident) => incident.serviceId === probe.serviceId && isOpenIncident(incident))
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt))[0];

    if (openIncident) {
      openIncident.status = 'resolved';
      openIncident.endedAt = probe.checkedAt;
      openIncident.durationMinutes = getDurationMinutes(openIncident.startedAt, probe.checkedAt);
      openIncident.summary = `A later successful status probe confirmed ${openIncident.serviceLabel} was responding normally.`;
    }
    return;
  }

  const incident = incidentFromProbe(date, probe);
  if (!incident) {
    return;
  }

  const openIncident = report.incidents
    .filter((entry) => entry.serviceId === probe.serviceId && isOpenIncident(entry))
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))[0];

  if (openIncident) {
    if (severityRank(incident.severity) > severityRank(openIncident.severity)) {
      openIncident.severity = incident.severity;
      openIncident.title = incident.title;
      openIncident.summary = incident.summary;
      openIncident.probeKind = incident.probeKind;
    }
    return;
  }

  report.incidents.unshift(incident);
}

export async function getStatusReport(date = getStatusDateId()): Promise<PublicStatusReport | null> {
  const doc = await getDocumentWithAdminAccess<PublicStatusReport>(STATUS_REPORTS_COLLECTION, date);
  return doc ? sanitizeReport({ ...doc, date: doc.date || date }) : null;
}

export async function listStatusReports(limit = 90): Promise<PublicStatusReport[]> {
  const reports = await listDocumentsWithAdminAccess<PublicStatusReport>(STATUS_REPORTS_COLLECTION, limit);
  return reports
    .map((report) => sanitizeReport({ ...report, date: report.date || report.id }))
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, limit);
}

export async function recordStatusProbeResults(probes: StatusProbeResult[]): Promise<PublicStatusReport> {
  const now = new Date();
  const date = getStatusDateId(now);
  const existing = await getStatusReport(date);
  const report = existing || createEmptyReport(date, now);

  for (const probe of probes) {
    const current = normalizeService(probe.serviceId, report.services[probe.serviceId]);
    current.totalChecks += 1;
    if (probe.status === 'operational') current.successfulChecks += 1;
    if (probe.status === 'degraded') current.degradedChecks += 1;
    if (probe.status === 'outage') current.failedChecks += 1;
    current.status = probe.status;
    current.lastCheckedAt = probe.checkedAt;
    current.latencyMs = probe.latencyMs === null ? null : Math.round(probe.latencyMs);
    current.uptimePct = current.totalChecks > 0 ? clampPct((current.successfulChecks / current.totalChecks) * 100) : 0;
    report.services[probe.serviceId] = current;

    updateIncidentFromProbe(report, date, probe);
  }

  report.updatedAt = now.toISOString();
  report.overallStatus = computeOverallStatus(report.services);
  report.expiresAtMs = now.getTime() + getStatusConfig().retentionDays * 24 * 60 * 60 * 1000;

  const sanitized = sanitizeReport(report);
  await setDocumentWithAdminAccess(STATUS_REPORTS_COLLECTION, date, sanitized as unknown as Record<string, unknown>);
  return sanitized;
}

export async function updateStatusReportAnalysis(date: string, analysis: PublicStatusAnalysis): Promise<PublicStatusReport> {
  const existing = await getStatusReport(date);
  const report = existing || createEmptyReport(date);
  report.analysis = analysis;
  report.updatedAt = new Date().toISOString();
  const sanitized = sanitizeReport(report);
  await setDocumentWithAdminAccess(STATUS_REPORTS_COLLECTION, date, sanitized as unknown as Record<string, unknown>);
  return sanitized;
}

export async function pruneExpiredStatusReports(nowMs = Date.now()): Promise<number> {
  const reports = await listDocumentsWithAdminAccess<PublicStatusReport>(STATUS_REPORTS_COLLECTION, 300);
  const expiredIds = reports
    .filter((report) => Number(report.expiresAtMs || 0) > 0 && Number(report.expiresAtMs) < nowMs)
    .map((report) => report.id)
    .filter(Boolean);

  return deleteDocumentsWithAdminAccess(STATUS_REPORTS_COLLECTION, expiredIds);
}
