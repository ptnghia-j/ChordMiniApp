import type { LyricsData } from '@/types/musicAiTypes';

export function resolveLyricsForChatbotContext(
  primaryLyrics?: LyricsData | null,
  fallbackLyrics?: LyricsData | null,
): LyricsData | undefined {
  if (primaryLyrics?.lines?.length) {
    return primaryLyrics;
  }

  if (fallbackLyrics?.lines?.length) {
    return fallbackLyrics;
  }

  return undefined;
}
