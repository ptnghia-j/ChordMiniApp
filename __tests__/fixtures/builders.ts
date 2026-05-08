import type { ChordGridData } from '@/components/piano-visualizer/piano-visualizer-tab/types';
import type { ChordEvent } from '@/utils/chordToMidi';

export const buildBeatGrid = (count = 8, start = 0, step = 1): number[] =>
  Array.from({ length: count }, (_, index) => start + index * step);

export const buildChordGridData = (overrides: Partial<ChordGridData> = {}): ChordGridData => ({
  chords: ['C', 'G', 'Am', 'F'],
  beats: buildBeatGrid(4),
  hasPadding: false,
  paddingCount: 0,
  shiftCount: 0,
  totalPaddingCount: 0,
  ...overrides,
});

export const buildChordEvent = (overrides: Partial<ChordEvent> = {}): ChordEvent => ({
  chordName: 'C',
  notes: [60, 64, 67],
  startTime: 0,
  endTime: 1,
  beatIndex: 0,
  beatCount: 1,
  ...overrides,
});

export const makeJsonRequest = (body: unknown) => ({
  json: async () => body,
});

export const makeFetchResponse = ({
  ok,
  status,
  statusText = ok ? 'OK' : 'Error',
  jsonData,
  textData,
}: {
  ok: boolean;
  status: number;
  statusText?: string;
  jsonData?: unknown;
  textData?: string;
}) => ({
  ok,
  status,
  statusText,
  json: async () => jsonData,
  text: async () => textData ?? JSON.stringify(jsonData ?? {}),
});
