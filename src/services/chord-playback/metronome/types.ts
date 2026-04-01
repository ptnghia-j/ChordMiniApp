export type MetronomeSoundStyle =
  | 'traditional'
  | 'digital'
  | 'wood'
  | 'bell'
  | 'librosa_default'
  | 'librosa_pitched'
  | 'librosa_short'
  | 'librosa_long';

export type MetronomeTrackMode = 'metronome' | 'drum';

export interface MetronomeOptions {
  volume: number;
  soundStyle: MetronomeSoundStyle;
  trackMode: MetronomeTrackMode;
  clickDuration: number;
}

export interface MetronomeBufferPair {
  downbeat: AudioBuffer;
  regular: AudioBuffer;
}
