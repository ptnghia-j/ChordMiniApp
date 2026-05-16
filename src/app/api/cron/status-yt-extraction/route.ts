import { NextRequest, NextResponse } from 'next/server';

import { canRunYtExtractionProbe, getStatusConfig } from '@/services/status/statusConfig';
import { authorizeStatusCron, getSanitizedDisabledResponse } from '@/services/status/statusCron';
import { runYtExtractionStatusProbe } from '@/services/status/statusProbes';
import { recordStatusProbeResults } from '@/services/status/statusReportService';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authorization = authorizeStatusCron(request);
  if (!authorization.ok) {
    return NextResponse.json({ success: false, error: authorization.error }, { status: authorization.status });
  }

  const config = getStatusConfig();
  if (!canRunYtExtractionProbe(config)) {
    return NextResponse.json(getSanitizedDisabledResponse(), { status: 200 });
  }

  const probe = await runYtExtractionStatusProbe();
  const report = await recordStatusProbeResults([probe]);

  return NextResponse.json({
    success: true,
    checked: 1,
    date: report.date,
    overallStatus: report.overallStatus,
  });
}

