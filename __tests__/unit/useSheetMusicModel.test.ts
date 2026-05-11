import {
  buildSheetMusicKeySections,
  resolveFirstMelodyBeatIndex,
  selectMelodyBeatTimesForExport,
  resolveSheetPickupResolution,
} from '@/components/piano-visualizer/piano-visualizer-tab/useSheetMusicModel';

describe('resolveFirstMelodyBeatIndex', () => {
  it('tracks melody onset against the provided beat map', () => {
    const melody = [{ onset: 6.4, offset: 6.8, pitch: 69, velocity: 90 }];

    const gridAlignedBeatIndex = resolveFirstMelodyBeatIndex(
      melody,
      [0, 0.94, 1.85, 2.82, 3.65, 4.53, 5.36, 6.25, 7.08],
    );
    const melodyAlignedBeatIndex = resolveFirstMelodyBeatIndex(
      melody,
      [0, 0.94, 1.85, 2.82, 3.65, 4.53, 5.36, 6.7, 7.5],
    );

    expect(gridAlignedBeatIndex).toBe(7);
    expect(melodyAlignedBeatIndex).toBe(6);
  });
});

describe('selectMelodyBeatTimesForExport', () => {
  it('uses grid-aligned beat times for full-measure structural lead-ins', () => {
    const gridBeatTimes = [0, 0.36, 1.19, 2, 2.86, 3.74];
    const melodyBeatTimes = [2.41, 2.86, 3.29, 3.73, 4.18, 4.61];

    const result = selectMelodyBeatTimesForExport({
      sheetMusicBeatTimes: gridBeatTimes,
      sheetMusicMelodyBeatTimes: melodyBeatTimes,
      usesFirstPlayableLeadInPickup: true,
    });

    expect(result).toBe(gridBeatTimes);
  });

  it('keeps melody-aligned beat times when there is no full-measure structural lead-in', () => {
    const gridBeatTimes = [0, 0.94, 1.85, 2.82];
    const melodyBeatTimes = [1.84, 2.59, 3.3, 4.06];

    const result = selectMelodyBeatTimesForExport({
      sheetMusicBeatTimes: gridBeatTimes,
      sheetMusicMelodyBeatTimes: melodyBeatTimes,
      usesFirstPlayableLeadInPickup: false,
    });

    expect(result).toBe(melodyBeatTimes);
  });
});

describe('resolveSheetPickupResolution', () => {
  it('does not collapse long lead-ins into a modulo pickup', () => {
    const result = resolveSheetPickupResolution({
      timeSignature: 4,
      notationBeatOffset: 0,
      resolvedChordGridData: {
        chords: ['N.C.', 'N.C.', 'N.C.', 'N.C.', 'N.C.', 'N.C.', 'N.C.', 'N.C.', 'N.C.', 'A:maj'],
        beats: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
        hasPadding: true,
        paddingCount: 0,
        shiftCount: 0,
        totalPaddingCount: 0,
      },
      sheetMusicBeatTimes: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      sheetMusicChordEvents: [{ beatIndex: 9 }],
      firstMelodyBeatIndex: null,
      hasMelodyNotes: true,
    });

    expect(result.firstNonSilentVisibleGridIndex).toBe(9);
    expect(result.normalizedFirstNonSilentVisibleGridPickup).toBe(1);
    expect(result.shouldForceZeroPickupForLongLeadingSilence).toBe(true);
    expect(result.resolvedPickupBeatCount).toBe(0);
    expect(result.preferInferredExportPickup).toBe(false);
  });

  it('keeps a genuine first-measure pickup', () => {
    const result = resolveSheetPickupResolution({
      timeSignature: 4,
      notationBeatOffset: 0,
      resolvedChordGridData: {
        chords: ['N.C.', 'A:maj', 'E:maj/3'],
        beats: [0, 1, 2],
        hasPadding: true,
        paddingCount: 0,
        shiftCount: 0,
        totalPaddingCount: 0,
      },
      sheetMusicBeatTimes: [0, 1, 2],
      sheetMusicChordEvents: [{ beatIndex: 1 }],
      firstMelodyBeatIndex: null,
      hasMelodyNotes: false,
    });

    expect(result.firstNonSilentVisibleGridIndex).toBe(1);
    expect(result.shouldForceZeroPickupForLongLeadingSilence).toBe(false);
    expect(result.resolvedPickupBeatCount).toBe(1);
  });

  it('preserves structural pickup padding from the grid', () => {
    const result = resolveSheetPickupResolution({
      timeSignature: 4,
      notationBeatOffset: 0,
      resolvedChordGridData: {
        chords: ['N.C.', 'A:maj'],
        beats: [0, 1],
        hasPadding: true,
        paddingCount: 1,
        shiftCount: 0,
        totalPaddingCount: 1,
      },
      sheetMusicBeatTimes: [0, 1],
      sheetMusicChordEvents: [{ beatIndex: 1 }],
      firstMelodyBeatIndex: null,
      hasMelodyNotes: false,
    });

    expect(result.rawPaddingCount).toBe(1);
    expect(result.resolvedPickupBeatCount).toBe(1);
    expect(result.melodyOverridesStructuralPickup).toBe(false);
    expect(result.melodyOverridesFirstPlayableLeadInPickup).toBe(false);
  });

  it('does not let visible-grid silence collapse a structural pickup from shift plus padding', () => {
    const result = resolveSheetPickupResolution({
      timeSignature: 4,
      notationBeatOffset: 1,
      resolvedChordGridData: {
        chords: ['', 'N.C.', 'A:maj'],
        beats: [null, 0.25, 0.5],
        hasPadding: true,
        paddingCount: 1,
        shiftCount: 1,
        totalPaddingCount: 2,
      },
      sheetMusicBeatTimes: [0.25, 0.5],
      sheetMusicChordEvents: [{ beatIndex: 1 }],
      firstMelodyBeatIndex: null,
      hasMelodyNotes: true,
    });

    expect(result.rawStructuralPickupCount).toBe(1);
    expect(result.firstNonSilentVisibleGridIndex).toBe(1);
    expect(result.resolvedPickupBeatCount).toBe(1);
    expect(result.preferInferredExportPickup).toBe(false);
    expect(result.melodyOverridesStructuralPickup).toBe(false);
    expect(result.melodyOverridesFirstPlayableLeadInPickup).toBe(false);
  });

  it('preserves a pickup after a full-bar structural lead-in', () => {
    const result = resolveSheetPickupResolution({
      timeSignature: 4,
      notationBeatOffset: 3,
      resolvedChordGridData: {
        chords: ['', '', '', 'N.C.', 'N/C', 'N/C', 'N/C', 'N/C', 'C#:maj'],
        beats: [null, null, null, 0, 0.36, 1.19, 2, 2.86, 3.74],
        hasPadding: true,
        paddingCount: 1,
        shiftCount: 1,
        totalPaddingCount: 2,
      },
      sheetMusicBeatTimes: [0, 0.36, 1.19, 2, 2.86, 3.74],
      sheetMusicChordEvents: [{ beatIndex: 5 }],
      firstMelodyBeatIndex: null,
      hasMelodyNotes: true,
    });

    expect(result.rawStructuralPickupCount).toBe(1);
    expect(result.normalizedStructuralPickup).toBe(1);
    expect(result.firstPlayableBeatIndex).toBe(5);
    expect(result.normalizedFirstPlayablePickup).toBe(1);
    expect(result.resolvedPickupBeatCount).toBe(1);
    expect(result.melodyOverridesStructuralPickup).toBe(false);
    expect(result.melodyOverridesFirstPlayableLeadInPickup).toBe(false);
  });

  it('keeps full-bar lead-ins aligned to the first playable chord even when melody enters earlier', () => {
    const result = resolveSheetPickupResolution({
      timeSignature: 4,
      notationBeatOffset: 3,
      resolvedChordGridData: {
        chords: ['', '', '', 'N.C.', 'N/C', 'N/C', 'N/C', 'N/C', 'C#:maj'],
        beats: [null, null, null, 0, 0.36, 1.19, 2, 2.86, 3.74],
        hasPadding: true,
        paddingCount: 1,
        shiftCount: 1,
        totalPaddingCount: 2,
      },
      sheetMusicBeatTimes: [0, 0.36, 1.19, 2, 2.86, 3.74],
      sheetMusicChordEvents: [{ beatIndex: 5 }],
      firstMelodyBeatIndex: 2,
      hasMelodyNotes: true,
    });

    expect(result.rawStructuralPickupCount).toBe(1);
    expect(result.normalizedStructuralPickup).toBe(1);
    expect(result.normalizedFirstMelodyPickup).toBe(2);
    expect(result.normalizedFirstPlayablePickup).toBe(1);
    expect(result.resolvedPickupBeatCount).toBe(1);
    expect(result.melodyOverridesStructuralPickup).toBe(false);
    expect(result.melodyOverridesFirstPlayableLeadInPickup).toBe(false);
  });

  it('prefers the earliest melody onset over a later chord onset', () => {
    const result = resolveSheetPickupResolution({
      timeSignature: 4,
      notationBeatOffset: 0,
      resolvedChordGridData: {
        chords: ['N.C.', 'N.C.', 'N.C.', 'G:maj'],
        beats: [0, 1, 2, 3],
        hasPadding: true,
        paddingCount: 0,
        shiftCount: 0,
        totalPaddingCount: 0,
      },
      sheetMusicBeatTimes: [0, 1, 2, 3],
      sheetMusicChordEvents: [{ beatIndex: 3 }],
      firstMelodyBeatIndex: 2,
      hasMelodyNotes: true,
    });

    expect(result.firstPlayableBeatIndex).toBe(3);
    expect(result.firstMelodyBeatIndex).toBe(2);
    expect(result.firstMusicalBeatIndex).toBe(2);
    expect(result.resolvedPickupBeatCount).toBe(2);
    expect(result.melodyOverridesStructuralPickup).toBe(false);
    expect(result.melodyOverridesFirstPlayableLeadInPickup).toBe(false);
  });

  it('lets an earlier melody pickup override an inflated structural pickup', () => {
    const result = resolveSheetPickupResolution({
      timeSignature: 4,
      notationBeatOffset: 2,
      resolvedChordGridData: {
        chords: ['', '', 'N.C.', 'N/C', 'N/C', 'N/C', 'G:maj'],
        beats: [null, null, 0, 0.94, 1.85, 2.82, 3.65],
        hasPadding: true,
        paddingCount: 1,
        shiftCount: 2,
        totalPaddingCount: 3,
      },
      sheetMusicBeatTimes: [0, 0.94, 1.85, 2.82, 3.65, 4.53, 5.36, 6.25, 7.08, 7.93, 8.81, 9.66],
      sheetMusicChordEvents: [{ beatIndex: 11 }],
      firstMelodyBeatIndex: 6,
      hasMelodyNotes: true,
    });

    expect(result.normalizedStructuralPickup).toBe(1);
    expect(result.normalizedFirstMelodyPickup).toBe(2);
    expect(result.resolvedPickupBeatCount).toBe(2);
    expect(result.melodyOverridesStructuralPickup).toBe(false);
    expect(result.melodyOverridesFirstPlayableLeadInPickup).toBe(true);
  });

  it('does not treat shift-only visual offset as a three-beat structural pickup', () => {
    const result = resolveSheetPickupResolution({
      timeSignature: 4,
      notationBeatOffset: 3,
      resolvedChordGridData: {
        chords: ['', '', '', 'N/C', 'F#:maj'],
        beats: [null, null, null, 0, 0.86],
        hasPadding: true,
        paddingCount: 0,
        shiftCount: 3,
        totalPaddingCount: 3,
      },
      sheetMusicBeatTimes: [0, 0.86, 1.74, 2.59],
      sheetMusicChordEvents: [{ beatIndex: 1 }],
      firstMelodyBeatIndex: 0,
      hasMelodyNotes: true,
    });

    expect(result.rawStructuralPickupCount).toBe(0);
    expect(result.normalizedStructuralPickup).toBe(null);
    expect(result.firstPlayableBeatIndex).toBe(1);
    expect(result.resolvedPickupBeatCount).toBe(1);
  });

  it('uses the first visible grid measure remainder for a shift-only long silent lead-in', () => {
    const result = resolveSheetPickupResolution({
      timeSignature: 4,
      notationBeatOffset: 2,
      resolvedChordGridData: {
        chords: [
          '',
          '',
          'N.C.',
          'N/C',
          'N/C',
          'N/C',
          'N/C',
          'N/C',
          'N/C',
          'N/C',
          'N/C',
          'N/C',
          'N/C',
          'G',
        ],
        beats: [null, null, 0, 0.86, 1.71, 2.57, 3.43, 4.29, 5.14, 6, 6.86, 7.71, 8.57, 9.43],
        hasPadding: true,
        paddingCount: 1,
        shiftCount: 2,
        totalPaddingCount: 3,
      },
      sheetMusicBeatTimes: [0, 0.86, 1.71, 2.57, 3.43, 4.29, 5.14, 6, 6.86, 7.71, 8.57, 9.43],
      sheetMusicChordEvents: [{ beatIndex: 11 }],
      firstMelodyBeatIndex: null,
      hasMelodyNotes: false,
    });

    expect(result.rawStructuralPickupCount).toBe(1);
    expect(result.firstNonSilentVisibleGridIndex).toBe(11);
    expect(result.normalizedFirstPlayablePickup).toBe(3);
    expect(result.resolvedPickupBeatCount).toBe(2);
  });

  it('resolves half-rest pickup from notation offset plus boundary-aligned full-measure lead-in', () => {
    const result = resolveSheetPickupResolution({
      timeSignature: 4,
      notationBeatOffset: 2,
      resolvedChordGridData: {
        chords: ['', '', 'N.C.', 'N.C.', 'N.C.', 'N.C.', 'D:maj'],
        beats: [null, null, 0, 0.9, 1.8, 2.7, 3.6],
        hasPadding: true,
        paddingCount: 1,
        shiftCount: 2,
        totalPaddingCount: 3,
      },
      sheetMusicBeatTimes: [0, 0.9, 1.8, 2.7, 3.6, 4.5],
      sheetMusicChordEvents: [{ beatIndex: 4 }],
      firstMelodyBeatIndex: 8,
      hasMelodyNotes: true,
    });

    expect(result.rawPaddingCount).toBe(1);
    expect(result.normalizedStructuralPickup).toBe(1);
    expect(result.firstPlayableBeatIndex).toBe(4);
    expect(result.normalizedFirstPlayablePickup).toBe(0);
    expect(result.usesFirstPlayableLeadInPickup).toBe(true);
    expect(result.resolvedPickupBeatCount).toBe(2);
  });

  it('upgrades a 1-beat structural pickup to 3 beats when visible grid silence extends further', () => {
    // Regression test: AMV Yeah! Break! Care! Break! — chord grid shows 1 padding cell
    // plus 2 more N.C. silent cells before the first E chord. The pickup should be
    // 3 beats (a dotted-half rest), not just the 1 beat from grid assembly padding.
    const result = resolveSheetPickupResolution({
      timeSignature: 4,
      notationBeatOffset: 1,
      resolvedChordGridData: {
        chords: ['', 'N.C.', 'N/C', 'N/C', 'E:maj', 'E:maj', 'E:maj', 'E:maj'],
        beats: [null, 0, 0.37, 0.74, 1.11, 1.48, 1.85, 2.22],
        hasPadding: true,
        paddingCount: 1,
        shiftCount: 1,
        totalPaddingCount: 2,
      },
      sheetMusicBeatTimes: [0, 0.37, 0.74, 1.11, 1.48, 1.85, 2.22],
      sheetMusicChordEvents: [{ beatIndex: 3 }],
      firstMelodyBeatIndex: null,
      hasMelodyNotes: true,
    });

    expect(result.rawPaddingCount).toBe(1);
    expect(result.normalizedStructuralPickup).toBe(1);
    expect(result.firstNonSilentVisibleGridIndex).toBe(3);
    expect(result.normalizedFirstNonSilentVisibleGridPickup).toBe(3);
    // The critical assertion: pickup should reflect the full leading silence (3 beats),
    // not just the grid assembly's padding count (1 beat).
    expect(result.resolvedPickupBeatCount).toBe(3);
  });

  it('corrects stale three-beat padding down to the two silent cells visible in beat alignment', () => {
    const result = resolveSheetPickupResolution({
      timeSignature: 4,
      notationBeatOffset: 0,
      resolvedChordGridData: {
        chords: ['N.C.', 'N.C.', 'G', 'G', 'D/F#', 'D/F#'],
        beats: [0, 1, 2, 3, 4, 5],
        hasPadding: true,
        paddingCount: 3,
        shiftCount: 0,
        totalPaddingCount: 3,
      },
      sheetMusicBeatTimes: [0, 1, 2, 3, 4, 5],
      sheetMusicChordEvents: [{ beatIndex: 2 }],
      firstMelodyBeatIndex: null,
      hasMelodyNotes: false,
    });

    expect(result.rawStructuralPickupCount).toBe(3);
    expect(result.firstNonSilentVisibleGridIndex).toBe(2);
    expect(result.normalizedFirstPlayablePickup).toBe(2);
    expect(result.resolvedPickupBeatCount).toBe(2);
  });

  it('does not upgrade structural pickup when the visible grid silence spans a full measure or more', () => {
    // When the leading silence extends beyond the first measure, the force-zero logic
    // should still apply, preventing misleading modulo pickups.
    const result = resolveSheetPickupResolution({
      timeSignature: 4,
      notationBeatOffset: 1,
      resolvedChordGridData: {
        chords: ['', 'N.C.', 'N/C', 'N/C', 'N/C', 'N/C', 'E:maj'],
        beats: [null, 0, 0.37, 0.74, 1.11, 1.48, 1.85],
        hasPadding: true,
        paddingCount: 1,
        shiftCount: 1,
        totalPaddingCount: 2,
      },
      sheetMusicBeatTimes: [0, 0.37, 0.74, 1.11, 1.48, 1.85],
      sheetMusicChordEvents: [{ beatIndex: 5 }],
      firstMelodyBeatIndex: null,
      hasMelodyNotes: true,
    });

    // firstNonSilentVisibleGridIndex = 5, which is >= timeSignature (4),
    // so isWithinFirstMeasure returns false and the upgrade should not apply.
    // The structural pickup of 1 is retained because the force-zero logic
    // only triggers when notationBeatOffset === 0.
    expect(result.firstNonSilentVisibleGridIndex).toBe(5);
    expect(result.resolvedPickupBeatCount).toBe(1);
  });
});

describe('buildSheetMusicKeySections', () => {
  it('keeps modulations when key sections are also present', () => {
    const keySections = buildSheetMusicKeySections({
      mergedKeySignature: 'E major',
      sequenceCorrections: {
        originalSequence: [],
        correctedSequence: [],
        keyAnalysis: {
          sections: [
            { startIndex: 0, endIndex: 99, key: 'E major', chords: [] },
            { startIndex: 100, endIndex: 106, key: 'Eb major', chords: [] },
          ],
          modulations: [
            { atIndex: 107, fromKey: 'Eb major', toKey: 'B major' },
            { atIndex: 108, fromKey: 'B major', toKey: 'E major' },
          ],
        },
      },
      sheetMusicPitchShiftSemitones: 0,
      beatToChordSequenceMap: Object.fromEntries(Array.from({ length: 109 }, (_, index) => [index, index])),
      notationBeatOffset: 0,
      shiftedOriginalChords: Array.from({ length: 109 }, () => 'C'),
    });

    expect(keySections).toEqual([
      { startBeatIndex: 0, keySignature: 'E major' },
      { startBeatIndex: 100, keySignature: 'Eb major' },
      { startBeatIndex: 107, keySignature: 'B major' },
      { startBeatIndex: 108, keySignature: 'E major' },
    ]);
  });
});
