import {
  buildGuitarStrumPattern,
  countAnchorFingerChanges,
  resolveGuitarShapeChordName,
  resolveGuitarStrumDrive,
  resolveGuitarVoicing,
  suggestCapoPosition,
} from '@/utils/guitarVoicing';
import { chordMappingService } from '@/services/chord-analysis/chordMappingService';

describe('guitarVoicing', () => {
  it('resolves open G major from diagram midi in low-to-high string order', () => {
    const voicing = resolveGuitarVoicing('G');

    expect(voicing).toBeDefined();
    expect(voicing?.source).toBe('diagram');
    expect(voicing?.midi).toEqual([43, 47, 50, 55, 59, 67]);
    expect(voicing?.noteNames).toEqual(['G2', 'B2', 'D3', 'G3', 'B3', 'G4']);
  });

  it('keeps muted strings out of the resolved voicing', () => {
    const voicing = resolveGuitarVoicing('C');

    expect(voicing?.midi).toEqual([48, 52, 55, 60, 64]);
    expect(voicing?.noteNames).toEqual(['C3', 'E3', 'G3', 'C4', 'E4']);
  });

  it('transposes diagram midi upward when capo is applied', () => {
    const voicing = resolveGuitarVoicing('D', { capoFret: 2 });

    expect(resolveGuitarShapeChordName('D', 2)).toBe('C');
    expect(voicing?.shapeChordName).toBe('C');
    expect(voicing?.midi).toEqual([50, 54, 57, 62, 66]);
    expect(voicing?.noteNames).toEqual(['D3', 'F#3', 'A3', 'D4', 'F#4']);
  });

  it('uses the selected diagram position when multiple positions exist', () => {
    const voicing = resolveGuitarVoicing('G', {
      selectedPositions: { G: 1 },
    });

    expect(voicing).toBeDefined();
    expect(voicing?.positionIndex).toBe(1);
    expect(voicing?.midi).not.toEqual([43, 47, 50, 55, 59, 67]);
  });

  it('falls back to parsed chord tones when the diagram database has no voicing', () => {
    const spy = jest.spyOn(chordMappingService, 'getChordDataSync').mockReturnValueOnce(null);
    const voicing = resolveGuitarVoicing('Cm13');

    expect(voicing).toBeDefined();
    expect(voicing?.source).toBe('fallback');
    expect(voicing?.noteNames).toContain('C4');
    spy.mockRestore();
  });

  it('suggests the capo that minimizes barre-heavy practical shapes within range', () => {
    const openShape = {
      key: 'C',
      suffix: 'major',
      positions: [{ frets: [-1, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0], baseFret: 1, barres: [] }],
    };
    const lowBarreShape = {
      key: 'B',
      suffix: 'minor',
      positions: [{ frets: [-1, 2, 4, 4, 3, 2], fingers: [0, 1, 3, 4, 2, 1], baseFret: 2, barres: [1] }],
    };
    const highBarreShape = {
      key: 'F',
      suffix: 'major',
      positions: [{ frets: [1, 3, 3, 2, 1, 1], fingers: [1, 3, 4, 2, 1, 1], baseFret: 5, barres: [1] }],
    };

    const spy = jest.spyOn(chordMappingService, 'getChordDataSync').mockImplementation((shapeChordName: string) => {
      if (['E', 'A', 'D', 'G', 'C', 'Am'].includes(shapeChordName)) {
        return openShape;
      }

      if (shapeChordName === 'Bm') {
        return lowBarreShape;
      }

      if (['B', 'C#m', 'F'].includes(shapeChordName)) {
        return highBarreShape;
      }

      return null;
    });

    const suggestion = suggestCapoPosition(['E', 'B', 'C#m', 'A'], {
      maxCapo: 4,
      targetKey: 'E',
    });

    expect(suggestion?.capoFret).toBe(2);
    expect(suggestion?.barreShapes).toBe(1);

    spy.mockRestore();
  });

  it('returns no strums for empty or invalid timing inputs', () => {
    expect(buildGuitarStrumPattern(0, 0.5, 4)).toEqual([]);
    expect(buildGuitarStrumPattern(1, 0, 4)).toEqual([]);
    expect(buildGuitarStrumPattern(-1, 0.5, 4)).toEqual([]);
  });

  it('adds the short-chord syncopated upstrum when transitions allow it', () => {
    expect(buildGuitarStrumPattern(1, 0.5, 4, undefined, { allowShortMeasureUpstrum: true })).toEqual([
      { startOffset: 0, direction: 'down' },
      { startOffset: 0.75, direction: 'up' },
    ]);
  });

  it('suppresses the short-chord upstrum when transitions are hard', () => {
    expect(buildGuitarStrumPattern(1, 0.5, 4, undefined, { allowShortMeasureUpstrum: false })).toEqual([
      { startOffset: 0, direction: 'down' },
    ]);
  });

  it('returns sorted in-bounds strokes for longer patterns without duplicate offsets', () => {
    const strokes = buildGuitarStrumPattern(3.25, 0.5, 4, {
      energy: 0.72,
      spectralFlux: 0.74,
      onsetStrength: 0.7,
      intensity: 0.74,
      normalizedIntensity: 0.74,
      quietness: 0.16,
      fullness: 0.78,
      motion: 0.74,
      attack: 0.7,
      intensityBand: 'loud',
    });

    expect(strokes.length).toBeGreaterThan(0);
    expect(strokes[0]).toEqual({ startOffset: 0, direction: 'down' });
    expect(strokes.every((stroke) => stroke.startOffset >= 0 && stroke.startOffset < 3.25)).toBe(true);
    expect(strokes.every((stroke, index) => index === 0 || stroke.startOffset > strokes[index - 1].startOffset)).toBe(true);
  });

  it('keeps generic-meter strokes on beat-aligned or half-beat boundaries', () => {
    const strokes = buildGuitarStrumPattern(2.5, 0.5, 5, {
      energy: 0.72,
      spectralFlux: 0.74,
      onsetStrength: 0.7,
      intensity: 0.74,
      normalizedIntensity: 0.74,
      quietness: 0.16,
      fullness: 0.78,
      motion: 0.74,
      attack: 0.7,
      intensityBand: 'loud',
    });

    expect(strokes.length).toBeGreaterThan(0);
    expect(strokes.every((stroke) => Number.isInteger(stroke.startOffset / 0.25))).toBe(true);
  });

  it('raises strum drive for louder fuller signals than quiet sparse signals', () => {
    const quietDrive = resolveGuitarStrumDrive({
      energy: 0.12,
      spectralFlux: 0.15,
      onsetStrength: 0.12,
      intensity: 0.1,
      normalizedIntensity: 0.1,
      quietness: 1,
      fullness: 0.04,
      motion: 0.18,
      attack: 0.12,
      intensityBand: 'quiet',
    });
    const loudDrive = resolveGuitarStrumDrive({
      energy: 0.72,
      spectralFlux: 0.74,
      onsetStrength: 0.7,
      intensity: 0.74,
      normalizedIntensity: 0.74,
      quietness: 0.16,
      fullness: 0.78,
      motion: 0.74,
      attack: 0.7,
      intensityBand: 'loud',
    });

    expect(quietDrive).toBeGreaterThanOrEqual(0);
    expect(loudDrive).toBeLessThanOrEqual(1);
    expect(loudDrive).toBeGreaterThan(quietDrive);
  });

  it('reports a hard short-chord transition for diagram voicings with many anchor changes', () => {
    const current = resolveGuitarVoicing('G');
    const next = resolveGuitarVoicing('C');
    const anchorChanges = countAnchorFingerChanges(current, next);

    expect(anchorChanges).not.toBeNull();
    expect(anchorChanges!).toBeGreaterThan(2);
  });
});
