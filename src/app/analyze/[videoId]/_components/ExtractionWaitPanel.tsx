'use client';

import MiniGamesContainer from '@/components/games/MiniGamesContainer';

interface ExtractionWaitPanelProps {
  queueStatus?: 'queued' | 'active' | 'released' | 'cancelled' | 'expired' | null;
  queuePosition?: number | null;
  estimatedWaitSeconds?: number | null;
  statusMessage?: string;
}

export default function ExtractionWaitPanel(_props: ExtractionWaitPanelProps) {
  return <MiniGamesContainer layoutMode="embed" />;
}
