import { resolveLyricsForChatbotContext } from '@/utils/chatbotLyrics';
import type { LyricsData } from '@/types/musicAiTypes';

const musicAiLyrics: LyricsData = {
  lines: [{ startTime: 1, endTime: 2, text: 'Music.ai line' }],
};

const gridLyrics: LyricsData = {
  lines: [{ startTime: 3, endTime: 4, text: 'LRCLIB grid line' }],
};

describe('resolveLyricsForChatbotContext', () => {
  it('prefers Music.ai lyrics when available', () => {
    expect(resolveLyricsForChatbotContext(musicAiLyrics, gridLyrics)).toBe(musicAiLyrics);
  });

  it('falls back to visible beat grid lyrics when Music.ai lyrics are unavailable', () => {
    expect(resolveLyricsForChatbotContext(null, gridLyrics)).toBe(gridLyrics);
    expect(resolveLyricsForChatbotContext({ lines: [] }, gridLyrics)).toBe(gridLyrics);
  });

  it('returns undefined when neither lyrics source has lines', () => {
    expect(resolveLyricsForChatbotContext(null, null)).toBeUndefined();
    expect(resolveLyricsForChatbotContext({ lines: [] }, { lines: [] })).toBeUndefined();
  });
});