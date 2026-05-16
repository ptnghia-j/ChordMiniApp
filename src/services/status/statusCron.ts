import type { NextRequest } from 'next/server';
import { getStatusConfig, getStatusDisabledReason } from '@/services/status/statusConfig';

export function authorizeStatusCron(request: NextRequest): { ok: true } | { ok: false; status: number; error: string } {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return { ok: false, status: 503, error: 'Status cron is not configured.' };
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  return { ok: true };
}

export function getSanitizedDisabledResponse(): { success: false; skipped: true; reason: string } {
  return {
    success: false,
    skipped: true,
    reason: getStatusDisabledReason(getStatusConfig()),
  };
}

