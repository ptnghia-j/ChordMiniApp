import {
  resolveFirstMelodyBeatIndex,
  resolveSheetPickupResolution,
  selectMelodyBeatTimesForExport,
} from '@/components/piano-visualizer/piano-visualizer-tab/useSheetMusicModel';
import { buildBeatGrid, buildChordEvent, buildChordGridData } from '../../fixtures/builders';

describe('sheet music pickup resolution behavior', () => {
  it('uses reliable visible grid silence over stale one-beat padding metadata', () => {
    const resolution = resolveSheetPickupResolution({
      timeSignature: 4,
      notationBeatOffset: 0,
      resolvedChordGridData: buildChordGridData({
        chords: ['N.C.', 'N.C.', 'G', 'G', 'D/F#', 'D/F#'],
        beats: buildBeatGrid(6),
        hasPadding: true,
        paddingCount: 1,
        totalPaddingCount: 1,
      }),
      sheetMusicBeatTimes: buildBeatGrid(6),
      sheetMusicChordEvents: [
        buildChordEvent({ chordName: 'G', beatIndex: 2, startTime: 2, endTime: 4, beatCount: 2 }),
        buildChordEvent({ chordName: 'D/F#', beatIndex: 4, startTime: 4, endTime: 6, beatCount: 2 }),
      ],
      firstMelodyBeatIndex: null,
      hasMelodyNotes: false,
    });

    expect(resolution.resolvedPickupBeatCount).toBe(2);
    expect(resolution.normalizedStructuralPickup).toBe(1);
    expect(resolution.normalizedFirstNonSilentVisibleGridPickup).toBe(2);
  });

  it('keeps full-bar lead-ins as written rests instead of converting them to pickup bars', () => {
    const resolution = resolveSheetPickupResolution({
      timeSignature: 4,
      notationBeatOffset: 0,
      resolvedChordGridData: buildChordGridData({
        chords: ['N.C.', 'N.C.', 'N.C.', 'N.C.', 'Bb', 'Bb'],
        beats: buildBeatGrid(6),
        hasPadding: true,
        paddingCount: 1,
      }),
      sheetMusicBeatTimes: buildBeatGrid(6),
      sheetMusicChordEvents: [
        buildChordEvent({ chordName: 'Bb', beatIndex: 4, startTime: 4, endTime: 6, beatCount: 2 }),
      ],
      firstMelodyBeatIndex: null,
      hasMelodyNotes: false,
    });

    expect(resolution.resolvedPickupBeatCount).toBe(0);
    expect(resolution.shouldForceZeroPickupForLongLeadingSilence).toBe(true);
  });

  it('lets earlier melody timing override a later structural pickup', () => {
    const resolution = resolveSheetPickupResolution({
      timeSignature: 4,
      notationBeatOffset: 0,
      resolvedChordGridData: buildChordGridData({
        chords: ['N.C.', 'G', 'G', 'G'],
        beats: buildBeatGrid(4),
        hasPadding: true,
        paddingCount: 3,
      }),
      sheetMusicBeatTimes: buildBeatGrid(4),
      sheetMusicChordEvents: [
        buildChordEvent({ chordName: 'G', beatIndex: 3, startTime: 3, endTime: 4 }),
      ],
      firstMelodyBeatIndex: 1,
      hasMelodyNotes: true,
    });

    expect(resolution.resolvedPickupBeatCount).toBe(1);
    expect(resolution.melodyOverridesStructuralPickup).toBe(true);
  });

  it('selects exported melody beat times from the same timeline as lead-in pickup resolution', () => {
    expect(selectMelodyBeatTimesForExport({
      sheetMusicBeatTimes: [2, 3, 4],
      sheetMusicMelodyBeatTimes: [0, 1, 2, 3, 4],
      usesFirstPlayableLeadInPickup: true,
    })).toEqual([2, 3, 4]);

    expect(selectMelodyBeatTimesForExport({
      sheetMusicBeatTimes: [2, 3, 4],
      sheetMusicMelodyBeatTimes: [0, 1, 2, 3, 4],
      usesFirstPlayableLeadInPickup: false,
    })).toEqual([0, 1, 2, 3, 4]);
  });

  it('derives the first melody beat from note onsets against provided beat anchors', () => {
    const firstBeat = resolveFirstMelodyBeatIndex(
      [
        { onset: 2.25, offset: 2.5, pitch: 72, velocity: 90 },
        { onset: 0.5, offset: 0.75, pitch: 76, velocity: 90 },
      ],
      [0, 1, 2, 3],
    );

    expect(firstBeat).toBe(0);
  });
});
