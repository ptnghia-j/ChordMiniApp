export interface LyricTextColors {
  unplayed: string;
  played: string;
  chord: string;
  background: string;
}

export const LYRIC_TEXT_COLORS = {
  light: {
    unplayed: '#6B7280',
    played: '#3B82F6',
    chord: '#2563EB',
    background: '#FFFFFF',
  },
  dark: {
    unplayed: '#9CA3AF',
    played: '#60A5FA',
    chord: '#93C5FD',
    background: '#1F2937',
  },
} as const satisfies Record<'light' | 'dark', LyricTextColors>;

export function getLyricTextColors(darkMode: boolean): LyricTextColors {
  return darkMode ? LYRIC_TEXT_COLORS.dark : LYRIC_TEXT_COLORS.light;
}

export const LYRIC_GRID_COLOR_VARIABLE_CLASSES =
  '[--lyric-played:#3B82F6] [--lyric-unplayed:#6B7280] [--swept-color:#3B82F6] dark:[--lyric-played:#60A5FA] dark:[--lyric-unplayed:#9CA3AF] dark:[--swept-color:#60A5FA]';
