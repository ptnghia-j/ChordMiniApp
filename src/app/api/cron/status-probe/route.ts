import { NextRequest, NextResponse } from 'next/server';

import { canRunStatusProbes, getStatusConfig } from '@/services/status/statusConfig';
import { authorizeStatusCron, getSanitizedDisabledResponse } from '@/services/status/statusCron';
import { runStandardStatusProbes } from '@/services/status/statusProbes';
import { recordStatusProbeResults } from '@/services/status/statusReportService';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const authorization = authorizeStatusCron(request);
  if (!authorization.ok) {
    return NextResponse.json({ success: false, error: authorization.error }, { status: authorization.status });
  }

  const config = getStatusConfig();
  if (!canRunStatusProbes(config)) {
    return NextResponse.json(getSanitizedDisabledResponse(), { status: 200 });
  }

  const probes = await runStandardStatusProbes();
  const report = await recordStatusProbeResults(probes);

  return NextResponse.json({
    success: true,
    checked: probes.length,
    date: report.date,
    overallStatus: report.overallStatus,
  });
}

