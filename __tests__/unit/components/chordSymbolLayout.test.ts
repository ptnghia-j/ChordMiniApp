import { configureOsmdChordSymbolRules } from '@/components/piano-visualizer/sheet-music-display/chordSymbolLayout';

describe('configureOsmdChordSymbolRules', () => {
  it('uses compact unicode accidentals for chord symbols without relying on manual x-shifts', () => {
    const resetChordAccidentalTexts = jest.fn();
    const engravingRules = {
      ChordAccidentalTexts: {},
      resetChordAccidentalTexts,
      ChordSymbolTextHeight: 2,
      ChordSymbolXSpacing: 1,
      ChordOverlapAllowedIntoNextMeasure: 0,
      ChordSymbolRelativeXOffset: -1,
      ChordSymbolExtraXShiftForShortChordSymbols: 0.3,
      DefaultFontFamily: 'Times New Roman',
    };
    const runtimeRules = {
      ChordAccidentalTexts: {},
      resetChordAccidentalTexts: jest.fn(),
      ChordSymbolTextHeight: 2,
      ChordSymbolXSpacing: 1,
      ChordOverlapAllowedIntoNextMeasure: 0,
      ChordSymbolRelativeXOffset: -1,
      ChordSymbolExtraXShiftForShortChordSymbols: 0.3,
      DefaultFontFamily: 'Times New Roman',
    };

    configureOsmdChordSymbolRules({ EngravingRules: engravingRules, rules: runtimeRules });

    expect(resetChordAccidentalTexts).toHaveBeenCalledWith(engravingRules.ChordAccidentalTexts, true);
    expect(runtimeRules.resetChordAccidentalTexts).toHaveBeenCalledWith(runtimeRules.ChordAccidentalTexts, true);
    expect(engravingRules.DefaultFontFamily).toBe('Helvetica Neue, Helvetica, Arial, sans-serif');
    expect(runtimeRules.DefaultFontFamily).toBe('Helvetica Neue, Helvetica, Arial, sans-serif');
    expect(engravingRules.ChordSymbolTextHeight).toBeLessThanOrEqual(1.58);
    expect(runtimeRules.ChordSymbolTextHeight).toBeLessThanOrEqual(1.58);
    expect(engravingRules.ChordSymbolXSpacing).toBeGreaterThanOrEqual(1.55);
    expect(runtimeRules.ChordSymbolXSpacing).toBeGreaterThanOrEqual(1.55);
    expect(engravingRules.ChordOverlapAllowedIntoNextMeasure).toBeLessThanOrEqual(-1.8);
    expect(runtimeRules.ChordOverlapAllowedIntoNextMeasure).toBeLessThanOrEqual(-1.8);
    expect(engravingRules.ChordSymbolRelativeXOffset).toBeLessThanOrEqual(-1.05);
    expect(runtimeRules.ChordSymbolRelativeXOffset).toBeLessThanOrEqual(-1.05);
  });
});
