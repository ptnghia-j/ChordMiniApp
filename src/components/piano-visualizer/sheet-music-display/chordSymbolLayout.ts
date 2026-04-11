type EngravingRulesLike = {
  ChordAccidentalTexts?: unknown;
  resetChordAccidentalTexts?: (dictionary: unknown, useUnicode: boolean) => void;
  ChordSymbolTextHeight?: number;
  ChordSymbolXSpacing?: number;
  ChordOverlapAllowedIntoNextMeasure?: number;
  ChordSymbolRelativeXOffset?: number;
  ChordSymbolExtraXShiftForShortChordSymbols?: number;
  DefaultFontFamily?: string;
};

const COMPACT_CHORD_SYMBOL_TEXT_HEIGHT = 1.58;
const CHORD_SYMBOL_FONT_FAMILY = 'Helvetica Neue, Helvetica, Arial, sans-serif';

function getPrimaryEngravingRules(instance: unknown): EngravingRulesLike | null {
  const candidate = instance as { EngravingRules?: EngravingRulesLike; rules?: EngravingRulesLike } | null;
  return candidate?.EngravingRules ?? candidate?.rules ?? null;
}

function applyChordSymbolRuleOverrides(rules: EngravingRulesLike): void {
  if (typeof rules.resetChordAccidentalTexts === 'function' && rules.ChordAccidentalTexts) {
    rules.resetChordAccidentalTexts(rules.ChordAccidentalTexts, true);
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
