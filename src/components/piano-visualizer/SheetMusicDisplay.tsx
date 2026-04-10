'use client';

export { SheetMusicDisplay as default, SheetMusicDisplay } from './sheet-music-display/SheetMusicDisplayRoot';
export type { SheetMusicDisplayProps } from './sheet-music-display/SheetMusicDisplayRoot';
export {
  countScoreMeasuresInMusicXml,
  extractSyncDataFromMusicXml,
  resolveMeasureScrollTop,
  stabilizeMeasureBoxAnchors,
} from './sheet-music-display/sync';
