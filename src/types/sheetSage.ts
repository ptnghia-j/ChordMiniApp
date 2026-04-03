export interface SheetSageNoteEvent {
  onset: number;
  offset: number;
  pitch: number;
  velocity: number;
}

export interface SheetSageResult {
  source: 'sheetsage';
  sourceName?: string | null;
  noteEvents: SheetSageNoteEvent[];
  noteEventCount: number;
  beatTimes: number[];
  beatsPerMeasure: number;
  tempoBpm: number;
  processingTime?: number;
  usedJukebox: boolean;
}
