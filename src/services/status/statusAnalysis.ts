import { createGeminiClient, GEMINI_MODEL_NAME } from '@/config/gemini';
import { getStatusConfig } from '@/services/status/statusConfig';
import { listStatusReports, updateStatusReportAnalysis } from '@/services/status/statusReportService';
import type { PublicStatusAnalysis, PublicStatusReport } from '@/services/status/statusTypes';

function buildPrompt(report: PublicStatusReport): string {
  const incidentLines = report.incidents.map((incident) => (
    `- ${incident.serviceLabel}: ${incident.severity}, ${incident.summary}, started ${incident.startedAt}, ended ${incident.endedAt || 'unresolved'}`
  )).join('\n') || '- No incidents.';

  const serviceLines = Object.values(report.services).map((service) => (
    `- ${service.label}: ${service.status}, uptime ${service.uptimePct}%, checks ${service.totalChecks}, failed ${service.failedChecks}, degraded ${service.degradedChecks}`
  )).join('\n');

  return `You are writing a concise public status-page incident summary for ChordMini.

Input is sanitized probe data for one reporting day. Do not mention URLs, secrets, stack traces, request headers, raw responses, or internal implementation details.

Date: ${report.date}
Overall status: ${report.overallStatus}

Services:
${serviceLines}

Incidents:
${incidentLines}

Write JSON only with this shape:
{
  "summary": "one sentence daily status summary",
  "patternNotes": "short pattern note, or null"
}

Keep the tone factual, calm, and brief.`;
}

function fallbackAnalysis(report: PublicStatusReport, status: PublicStatusAnalysis['status'], attempts: number): PublicStatusAnalysis {
  const hasIncidents = report.incidents.length > 0;
  return {
    status,
    summary: hasIncidents
      ? `${report.incidents.length} incident${report.incidents.length === 1 ? '' : 's'} recorded for ${report.date}.`
      : `No incidents reported for ${report.date}.`,
    patternNotes: null,
    generatedAt: status === 'complete' || status === 'failed' ? new Date().toISOString() : null,
    attempts,
    model: status === 'skipped' ? null : GEMINI_MODEL_NAME,
  };
}

function parseAnalysis(text: string, report: PublicStatusReport, attempts: number): PublicStatusAnalysis {
  try {
    const cleaned = text.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    const parsed = JSON.parse(cleaned) as { summary?: unknown; patternNotes?: unknown };
    return {
      status: 'complete',
      summary: typeof parsed.summary === 'string' ? parsed.summary.slice(0, 500) : fallbackAnalysis(report, 'complete', attempts).summary,
      patternNotes: typeof parsed.patternNotes === 'string' ? parsed.patternNotes.slice(0, 500) : null,
      generatedAt: new Date().toISOString(),
      attempts,
      model: GEMINI_MODEL_NAME,
    };
  } catch {
    return {
      status: 'complete',
      summary: text.trim().slice(0, 500) || fallbackAnalysis(report, 'complete', attempts).summary,
      patternNotes: null,
      generatedAt: new Date().toISOString(),
      attempts,
      model: GEMINI_MODEL_NAME,
    };
  }
}

export async function analyzeStatusReport(report: PublicStatusReport): Promise<PublicStatusAnalysis> {
  const attempts = Number(report.analysis?.attempts || 0) + 1;
  const config = getStatusConfig();

  if (!config.geminiConfigured) {
    return fallbackAnalysis(report, report.incidents.length > 0 ? 'pending' : 'skipped', attempts);
  }

  const gemini = createGeminiClient({ timeoutMs: 30_000 });
  if (!gemini) {
    return fallbackAnalysis(report, 'pending', attempts);
  }

  try {
    const response = await gemini.models.generateContent({
      model: GEMINI_MODEL_NAME,
      contents: buildPrompt(report),
    });
    return parseAnalysis(response.text || '', report, attempts);
  } catch {
    return fallbackAnalysis(report, 'failed', attempts);
  }
}

export async function retryMissingStatusAnalyses(): Promise<{ analyzed: number; skipped: number }> {
  const reports = await listStatusReports(90);
  let analyzed = 0;
  let skipped = 0;

  for (const report of reports) {
    if (report.analysis.status === 'complete' || report.analysis.status === 'skipped') {
      skipped += 1;
      continue;
    }

    const analysis = await analyzeStatusReport(report);
    await updateStatusReportAnalysis(report.date, analysis);
    analyzed += 1;
  }

  return { analyzed, skipped };
}

