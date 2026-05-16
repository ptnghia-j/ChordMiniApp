import { NextRequest, NextResponse } from 'next/server';

import { getStatusConfig } from '@/services/status/statusConfig';
import { authorizeStatusCron } from '@/services/status/statusCron';
import { pruneExpiredStatusReports } from '@/services/status/statusReportService';
import { retryMissingStatusAnalyses } from '@/services/status/statusAnalysis';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const authorization = authorizeStatusCron(request);
  if (!authorization.ok) {
    return NextResponse.json({ success: false, error: authorization.error }, { status: authorization.status });
  }

  const config = getStatusConfig();
  if (!config.storageEnabled) {
    return NextResponse.json({
      success: false,
      skipped: true,
      reason: 'Status storage is not configured.',
    });
  }

  const [analysisResult, pruned] = await Promise.all([
    retryMissingStatusAnalyses(),
    pruneExpiredStatusReports(),
  ]);

  return NextResponse.json({
    success: true,
    analyzed: analysisResult.analyzed,
    skipped: analysisResult.skipped,
    pruned,
  });
}

