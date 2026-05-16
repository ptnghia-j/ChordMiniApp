import StatusDashboard from '@/app/status/StatusDashboard';
import { getStatusConfig } from '@/services/status/statusConfig';
import { listStatusReports } from '@/services/status/statusReportService';
import type { PublicStatusReport } from '@/services/status/statusTypes';

export const dynamic = 'force-dynamic';

async function loadStatusReports(): Promise<{ reports: PublicStatusReport[]; unavailable: boolean }> {
  const config = getStatusConfig();
  if (!config.storageEnabled) {
    return { reports: [], unavailable: true };
  }

  try {
    return { reports: await listStatusReports(90), unavailable: false };
  } catch {
    return { reports: [], unavailable: true };
  }
}

export default async function StatusPage() {
  const { reports, unavailable } = await loadStatusReports();
  return <StatusDashboard reports={reports} unavailable={unavailable} />;
}

