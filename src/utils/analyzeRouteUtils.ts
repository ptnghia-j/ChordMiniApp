import { BeatDetectorType, ChordDetectorType } from '@/hooks/chord-analysis/useModelState';

type QueryParamReader = {
  get: (key: string) => string | null;
};

export interface AnalyzeRouteParams {
  title?: string | null;
  duration?: string | null;
  channel?: string | null;
  thumbnail?: string | null;
  beatModel?: BeatDetectorType | null;
  chordModel?: ChordDetectorType | null;
  autoStart?: boolean | null;
}

const VALID_BEAT_MODELS: BeatDetectorType[] = ['madmom', 'beat-transformer'];
const VALID_CHORD_MODELS: ChordDetectorType[] = ['chord-cnn-lstm', 'btc-sl', 'btc-pl'];

function safeDecode(value: string | null): string | null {
  if (!value) return null;

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function sanitizeBeatModel(value: string | null | undefined): BeatDetectorType | null {
  if (!value) return null;
  return VALID_BEAT_MODELS.includes(value as BeatDetectorType) ? (value as BeatDetectorType) : null;
}

export function sanitizeChordModel(value: string | null | undefined): ChordDetectorType | null {
  if (!value) return null;
  return VALID_CHORD_MODELS.includes(value as ChordDetectorType) ? (value as ChordDetectorType) : null;
}

export function readAnalyzeRouteParams(searchParams: QueryParamReader | null | undefined): Required<AnalyzeRouteParams> {
  return {
    title: safeDecode(searchParams?.get('title') ?? null),
    duration: searchParams?.get('duration') ?? null,
    channel: safeDecode(searchParams?.get('channel') ?? null),
    thumbnail: safeDecode(searchParams?.get('thumbnail') ?? null),
    beatModel: sanitizeBeatModel(searchParams?.get('beatModel') ?? null),
    chordModel: sanitizeChordModel(searchParams?.get('chordModel') ?? null),
    autoStart: searchParams?.get('autoStart') === '1',
  };
}

function buildAnalyzeUrl(pathname: string, params?: AnalyzeRouteParams): string {
  const query = new URLSearchParams();

  if (params?.title) query.set('title', params.title);
  if (params?.duration) query.set('duration', params.duration);
  if (params?.channel) query.set('channel', params.channel);
  if (params?.thumbnail) query.set('thumbnail', params.thumbnail);
  if (params?.beatModel) query.set('beatModel', params.beatModel);
  if (params?.chordModel) query.set('chordModel', params.chordModel);
  if (params?.autoStart) query.set('autoStart', '1');

  const queryString = query.toString();
  return queryString ? `${pathname}?${queryString}` : pathname;
}

export function buildAnalyzePageUrl(videoId: string, params?: AnalyzeRouteParams): string {
  return buildAnalyzeUrl(`/analyze/${videoId}`, params);
}

export function buildAnalyzeModelSetupUrl(videoId: string, params?: AnalyzeRouteParams): string {
  return buildAnalyzeUrl(`/analyze/${videoId}/models`, params);
}