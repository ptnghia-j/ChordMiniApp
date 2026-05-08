import {
  buildPreparedSheetSageMelodyNotes,
  buildScheduledSheetSageMelodyNotes,
  buildSheetSageExtraVisualNotes,
  transposeSheetSageNoteEvents,
} from '@/utils/sheetSagePlayback';
import type { SheetSageResult } from '@/types/sheetSage';
import type { DynamicsAnalyzer } from '@/services/audio/dynamicsAnalyzer';

describe('sheetSagePlayback melody dynamics', () => {
  const result: SheetSageResult = {
    noteEvents: [
      { onset: 0, offset: 0.5, pitch: 72, velocity: 18 },
      { onset: 0.5, offset: 1.0, pitch: 74, velocity: 96 },
    ],
    beatTimes: [0, 0.5, 1.0],
    tempoBpm: 120,
    beatsPerMeasure: 4,
    sourceName: 'test',
    processingTime: 1,
  };

  it('leans on analyzed audio contour more strongly than raw transcription velocity', () => {
    const analyzer = {
      getSignalDynamics: () => ({
        energy: 0.7,
        spectralFlux: 0.6,
        onsetStrength: 0.75,
        intensity: 0.78,
        normalizedIntensity: 0.82,
        quietness: 0.08,
        fullness: 0.76,
        motion: 0.72,
        attack: 0.7,
        intensityBand: 'loud' as const,
      }),
      getVelocityMultiplier: () => 0.94,
    } as unknown as DynamicsAnalyzer;

    const prepared = buildPreparedSheetSageMelodyNotes(result, analyzer);
    const notes = buildScheduledSheetSageMelodyNotes(prepared, 0);

    expect(notes).toHaveLength(2);
    expect(notes[0].velocityMultiplier).toBeGreaterThan(0.65);
    expect(notes[1].velocityMultiplier).toBeGreaterThan(notes[0].velocityMultiplier - 0.12);
  });

  it('falls back to transcription velocity when audio analysis is unavailable', () => {
    const prepared = buildPreparedSheetSageMelodyNotes(result, null);
    const notes = buildScheduledSheetSageMelodyNotes(prepared, 0);

    expect(notes).toHaveLength(2);
    expect(notes[0].velocityMultiplier).toBeLessThan(notes[1].velocityMultiplier);
  });

  it('reuses prepared melody note velocities when slicing for a later current time', () => {
    const analyzer = {
      getSignalDynamics: () => ({
        energy: 0.6,
        spectralFlux: 0.5,
        onsetStrength: 0.7,
        intensity: 0.72,
        normalizedIntensity: 0.76,
        quietness: 0.12,
        fullness: 0.7,
        motion: 0.66,
        attack: 0.62,
        intensityBand: 'medium' as const,
      }),
      getVelocityMultiplier: () => 0.9,
    } as unknown as DynamicsAnalyzer;

    const prepared = buildPreparedSheetSageMelodyNotes(result, analyzer);
    const laterNotes = buildScheduledSheetSageMelodyNotes(prepared, 0.5);

    expect(laterNotes).toHaveLength(1);
    expect(laterNotes[0].velocityMultiplier).toBeCloseTo(prepared[1].velocityMultiplier, 5);
  });

  it('transposes melody note pitches when a semitone offset is provided', () => {
    const prepared = buildPreparedSheetSageMelodyNotes(result, null, 2);
    const notes = buildScheduledSheetSageMelodyNotes(prepared, 0);

    expect(notes).toHaveLength(2);
    expect(notes[0]).toEqual(expect.objectContaining({ midi: 74, noteName: 'D5' }));
    expect(notes[1]).toEqual(expect.objectContaining({ midi: 76, noteName: 'E5' }));
  });

  it('transposes extra visual melody notes for piano-roll overlay', () => {
    const visualNotes = buildSheetSageExtraVisualNotes(result, '#22d3ee', -2);

    expect(visualNotes).toHaveLength(2);
    expect(visualNotes[0]).toEqual(expect.objectContaining({ midi: 70, color: '#22d3ee' }));
    expect(visualNotes[1]).toEqual(expect.objectContaining({ midi: 72, color: '#22d3ee' }));
  });

  it('transposes raw Sheet Sage note events for sheet-music rendering', () => {
    const transposed = transposeSheetSageNoteEvents(result.noteEvents, 2);

    expect(transposed).toEqual([
      expect.objectContaining({ pitch: 74 }),
      expect.objectContaining({ pitch: 76 }),
    ]);
  });
});
