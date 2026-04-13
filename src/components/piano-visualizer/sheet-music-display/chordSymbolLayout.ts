type EngravingRulesLike = {
  ChordAccidentalTexts?: unknown;
  ChordSymbolLabelTexts?: unknown;
  resetChordAccidentalTexts?: (dictionary: unknown, useUnicode: boolean) => void;
  resetChordSymbolLabelTexts?: (dictionary: unknown) => void;
  ChordSymbolTextHeight?: number;
  ChordSymbolXSpacing?: number;
  ChordOverlapAllowedIntoNextMeasure?: number;
  ChordSymbolRelativeXOffset?: number;
  ChordSymbolExtraXShiftForShortChordSymbols?: number;
  DefaultFontFamily?: string;
};

const COMPACT_CHORD_SYMBOL_TEXT_HEIGHT = 1.58;
const CHORD_SYMBOL_FONT_FAMILY = 'Helvetica Neue, Helvetica, Arial, sans-serif';

const UNICODE_CHORD_ACCIDENTALS: Array<[string, string]> = [
  ['b', '♭'],
  ['bb', '𝄫'],
  ['#', '♯'],
  ['##', '𝄪'],
  ['x', '𝄪'],
];

function enforceUnicodeChordAccidentalTexts(dictionary: unknown): void {
  if (!dictionary || typeof dictionary !== 'object') {
    return;
  }

  const mutableDictionary = dictionary as {
    setValue?: (key: string, value: string) => void;
    set?: (key: string, value: string) => void;
    [key: string]: unknown;
  };

  UNICODE_CHORD_ACCIDENTALS.forEach(([token, symbol]) => {
    if (typeof mutableDictionary.setValue === 'function') {
      mutableDictionary.setValue(token, symbol);
    }
    if (typeof mutableDictionary.set === 'function') {
      mutableDictionary.set(token, symbol);
    }

    mutableDictionary[token] = symbol;
  });
}

function getPrimaryEngravingRules(instance: unknown): EngravingRulesLike | null {
  const candidate = instance as { EngravingRules?: EngravingRulesLike; rules?: EngravingRulesLike } | null;
  return candidate?.EngravingRules ?? candidate?.rules ?? null;
}

function applyChordSymbolRuleOverrides(rules: EngravingRulesLike): void {
  if (rules.ChordAccidentalTexts) {
    if (typeof rules.resetChordAccidentalTexts === 'function') {
      rules.resetChordAccidentalTexts(rules.ChordAccidentalTexts, true);
    }

    // Some OSMD builds still keep ASCII fallback accidentals after reset;
    // force unicode symbols so chord labels render ♭/♯ instead of b/#.
    enforceUnicodeChordAccidentalTexts(rules.ChordAccidentalTexts);

    // Refresh chord-kind label text dictionary (e.g. half-diminished m7♭5)
    // after updating accidental symbols, otherwise it can keep stale ASCII "b".
    if (typeof rules.resetChordSymbolLabelTexts === 'function' && rules.ChordSymbolLabelTexts) {
      rules.resetChordSymbolLabelTexts(rules.ChordSymbolLabelTexts);
    }
  }

  rules.DefaultFontFamily = CHORD_SYMBOL_FONT_FAMILY;
  rules.ChordSymbolTextHeight = Math.min(
    rules.ChordSymbolTextHeight ?? 2,
    COMPACT_CHORD_SYMBOL_TEXT_HEIGHT,
  );
  rules.ChordSymbolXSpacing = Math.max(rules.ChordSymbolXSpacing ?? 1, 1.55);
  rules.ChordOverlapAllowedIntoNextMeasure = Math.min(rules.ChordOverlapAllowedIntoNextMeasure ?? 0, -1.8);
  rules.ChordSymbolRelativeXOffset = Math.min(rules.ChordSymbolRelativeXOffset ?? -1, -1.05);
  rules.ChordSymbolExtraXShiftForShortChordSymbols = Math.max(
    rules.ChordSymbolExtraXShiftForShortChordSymbols ?? 0.3,
    0.45,
  );
}

export function configureOsmdChordSymbolRules(osmd: unknown): void {
  const candidate = osmd as { EngravingRules?: EngravingRulesLike; rules?: EngravingRulesLike } | null;
  const primaryRules = getPrimaryEngravingRules(osmd);
  if (primaryRules) {
    applyChordSymbolRuleOverrides(primaryRules);
  }

  if (candidate?.rules && candidate.rules !== primaryRules) {
    applyChordSymbolRuleOverrides(candidate.rules);
  }

  if (candidate?.EngravingRules && candidate.EngravingRules !== primaryRules && candidate.EngravingRules !== candidate?.rules) {
    applyChordSymbolRuleOverrides(candidate.EngravingRules);
  }
}
